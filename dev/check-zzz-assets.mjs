/* 检查爱芮静态资源是否齐全、Spine 数据是否可解析（不依赖浏览器） */
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] || '.'
const dir = path.join(root, 'assets', 'zzz')
const must = [
  'pet.js',
  'airui-idle.png',
  'airui/airui.json',
  'airui/airui.atlas',
  'airui/airui.png',
  'airui/airui_2.png',
  'runtime/spine-webgl.min.js',
]
let bad = 0
for (const rel of must) {
  const p = path.join(dir, rel)
  const ok = fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0
  if (!ok) bad++
  console.log((ok ? 'OK  ' : 'MISS') + '  ' + rel + (ok ? '  ' + (fs.statSync(p).size / 1024).toFixed(0) + 'KB' : ''))
}
const json = JSON.parse(fs.readFileSync(path.join(dir, 'airui/airui.json'), 'utf8'))
const anims = Object.keys(json.animations || {})
const need = ['动作_待机', '动作_兴奋', '动作_害羞', '动作_生气', '动作_自信', '动作_无奈', '表情_常态', '表情_兴奋', '表情_生气']
const missing = need.filter((n) => !anims.includes(n))
console.log('spine=' + json.skeleton.spine + ' bones=' + json.bones.length + ' anims=' + anims.length)
console.log(missing.length ? 'MISSING ANIMS: ' + missing.join(',') : 'all needed animations present')
const atlas = fs.readFileSync(path.join(dir, 'airui/airui.atlas'), 'utf8')
console.log(atlas.includes('airui.png') && atlas.includes('airui_2.png') ? 'atlas pages OK' : 'atlas pages BAD')
process.exit(bad || missing.length ? 1 : 0)
