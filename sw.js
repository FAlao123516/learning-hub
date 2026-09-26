/**
 * sw.js —— Service Worker（服务工作线程）
 * =====================================
 *
 * 【术语：Service Worker 是什么？】
 * 它是一个跑在浏览器后台的独立小程序，不属于任何一个网页。
 * 它站在「网页」和「网络」中间，像一个门卫：网页发出的每个请求都先经过它，
 * 它可以选择「放行去网络」还是「直接给你存在本地的副本」。
 *
 * 它带来两个能力：
 *   1. 离线可用 —— 没网时直接拿本地缓存的页面给你
 *   2. 可安装   —— 有了它，安卓浏览器才会把网站当成一个真正的「App」允许装到桌面
 *
 * 【为什么这个文件要放在 public 目录？】
 * Service Worker 的作用范围（scope）受它自己所在路径限制。
 * 放到 public/ 后它会被放在网站的根目录，才能管住整个网站。
 *
 * 【为什么只在正式版注册，开发时不注册？】
 * 因为 SW 会「缓存住旧版本」。开发的时候你改一行代码，浏览器却给你看昨天缓存的版本，
 * 会让人怀疑人生。这是新手最常见、也最浪费时间的坑之一。
 * 所以下面的策略是「网络优先」：能联网就用最新的，联不上才用缓存。
 */

const CACHE = 'learning-hub-v1'
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg']

// 安装：预先把「壳」缓存下来
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  )
})

// 激活：清掉旧版本的缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// 拦截请求：网络优先，失败则回退到缓存
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        // 把成功拿到的资源顺手存一份，下次断网就能用
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
        return response
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached
          // 单页应用：任何找不到的路径都返回首页，交给前端路由处理
          if (request.mode === 'navigate') return caches.match('./index.html')
          return Response.error()
        })
      )
  )
})
