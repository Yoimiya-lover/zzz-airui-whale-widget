/*!
 * 爱芮 · 实时 Spine 挂件渲染层
 * 素材来源：《绝区零》官方活动（版权归米哈游）；骨架数据取自
 *   HanaAyane/ZZZ-Idol-Desktop-Pet（非官方同人项目）
 * 运行时：@esotericsoftware/spine-webgl 4.2.42（Spine Runtimes License）
 *
 * 设计要点：
 *  - 视觉用 canvas；原插件那张 <img> 保留为“透明命中层”（只负责逐像素命中与 clip-path），
 *    因此拖拽 / 贴边翻转 / Q 弹 / 气泡定位全部沿用上游代码。
 *  - 身体动作走 track 0、表情走 track 1，与桌宠 AnimationMixer 相同的双轨结构。
 *  - 视线跟随用骨架自带的“眼部控制器”骨。
 */
(function () {
  'use strict'

  var BASE = '/dsh-whale/zzz/'
  var RUNTIME_SRC = BASE + 'runtime/spine-webgl.min.js'
  var ROLE_ID = 'airui'
  var ASSET_DIR = BASE + 'airui/'
  var STILL_URL = BASE + 'airui-idle.png'
  var PAD = 1.02
  var GAZE_BONE = '眼部控制器'
  var GAZE_UNITS = 11
  var GAZE_SMOOTHING = 11
  var IDLE_BODY = '动作_待机'
  var IDLE_FACE = '表情_常态'

  var runtimePromise = null
  var mount = null
  var clickTimes = []
  var lastClickAt = 0

  function log() {
    try {
      if (window.console && console.debug) console.debug.apply(console, ['[zzz-pet]'].concat([].slice.call(arguments)))
    } catch (err) {}
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script')
      s.src = src
      s.async = false
      s.onload = function () { resolve() }
      s.onerror = function () { reject(new Error('load failed: ' + src)) }
      document.head.appendChild(s)
    })
  }

  function ensureRuntime() {
    if (window.spine && window.spine.SceneRenderer) return Promise.resolve()
    if (!runtimePromise) runtimePromise = loadScript(RUNTIME_SRC)
    return runtimePromise
  }

  function Pet(canvas) {
    this.canvas = canvas
    this.gl = null
    this.renderer = null
    this.manager = null
    this.data = null
    this.skeleton = null
    this.state = null
    this.gazeBone = null
    this.gazeBase = null
    this.gazeTarget = { x: 0, y: 0 }
    this.gaze = { x: 0, y: 0 }
    this.raf = 0
    this.last = 0
    this.dead = false
    this.ready = false
    this.hover = false
    this.boundPointer = this.onPointerMove.bind(this)
  }

  Pet.prototype.init = function () {
    var self = this
    var canvas = this.canvas
    var opts = { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false }
    var gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts)
    if (!gl) throw new Error('WebGL unavailable')
    this.gl = gl
    var renderer = new window.spine.SceneRenderer(canvas, gl)
    renderer.skeletonRenderer.premultipliedAlpha = true
    this.renderer = renderer

    var manager = new window.spine.AssetManager(gl, ASSET_DIR)
    manager.loadText('airui.json')
    manager.loadTextureAtlas('airui.atlas')
    this.manager = manager
    return manager.loadAll().then(function () {
      if (manager.hasErrors && manager.hasErrors()) throw new Error('asset error: ' + JSON.stringify(manager.getErrors()))
      if (self.dead) return
      var atlas = manager.require('airui.atlas')
      var json = manager.require('airui.json')
      var loader = new window.spine.AtlasAttachmentLoader(atlas)
      self.data = new window.spine.SkeletonJson(loader).readSkeletonData(json)
      self.skeleton = new window.spine.Skeleton(self.data)
      self.state = new window.spine.AnimationState(new window.spine.AnimationStateData(self.data))
      self.state.data.defaultMix = 0.16

      var skin = self.data.findSkin('朝左') || self.data.findSkin('default')
      if (skin) self.skeleton.setSkin(skin)
      self.skeleton.setToSetupPose()
      self.state.setAnimation(0, IDLE_BODY, true)
      self.state.setAnimation(1, IDLE_FACE, true)
      self.state.apply(self.skeleton)
      self.skeleton.updateWorldTransform(window.spine.Physics.update)

      self.gazeBone = self.skeleton.findBone(GAZE_BONE)
      if (self.gazeBone) self.gazeBase = { x: self.gazeBone.x, y: self.gazeBone.y }

      self.fit()
      self.state.addListener({
        complete: function (entry) {
          if (!entry || entry.trackIndex !== 0) return
          var anim = entry.animation
          if (anim && anim.name !== IDLE_BODY) self.playIdle()
        },
      })
      self.ready = true
      self.start()
      log('ready', self.data.bones.length + ' bones')
    })
  }

  Pet.prototype.fit = function () {
    var offset = new window.spine.Vector2()
    var size = new window.spine.Vector2()
    this.skeleton.getBounds(offset, size, [])
    var w = Math.max(1, size.x)
    var h = Math.max(1, size.y)
    this.side = Math.max(w, h) * PAD
    this.centerX = offset.x + w / 2
    this.centerY = offset.y + h / 2
    this.bounds = { x: offset.x, y: offset.y, w: w, h: h }
    this.syncSize()
  }

  // SceneRenderer.resize() 会把 camera 视口改成画布的**像素尺寸**，
  // 所以顺序必须是：先 resize（同步位图 / gl.viewport），再按世界尺寸重设相机。
  Pet.prototype.syncSize = function () {
    var canvas = this.canvas
    if (!canvas.clientWidth || !canvas.clientHeight || !this.side) return
    this.renderer.resize(window.spine.ResizeMode.Expand)
    var cam = this.renderer.camera
    cam.setViewport(this.side, this.side)
    cam.position.x = this.centerX
    cam.position.y = this.centerY
    cam.update()
  }

  Pet.prototype.playIdle = function () {
    if (!this.state) return
    this.state.setAnimation(0, IDLE_BODY, true)
    this.state.setAnimation(1, IDLE_FACE, true)
  }

  Pet.prototype.playOnce = function (body, face) {
    if (!this.state) return
    var anim = this.data.findAnimation(body)
    if (!anim) return
    this.state.clearTrack(1)
    this.state.setAnimation(0, body, false)
    if (face && this.data.findAnimation(face)) this.state.setAnimation(1, face, true)
  }

  Pet.prototype.onPointerMove = function (e) {
    if (!this.ready || !this.skeleton) return
    try {
      var rect = this.canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      var cx = rect.left + rect.width / 2
      var cy = rect.top + rect.height * 0.42
      var nx = (e.clientX - cx) / Math.max(rect.width * 0.55, 1)
      var ny = (cy - e.clientY) / Math.max(rect.height * 0.55, 1)
      var len = Math.sqrt(nx * nx + ny * ny)
      if (len < 0.001) { this.gazeTarget.x = 0; this.gazeTarget.y = 0; return }
      var limit = Math.max(1, len)
      this.gazeTarget.x = nx / limit
      this.gazeTarget.y = ny / limit
    } catch (err) {}
  }

  Pet.prototype.applyGaze = function (dt) {
    var bone = this.gazeBone
    if (!bone || !this.gazeBase) return false
    var k = 1 - Math.exp(-GAZE_SMOOTHING * dt)
    this.gaze.x += (this.gazeTarget.x - this.gaze.x) * k
    this.gaze.y += (this.gazeTarget.y - this.gaze.y) * k
    var flipped = false
    try {
      var root = this.canvas.closest('.dshwv-root')
      flipped = !!(root && root.classList.contains('dshwv-left'))
    } catch (err) {}
    var dir = flipped ? -1 : 1
    bone.x = this.gazeBase.x + this.gaze.x * GAZE_UNITS * dir
    bone.y = this.gazeBase.y + this.gaze.y * GAZE_UNITS
    this.lastGaze = { dx: +(bone.x - this.gazeBase.x).toFixed(2), dy: +(bone.y - this.gazeBase.y).toFixed(2) }
    return true
  }

  Pet.prototype.start = function () {
    var self = this
    this.last = performance.now()
    function tick(now) {
      if (self.dead) return
      self.raf = requestAnimationFrame(tick)
      var dt = Math.min(0.05, Math.max(0, (now - self.last) / 1000))
      self.last = now
      self.render(dt)
    }
    this.raf = requestAnimationFrame(tick)
    document.addEventListener('pointermove', this.boundPointer, { passive: true })
    // 挂件缩放（root 宽度变化）时画布 CSS 尺寸会变：重新同步位图与相机视口
    try {
      if (window.ResizeObserver) {
        var self2 = this
        this.ro = new ResizeObserver(function () { self2.syncSize() })
        this.ro.observe(this.canvas)
      }
    } catch (err) {}
  }

  Pet.prototype.render = function (dt) {
    if (!this.ready || !this.state) return
    // 挂件被隐藏（display:none 或移出文档）时不烧 GPU
    if (!this.canvas.isConnected || !this.canvas.offsetParent) return
    var gl = this.gl
    this.state.update(dt)
    this.state.apply(this.skeleton)
    this.skeleton.updateWorldTransform(window.spine.Physics.update)
    // 视线：先按物理步进拿到本帧姿势，再叠加眼部控制器偏移，用 pose 模式重算世界变换
    //（与桌宠 SpineRenderer 的做法一致；Physics.update 会把手工偏移覆盖掉）
    var gazing = this.applyGaze(dt)
    if (gazing) this.skeleton.updateWorldTransform(window.spine.Physics.pose)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this.renderer.begin()
    this.renderer.drawSkeleton(this.skeleton, true)
    this.renderer.end()
    if (gazing) {
      this.gazeBone.x = this.gazeBase.x
      this.gazeBone.y = this.gazeBase.y
    }
  }

  Pet.prototype.dispose = function () {
    this.dead = true
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    try { if (this.ro) this.ro.disconnect() } catch (err) {}
    document.removeEventListener('pointermove', this.boundPointer)
    try { if (this.manager) this.manager.dispose() } catch (err) {}
    try { if (this.renderer) this.renderer.dispose() } catch (err) {}
    try {
      var ext = this.gl && this.gl.getExtension('WEBGL_lose_context')
      if (ext) ext.loseContext()
    } catch (err) {}
    this.ready = false
  }

  function widgetBody() {
    return document.querySelector('.dshwv-body')
  }

  function widgetImage() {
    return document.querySelector('.dshwv-img')
  }

  function ensureCanvas() {
    var body = widgetBody()
    if (!body) return null
    var canvas = body.querySelector('.dshwv-canvas')
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.className = 'dshwv-canvas'
      var img = widgetImage()
      if (img && img.nextSibling) body.insertBefore(canvas, img.nextSibling)
      else body.appendChild(canvas)
    }
    return canvas
  }

  function setImageVisible(visible) {
    var img = widgetImage()
    if (!img) return
    img.style.opacity = visible ? '' : '0'
    // 命中与裁剪完全交给透明命中层；视觉由 canvas 负责
  }

  function activate() {
    if (mount) return Promise.resolve()
    var canvas = ensureCanvas()
    if (!canvas) return Promise.resolve()
    setImageVisible(false)
    return ensureRuntime()
      .then(function () {
        if (mount) return
        var pet = new Pet(canvas)
        mount = pet
        return pet.init().catch(function (err) {
          log('init failed, fallback to still image', err && err.message)
          pet.dispose()
          mount = null
          setImageVisible(true)
          if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
        })
      })
      .catch(function (err) {
        log('runtime failed, fallback to still image', err && err.message)
        setImageVisible(true)
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
      })
  }

  function deactivate() {
    if (mount) {
      mount.dispose()
      mount = null
    }
    var canvas = document.querySelector('.dshwv-canvas')
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
    if (sayEl && sayEl.parentNode) sayEl.parentNode.removeChild(sayEl)
    sayEl = null
    if (sayTimer) { clearTimeout(sayTimer); sayTimer = 0 }
    setImageVisible(true)
  }

  var LINES = {
    angry: ['别戳了！再戳要生气了！', '喂——！手要戳秃了！', '再点我就罢工啦！'],
    cost: ['这一轮又花掉 {cost} 元…', '唔，{cost} 元没了…', '记得省着点哦，{cost} 元呢。'],
    low: ['余额快见底了，省着点用…', '不够花了要叫我哦。', '钱包在报警了…'],
  }

  function pickLine(kind) {
    var arr = LINES[kind]
    if (!arr || !arr.length) return ''
    return arr[Math.floor(Math.random() * arr.length)]
  }

  var sayEl = null
  var sayTimer = 0

  function say(text) {
    if (!text) return
    try {
      var body = widgetBody()
      if (!body) return
      if (!sayEl) {
        sayEl = document.createElement('div')
        sayEl.className = 'dshwv-zzz-say'
        sayEl.style.cssText = [
          'position:absolute', 'right:58%', 'bottom:calc(59.45% - 6px)', 'max-width:64%',
          'padding:7px 10px', 'border-radius:14px', 'background:#fff', 'border:3px solid #203170',
          'color:#203170', 'font-size:12px', 'line-height:1.35', 'box-shadow:0 3px 10px rgba(20,30,70,.18)',
          'pointer-events:none', 'opacity:0', 'transform:translateY(4px) scale(.96)',
          'transition:opacity .16s ease,transform .16s ease', 'z-index:5', 'white-space:normal',
        ].join(';')
        body.appendChild(sayEl)
      }
      sayEl.textContent = text
      sayEl.style.opacity = '1'
      sayEl.style.transform = 'translateY(0) scale(1)'
      if (sayTimer) clearTimeout(sayTimer)
      sayTimer = setTimeout(function () {
        try {
          sayEl.style.opacity = '0'
          sayEl.style.transform = 'translateY(4px) scale(.96)'
        } catch (err) {}
      }, 2600)
    } catch (err) {}
  }

  function onClick() {
    if (!mount || !mount.ready) return
    var now = Date.now()
    clickTimes.push(now)
    while (clickTimes.length && now - clickTimes[0] > 4000) clickTimes.shift()
    var rapid = clickTimes.length >= 6
    var double = now - lastClickAt < 300
    lastClickAt = now
    if (rapid) {
      clickTimes = []
      mount.playOnce('动作_生气', '表情_生气')
      say(pickLine('angry'))
    } else if (double) {
      mount.playOnce('动作_自信', '表情_自信')
    } else {
      mount.playOnce('动作_兴奋', '表情_兴奋')
    }
  }

  function notify(kind, value) {
    if (!mount || !mount.ready) return
    if (kind === 'cost') {
      mount.playOnce('动作_无奈', '表情_无奈')
      var amount = Number(value)
      say(pickLine('cost').replace('{cost}', isFinite(amount) ? amount.toFixed(2) : '?'))
    } else if (kind === 'lowbalance') {
      mount.playOnce('动作_生气', '表情_生气')
      say(pickLine('low'))
    } else if (kind === 'recharge') {
      mount.playOnce('动作_自信', '表情_自信')
    }
  }

  function setRole(id) {
    if (id === ROLE_ID) {
      activate()
      return
    }
    deactivate()
  }

  window.ZZZPet = {
    id: ROLE_ID,
    stillUrl: STILL_URL,
    setRole: setRole,
    onClick: onClick,
    notify: notify,
    isActive: function () { return !!(mount && mount.ready) },
    debug: function () {
      if (!mount) return null
      var cam = mount.renderer.camera
      return {
        bw: mount.canvas.width,
        bh: mount.canvas.height,
        cssW: mount.canvas.clientWidth,
        styleW: mount.canvas.style.width,
        side: mount.side,
        camVW: cam.viewportWidth,
        camVH: cam.viewportHeight,
        glVW: mount.gl.drawingBufferWidth,
        glVH: mount.gl.drawingBufferHeight,
        bounds: mount.bounds,
        anim: (function () {
          try {
            var e = mount.state.getCurrent(0)
            var f = mount.state.getCurrent(1)
            return { body: e && e.animation ? e.animation.name : '', face: f && f.animation ? f.animation.name : '' }
          } catch (err) { return null }
        })(),
        gaze: mount.gazeBone && mount.gazeBase ? {
          dx: mount.lastGaze ? mount.lastGaze.dx : 0,
          dy: mount.lastGaze ? mount.lastGaze.dy : 0,
          tx: +mount.gazeTarget.x.toFixed(2),
          ty: +mount.gazeTarget.y.toFixed(2),
        } : null,
      }
    },
  }
})()
