import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// 这是整个网页的「入口文件」。
// 它做的事情只有一件：把 <App /> 这个组件，塞进 index.html 里的 <div id="root"> 中。
//
// 【术语：组件（Component）】
// 组件就是一个「返回界面片段的函数」。你可以把它想成乐高积木：
// 一个 <Card /> 组件负责显示一张卡片，一个 <ReviewPage /> 负责复习那一整屏。
// 把界面拆成小积木，是为了改一块不会碰坏别的块。
//
// 【术语：虚拟 DOM 与声明式 UI】
// 传统写法是「手动命令浏览器」：找到那个元素 → 改它的文字 → 加个 class。
// React 的写法是「描述结果」：我告诉你「当 count 是 3 时界面应该是这样」，
// 具体怎么改由 React 自己算。这叫「声明式」。
// 好处：你少操心细节；坏处：要学它的思维方式。这是 React 最核心的概念。
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// —— 注册 Service Worker（让它能离线用、能装到手机桌面）——
//
// import.meta.env.PROD 是 Vite 提供的开关：正式打包后是 true，开发时是 false。
// 开发时不注册 SW，是为了避免「浏览器一直给我看缓存的旧代码」这个坑。
// 一句话记住：**缓存是双刃剑，开发阶段要让它闭嘴。**
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service Worker 注册失败（不影响正常使用）', err)
    })
  })
}
