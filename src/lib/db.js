/**
 * db.js —— 数据层：负责把卡片存进浏览器的本地数据库
 * ================================================
 *
 * 【为什么不能只放在内存变量里？】
 * 网页里的普通变量（let cards = []）只要刷新页面就没了。
 * 所以需要「持久化」——把数据写到硬盘上。
 *
 * 【浏览器给网页提供了三种存东西的地方】
 *   1. localStorage —— 最简单，只能存字符串，总量约 5MB，而且是「同步」的（会卡住界面）
 *   2. IndexedDB   —— 浏览器内置的数据库，容量大（几百 MB 起），异步，能建索引
 *   3. Cache Storage —— 专给离线缓存用的
 *
 * 我们选用 IndexedDB：因为背单词久了数据会越来越多，
 * 而且以后可能要存图片、音频，5MB 迟早不够。
 *
 * 【术语：异步 / Promise / async-await】
 * IndexedDB 取数据不是「立刻」拿到，而是要等一小会儿（磁盘 IO）。
 * 这种「现在还没好，等好了再通知你」的东西叫「异步操作」。
 * 用 URL 的说法就是：不是打电话（同步），是发微信（异步）。
 * Promise 是「一张提货单」——现在给你单子，东西好了凭单取货。
 * async/await 是把提货单写法变好看的工具：写起来像同步代码，实际是异步。
 */

// 数据库的名字和版本号。
// 【术语：数据库版本号】以后要给数据「加字段」时，把版本号 +1，
// 浏览器就会触发 onupgradeneeded，让我们有机会做数据迁移。
// 这是「上线后改数据库」的标准做法，产品经理要知道这个机制的存在。
const DB_NAME = 'learning-hub'
const DB_VERSION = 1
const STORE = 'cards' // 「表」在 IndexedDB 里叫 object store，可以先理解成 Excel 里的一个 sheet

/** 打开数据库，返回一个 Promise。整个应用生命周期只打开一次，之后复用。 */
let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    // 第一次打开（或版本号变大）时触发：在这里建表
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath: 'id' 表示每条记录的 id 字段就是它的主键（唯一身份）
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        // 建索引 = 给某个字段建目录，以后按它快速查找（类似书的索引页）
        store.createIndex('due', 'due')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

/** 把 IndexedDB 的「回调风格」请求包装成 Promise，这样就能用 await 了 */
function toPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 取出所有卡片 */
export async function getAllCards() {
  const db = await openDB()
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  return toPromise(store.getAll())
}

/** 新增或更新一张卡片（有相同 id 就覆盖，这是 put 的特点；add 则是「已存在就报错」） */
export async function putCard(card) {
  const db = await openDB()
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await toPromise(store.put(card))
  return card
}

/** 批量保存（导入备份、批量录入时用），一次事务写多条，比循环单条快很多 */
export async function putCards(cards) {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  cards.forEach((card) => store.put(card))
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(cards.length)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** 删除一张卡片 */
export async function deleteCard(id) {
  const db = await openDB()
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await toPromise(store.delete(id))
}

/** 清空所有卡片（危险操作，界面上要二次确认） */
export async function clearAllCards() {
  const db = await openDB()
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await toPromise(store.clear())
}

/**
 * 生成一个唯一 id。
 * crypto.randomUUID() 是浏览器内置的「随机唯一编号」生成器。
 * 【为什么不能用 1、2、3 做 id？】
 * 因为你以后可能从别的设备导入数据，两边各自的 1 号卡片会撞车。
 * 用随机长字符串就几乎不可能重复。这叫「全局唯一标识符（UUID）」。
 */
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}
