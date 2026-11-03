/**
 * 纯逻辑单元测试：文件名判断、地址解析与 OFD 文本抽取。
 * 客户端纯函数从 TS 源码直接加载（源码本身不依赖 React）。
 * 运行：npm test（Node 内置测试运行器）
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { summarizeOfd } from '../lib/host/ofd-read.js'
import { extensionOf, formatSize, isOfdName, parseFileAddress } from '../src/client/utils.ts'

/** 测试样本目录。 */
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

test('isOfdName 只接受 .ofd 后缀', () => {
  assert.equal(isOfdName('a.ofd'), true)
  assert.equal(isOfdName('A.OFD'), true)
  assert.equal(isOfdName('a.pdf'), false)
  assert.equal(isOfdName('ofd'), false)
})

test('extensionOf 返回小写扩展名', () => {
  assert.equal(extensionOf('invoice.OFD'), 'ofd')
  assert.equal(extensionOf('noext'), '')
})

test('formatSize 输出可读大小', () => {
  assert.equal(formatSize(230918), '225.5 KB')
  assert.equal(formatSize(512), '512 B')
})

test('parseFileAddress 解析会话级文件地址', () => {
  assert.deepEqual(parseFileAddress('dsh-resource://file/session/s1/Doc_0/a%20b.ofd'), {
    sessionId: 's1',
    path: 'Doc_0/a b.ofd',
  })
  assert.throws(() => parseFileAddress('dsh-resource://file/absolute/tmp/a.ofd'))
})

test('summarizeOfd 抽取页数、版本与文本', () => {
  const bytes = readFileSync(join(fixtures, 'ofd-viewer-ui-showcase.ofd'))
  const summary = summarizeOfd(bytes, { maxPages: 2 })
  assert.equal(summary.version, '1.0')
  assert.equal(summary.pageCount, 10)
  assert.equal(summary.pages.length, 2)
  assert.match(summary.pages[0].text, /OFD/)
  assert.deepEqual(summary.skipped, [])
})

test('summarizeOfd 可只取元数据', () => {
  const bytes = readFileSync(join(fixtures, 'DigitalSign.ofd'))
  const summary = summarizeOfd(bytes, { includeText: false })
  assert.equal(summary.pageCount, 1)
  assert.equal(summary.pages.length, 0)
  assert.equal(summary.docInfo.Creator, 'OFD R&W')
})

/**
 * 加载已构建的宿主半，并取出 ofd_read 工具定义。
 * defineTool 会原样返回定义，因此可以直接拿到 execute 调用。
 *
 * @returns ofd_read 的工具定义
 */
async function loadReadTool() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const { apply } = await import('../lib/host/index.js')
  let definition
  apply({
    root: { effect: (fn) => fn(), webServer: { register: () => () => {} } },
    get: () => undefined,
    tools: { register: (tool) => { definition = tool } },
    workingDirectory: { ensure: async () => root },
    fs: {
      resolve: async (path) => path,
      stat: async () => ({ type: 'file' }),
      processPath: (path) => path,
      readBytes: async (path) => new Uint8Array(readFileSync(path)),
    },
  })
  return definition
}

test('ofd_read 超长页按页内偏移分段，片段可拼回整页', async () => {
  const tool = await loadReadTool()
  const exec = { agent: {} }
  const path = join(fixtures, 'ofd-viewer-ui-showcase.ofd')

  const first = await tool.execute({ path, pages: '4', maxPages: 1 }, exec)
  const head = first.pages[0]
  assert.equal(head.offset, 1)
  assert.equal(head.hasMore, true)
  assert.equal(Array.from(head.text).length, 4000)
  assert.match(head.next, /^4#4001-\d+$/)

  const second = await tool.execute({ path, pages: head.next, maxPages: 1 }, exec)
  const tail = second.pages[0]
  assert.equal(tail.offset, 4001)
  assert.equal(tail.hasMore, false)
  assert.equal(tail.next, undefined)

  const whole = summarizeOfd(readFileSync(path), { includeText: true, maxPages: 4 }).pages.find((page) => page.page === 4)
  assert.equal(head.text + tail.text, whole.text)
})

test('ofd_read 的 maxCharsPerPage 与页内区间', async () => {
  const tool = await loadReadTool()
  const exec = { agent: {} }
  const path = join(fixtures, 'ofd-viewer-ui-showcase.ofd')

  const custom = await tool.execute({ path, pages: '4', maxPages: 1, maxCharsPerPage: 1000 }, exec)
  assert.equal(custom.maxCharsPerPage, 1000)
  assert.equal(Array.from(custom.pages[0].text).length, 1000)
  assert.equal(custom.pages[0].next, `4#1001-${custom.pages[0].totalChars}`)

  const ranged = await tool.execute({ path, pages: '4-5#1-500', maxPages: 2 }, exec)
  assert.deepEqual(ranged.pages.map((page) => [page.page, page.offset, Array.from(page.text).length]), [[4, 1, 500], [5, 1, 500]])
})

test('ofd_read 拒绝非法的页码与页内偏移', async () => {
  const tool = await loadReadTool()
  const exec = { agent: {} }
  const path = join(fixtures, 'ofd-viewer-ui-showcase.ofd')
  for (const pages of ['4#abc', '4#0-10', '4#10-5', '0', 'x-2']) {
    await assert.rejects(() => tool.execute({ path, pages }, exec), /Invalid page/, pages)
  }
})
