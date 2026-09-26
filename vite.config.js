import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 是这个项目的「构建工具」和「开发服务器」。
// 它的作用：把 src/ 里的一堆文件打包成浏览器能跑的少数几个文件，
// 并在开发时提供一个带「热更新」的本地服务器（改代码 → 浏览器自动刷新）。
export default defineConfig({
  plugins: [react()],

  // base: './' 表示打包后所有资源都用「相对路径」引用。
  // 这样以后不管把它放到网站的根目录还是子目录（比如 GitHub Pages 的 /learning-hub/），
  // 都能正常打开，不用改代码。这是一个省事的小技巧。
  base: './',

  server: {
    // host: true 让开发服务器监听局域网 IP，
    // 这样你手机连同一个 WiFi 就能用 http://192.168.x.x:5173 打开它。
    host: true,
    port: 5173,

    // 【这一段是被实际崩溃逼出来的】
    // Vite 会「盯着」src 目录里的每个文件，你一改动它就自动刷新浏览器（热更新）。
    // 但 AI 修改文件时用的是「先写临时文件、再改名覆盖」的方式，
    // 于是 src 里会短暂出现 .App.jsx.1234.xxxx.tmpdir 这种临时目录。
    // Vite 兴冲冲地去监听它，它却立刻被删了 —— 监听一个不存在的文件，
    // Node.js 直接抛出 EBUSY 错误，整个开发服务器就挂了。
    // 解决办法就是把这类临时文件排除在监听范围之外。
    // 一句话记住：**监视文件变化的工具，一定要配置「忽略哪些文件」。**
    watch: {
      ignored: [
        '**/.*.tmpdir/**',
        '**/*.tmp',
        '**/.*.tmp',
        '**/node_modules/**',
        '**/dist/**',
        '**/screenshots/**',
        '**/tmp-download/**',
        // 更彻底一点：忽略所有以点开头的隐藏目录和 .crdownload 下载临时文件
        '**/.*/**',
        '**/*.crdownload',
      ],
    },
  },
})
