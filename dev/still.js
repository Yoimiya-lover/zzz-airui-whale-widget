/* 渲染一帧静帧（透明背景），用于生成命中图与加载占位图 */
(async function () {
  const canvas = document.getElementById('stage')
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true }) ||
    canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true })
  if (!gl) return
  const renderer = new spine.SceneRenderer(canvas, gl)
  renderer.skeletonRenderer.premultipliedAlpha = true
  const am = new spine.AssetManager(gl, '/assets/zzz/airui/')
  am.loadText('airui.json')
  am.loadTextureAtlas('airui.atlas')
  await am.loadAll()
  const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(am.require('airui.atlas'))).readSkeletonData(am.require('airui.json'))
  const skeleton = new spine.Skeleton(data)
  const state = new spine.AnimationState(new spine.AnimationStateData(data))
  const skin = skeleton.data.findSkin('朝左')
  if (skin) skeleton.setSkin(skin)
  skeleton.setToSetupPose()
  state.setAnimation(0, '动作_待机', true)
  state.setAnimation(1, '表情_常态', true)

  // 推进到待机中段的自然姿势
  state.update(0.35)
  state.apply(skeleton)
  skeleton.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined)

  const offset = new spine.Vector2()
  const size = new spine.Vector2()
  skeleton.getBounds(offset, size, [])
  const vw = Math.max(size.x, size.y) * 1.02
  renderer.camera.viewportWidth = vw
  renderer.camera.viewportHeight = vw
  renderer.camera.position.x = offset.x + size.x / 2
  renderer.camera.position.y = offset.y + size.y / 2
  renderer.resize(spine.ResizeMode.Expand)

  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  renderer.begin()
  renderer.drawSkeleton(skeleton, true)
  renderer.end()

  document.title = 'ready'
  document.body.dataset.ready = '1'
})()
