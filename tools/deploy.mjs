/**
 * tools/deploy.mjs —— 把打包结果发布到 GitHub Pages
 * ===============================================
 *
 * 【为什么要有这个脚本？】
 * 因为「发布」这件事如果要手动做，每次都得记得一连串命令，迟早会漏掉一步。
 * 把它固化成一条命令（npm run deploy），就永远不会漏。
 * 这叫「把流程变成代码」（Infrastructure as Code 的朴素版本）。
 *
 * 【它到底做了什么？】
 *   1. 打包出一个纯净的 dist/ 目录（只有网站运行需要的文件，不含源码）
 *   2. 把 dist/ 的内容复制到一个临时目录
 *   3. 在那个临时目录里建一个独立的 git 仓库，提交一次
 *   4. 强制推送到远端的 gh-pages 分支
 *
 * 【为什么要用临时目录，而不是直接在本仓库里切分支？】
 * 因为在本仓库里切换分支容易出事 —— 万一哪一步错了，
 * 可能会把 src/ 里的源码删掉。用独立的临时目录，主仓库完全不受影响。
 * 这是「拿不准会不会搞坏的事，就在副本上做」的原则。
 *
 * 【术语：为什么叫 gh-pages？】
 * 这是 GitHub Pages 的历史默认分支名。虽然现在可以在设置里指定任意分支，
 * 但 gh-pages 已经成了事实标准，看到这个名字大家就知道是「发布产物」。
 *
 * 运行：npm run deploy
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP = path.join(os.tmpdir(), 'learning-hub-gh-pages')

// 在某个目录里跑一条命令，并把输出直接透传到屏幕上
function run(cmd, cwd) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function runQuiet(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8' }).trim()
}

console.log('=== 开始发布到 GitHub Pages ===')

// 0. 确认是在一个 git 仓库里，并拿到远程地址
let remoteUrl
try {
  remoteUrl = runQuiet('git remote get-url origin', ROOT)
} catch {
  console.error('✗ 找不到远程仓库。请先在项目目录里执行过 git remote add origin <地址>')
  process.exit(1)
}
console.log(`远程仓库：${remoteUrl}`)

// 1. 打包
run('npm run build', ROOT)

const dist = path.join(ROOT, 'dist')
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('✗ 打包结果里没有 index.html，构建可能失败了')
  process.exit(1)
}

// 2. 准备临时目录
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
fs.cpSync(dist, TMP, { recursive: true })

// 3. 在临时目录里建一个干净的仓库并提交
run('git init -b gh-pages', TMP)
run('git add -A', TMP)

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
run(
  `git -c user.name="deploy-bot" -c user.email="deploy-bot@users.noreply.github.com" ` +
    `commit -m "deploy v${version} (${stamp})"`,
  TMP
)

// 4. 推送
run(`git remote add origin "${remoteUrl}"`, TMP)
run('git push -f origin gh-pages', TMP)

// 5. 清理
fs.rmSync(TMP, { recursive: true, force: true })

console.log('\n=== 发布完成 ===')
console.log('网站地址：https://falai123516.github.io/learning-hub/')
console.log('（GitHub 大约需要 30 秒到 2 分钟来更新，稍等一下再刷新）')
