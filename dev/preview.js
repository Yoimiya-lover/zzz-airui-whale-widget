/* 最小 Spine 预览：加载爱芮骨架，待机 + 表情双轨，自动取景到 610×610 */
(async function () {
  const logEl = document.getElementById('log')
  const lines = []
  const log = (s) => { lines.push(s); logEl.textContent = lines.join('\n'); console.log(s) }
  const fail = (s) => { lines.push('ERROR: ' + s); logEl.textContent = lines.join('\n'); }

  try {
    const canvas = document.getElementById('stage')
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true }) ||
      canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true })
    if (!gl) { fail('no webgl'); return }
    log('webgl: ' + (gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1'))
    log('renderer: ' + gl.getParameter(gl.RENDERER))

    const renderer = new spine.SceneRenderer(canvas, gl)
    renderer.skeletonRenderer.premultipliedAlpha = true
    const am = new spine.AssetManager(gl, '/assets/zzz/airui/')
    am.loadText('airui.json')
    am.loadTextureAtlas('airui.atlas')
    await am.loadAll()
    if (am.hasErrors()) { fail(JSON.stringify(am.getErrors())); return }
    log('assets loaded')

    const atlas = am.require('airui.atlas')
    const json = am.require('airui.json')
    const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json)
    log('skeleton: bones=' + data.bones.length + ' slots=' + data.slots.length +
      ' skins=' + data.skins.map((s) => s.name).join(',') +
      ' anims=' + data.animations.map((a) => a.name).join(','))

    const skeleton = new spine.Skeleton(data)
    const state = new spine.AnimationState(new spine.AnimationStateData(data))
    state.data.defaultMix = 0.2

    const skin = skeleton.data.findSkin('朝左')
    if (skin) skeleton.setSkin(skin)
    skeleton.setToSetupPose()
    state.setAnimation(0, '动作_待机', true)
    state.setAnimation(1, '表情_常态', true)
    state.apply(skeleton)
    skeleton.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined)

    const offset = new spine.Vector2()
    const size = new spine.Vector2()
    skeleton.getBounds(offset, size, [])
    log('bounds: x=' + offset.x.toFixed(1) + ' y=' + offset.y.toFixed(1) +
      ' w=' + size.x.toFixed(1) + ' h=' + size.y.toFixed(1))

    const pad = 1.08
    const vw = Math.max(size.x, size.y) * pad
    renderer.camera.viewportWidth = vw
    renderer.camera.viewportHeight = vw
    renderer.camera.position.x = offset.x + size.x / 2
    renderer.camera.position.y = offset.y + size.y / 2
    renderer.resize(spine.ResizeMode.Expand)
    log('camera: ' + vw.toFixed(1))

    let last = performance.now()
    let frames = 0
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      state.update(dt)
      state.apply(skeleton)
      skeleton.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined)
      renderer.begin()
      renderer.drawSkeleton(skeleton, true)
      renderer.end()
      frames++
      if (frames === 30) log('rendering ok (30 frames)')
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  } catch (err) {
    fail((err && err.stack) || String(err))
  }
})()
