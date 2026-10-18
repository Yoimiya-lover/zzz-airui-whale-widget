/* 本地预览服务器：模拟 /dsh-whale/* 宿主接口，加载真实前端。
 * 用法：node dev/serve.mjs 8811
 *   http://127.0.0.1:8811/dev/widget.html         爱芮（默认）
 *   ?click=1 / ?click=6 / ?gaze=1 / ?role=default / ?dbg=1
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.argv[2] || 8811)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.atlas': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.css': 'text/css; charset=utf-8',
}

const roles = {
  ok: true,
  roles: [
    { id: 'airui', name: '爱芮', url: '/dsh-whale/zzz/airui-idle.png', builtin: true, engine: 'spine', format: 'png', pinned: false },
    { id: 'default', name: '小鲸鱼', url: '/dsh-whale/image.png', format: 'png', pinned: false },
  ],
}

function json(res, obj, code = 200) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function sendFile(res, file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found')
    return
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
}

http
  .createServer((req, res) => {
    try {
      const url = decodeURIComponent((req.url || '/').split('?')[0])
      const method = req.method || 'GET'
      if (url.startsWith('/dsh-whale/')) {
        if (url === '/dsh-whale/widget.js') return sendFile(res, path.join(repo, 'assets', 'whale-widget.js'))
        if (url.startsWith('/dsh-whale/zzz/')) {
          const rel = url.slice('/dsh-whale/zzz/'.length)
          if (rel.includes('..')) { res.writeHead(403).end('forbidden'); return }
          return sendFile(res, path.join(repo, 'assets', 'zzz', rel))
        }
        if (url === '/dsh-whale/roles.json') return json(res, roles)
        if (url === '/dsh-whale/size.json') return json(res, method === 'GET' ? { ok: true, scale: 1.4 } : { ok: true })
        if (url === '/dsh-whale/balance.json') {
          return json(res, { ok: true, totalBalance: 88.8, currency: 'CNY', todayUsage: 2.5, bonusBalance: 8.8, rechargeBalance: 80, version: '0.4.2-airui.1', versionLabel: 'v0.4.2-airui.1' })
        }
        if (url === '/dsh-whale/bubble.json') return json(res, { ok: true, bubbles: [], seq: [] })
        if (url === '/dsh-whale/audio.json') return json(res, { ok: true, groups: [], fragments: [] })
        if (url === '/dsh-whale/wait.json') return json(res, { ok: true, pending: null })
        if (url === '/dsh-whale/last-turn.json') return json(res, { ok: true, lastTurn: null })
        if (url === '/dsh-whale/about.json') return json(res, { ok: true })
        if (url === '/dsh-whale/image.png') return sendFile(res, path.join(repo, 'assets', 'DSniang1.png'))
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('mock 404: ' + url)
        return
      }
      const rel = url === '/' ? '/dev/widget.html' : url
      const file = path.join(repo, rel)
      if (!file.toLowerCase().startsWith(repo.toLowerCase())) { res.writeHead(403).end('forbidden'); return }
      sendFile(res, file)
    } catch (err) {
      res.writeHead(500).end(String(err))
    }
  })
  .listen(port, '127.0.0.1', () => console.log('serving ' + repo + ' on http://127.0.0.1:' + port))
