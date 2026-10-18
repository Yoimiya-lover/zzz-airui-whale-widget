/* 宿主侧自检：用最小 Cordis 桩加载 lib/index.js，验证路由 / 角色表 / 注入行。
 * 不启动 DSH，也不碰真实 ~/.dsh（DSH_HOME 指向 test/dsh-home）。 */
import path from 'node:path'
import fs from 'node:fs'

const root = process.cwd()
process.env.DSH_HOME = path.join(root, 'dev', 'dsh-home')
fs.rmSync(process.env.DSH_HOME, { recursive: true, force: true })

const routes = new Map()
const taps = []
const injectRows = []

function makeRes() {
  return {
    statusCode: 200,
    headers: null,
    body: null,
    writeHead(code, headers) { this.statusCode = code; this.headers = headers || null; return this },
    end(buf) { this.body = buf === undefined ? Buffer.alloc(0) : Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)); return this },
  }
}

const ctx = {
  get(name) {
    if (name === 'deepseekAccount') return null
    if (name === 'connection') return { requestRejection: () => false }
    if (name === 'sessionTitle') return null
    return null
  },
  connection: { requestRejection: () => false },
  credentials: { resolve: async () => null, set: async () => {}, delete: async () => {} },
  webServer: {
    register(route) { routes.set(route.path, route); return () => {} },
    tapIndex(fn) { taps.push(fn); return () => {} },
  },
  on() { return () => {} },
  effect(fn) { try { fn() } catch (err) {} return () => {} },
  logger: console,
}

const rootCtx = {
  effect(fn) { try { fn() } catch (err) {} return () => {} },
  on(event, cb) {
    if (event === 'webserver/index-inject') injectRows.push(cb)
    return () => {}
  },
  inject(deps, cb) { cb(ctx) },
}

const { default: plugin } = await import('../lib/index.js')
plugin.apply(rootCtx)

let failures = 0
function check(name, ok, extra) {
  console.log((ok ? 'OK  ' : 'FAIL') + '  ' + name + (extra ? '  ' + extra : ''))
  if (!ok) failures++
}

async function call(routePath, opts = {}) {
  const route = routes.get(routePath)
  if (!route) return null
  const res = makeRes()
  const req = {
    method: opts.method || 'GET',
    url: opts.url || routePath,
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
    resume() {},
  }
  await route.handler(req, res)
  return res
}

check('routes registered', routes.size > 30, routes.size + ' routes')
check('zzz routes present', ['/dsh-whale/zzz/airui-idle.png', '/dsh-whale/zzz/airui/airui.json', '/dsh-whale/zzz/runtime/spine-webgl.min.js', '/dsh-whale/zzz/pet.js'].every((p) => routes.has(p)))

const roles = await call('/dsh-whale/roles.json')
check('roles.json 200', roles && roles.statusCode === 200)
const rolesJson = roles && JSON.parse(roles.body.toString())
check('builtin airui role', rolesJson && rolesJson.roles[0] && rolesJson.roles[0].id === 'airui' && rolesJson.roles[0].engine === 'spine' && rolesJson.roles[0].builtin === true)
check('whale role kept', rolesJson && rolesJson.roles.some((r) => r.id === 'default'))

const json = await call('/dsh-whale/zzz/airui/airui.json')
check('spine json 200 + json type', json && json.statusCode === 200 && /application\/json/.test(String(json.headers['Content-Type'])), json && String(json.body.length) + ' bytes')
let spineOk = false
try { spineOk = JSON.parse(json.body.toString()).skeleton.spine === '4.2.42' } catch (err) {}
check('spine json parses', spineOk)

const png = await call('/dsh-whale/zzz/airui-idle.png')
check('still png 200', png && png.statusCode === 200 && /image\/png/.test(String(png.headers['Content-Type'])), png && png.body.length + ' bytes')
check('still png signature', png && png.body.slice(1, 4).toString() === 'PNG')

const rt = await call('/dsh-whale/zzz/runtime/spine-webgl.min.js')
check('spine runtime 200', rt && rt.statusCode === 200 && /javascript/.test(String(rt.headers['Content-Type'])), rt && String(rt.body.length) + ' bytes')

const pet = await call('/dsh-whale/zzz/pet.js')
check('pet.js 200', pet && pet.statusCode === 200 && /javascript/.test(String(pet.headers['Content-Type'])))

// 注入行：tapIndex 与桌面端结构化行都要同时带上 pet.js 与 widget.js
if (taps.length) {
  const html = taps[0]('<html><body></body></html>')
  check('tapIndex injects pet.js + widget.js', html.indexOf('/dsh-whale/zzz/pet.js') >= 0 && html.indexOf('/dsh-whale/widget.js') >= 0)
} else {
  check('tapIndex registered', false)
}
if (injectRows.length) {
  const table = []
  injectRows[0](table)
  const text = (table[0] && table[0].text) || ''
  check('desktop inject row has pet.js', text.indexOf('/dsh-whale/zzz/pet.js') >= 0 && text.indexOf('/dsh-whale/widget.js') >= 0)
} else {
  check('desktop inject row registered', false)
}

// 路径穿越不应命中任何路由
check('no traversal route', !routes.has('/dsh-whale/zzz/../../package.json'))
console.log(failures ? 'FAILURES: ' + failures : 'ALL CHECKS PASSED')
process.exit(failures ? 1 : 0)
