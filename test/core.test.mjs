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
