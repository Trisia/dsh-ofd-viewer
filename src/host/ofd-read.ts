/**
 * OFD 文本读取器：只用 Node 内置 zlib 解包 OFD（ZIP 容器），
 * 解析 OFD 文档结构并抽取每页可见文本。
 *
 * 说明：无法覆盖全部 OFD 特性（加密、LZW/JPEG 图像等），
 * 遇到不支持的压缩方式时跳过该条目并记入 skipped，而不是抛错。
 */
import { inflateRawSync } from 'node:zlib'

/** 单条条目解压上限（字节）。 */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024

/** ZIP 中央目录中的一条记录（只保留文本抽取需要的字段）。 */
interface ZipEntry {
  /** 条目名，OFD 内为相对包根的路径 */
  name: string
  /** 压缩方式：0 存储，8 deflate */
  method: number
  /** 压缩后字节数（单位 byte） */
  compressedSize: number
  /** 解压后字节数（单位 byte） */
  size: number
  /** 本地文件头在包内的偏移（单位 byte） */
  localOffset: number
}

/** 一页抽取结果。 */
export interface OfdPageText {
  /** 页码，从 1 开始 */
  page: number
  /** 该页按出现顺序拼接的可见文本，片段之间以换行分隔 */
  text: string
  /** 因超过单页字符上限被省略的字符数（未截断时缺省） */
  truncatedChars?: number
}

/** 文档信息（OFD.xml 的 DocInfo 子元素，键为元素本地名）。 */
export type OfdDocInfo = Record<string, string>

/** 摘要工具的一次抽取结果。 */
export interface OfdSummary {
  /** OFD 版本号，例如 "1.0" */
  version?: string
  /** 文档信息 */
  docInfo: OfdDocInfo
  /** 页面数（单位 页） */
  pageCount: number
  /** 每页文本；includeText 为 false 时为空数组 */
  pages: OfdPageText[]
  /** 解压失败或不支持压缩方式的条目名 */
  skipped: string[]
}

/**
 * 解析 ZIP 中央目录。
 *
 * @param buffer 完整 OFD 文件字节
 * @returns 中央目录条目
 * @throws {Error} 不是合法 ZIP 容器时抛出
 */
function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdSignature = 0x06054b50
  let eocd = -1
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 65557; i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 OFD 容器：未找到 ZIP 中央目录')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('OFD 容器中央目录损坏')
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    entries.push({
      name: buffer.toString('utf8', offset + 46, offset + 46 + nameLength),
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      size: buffer.readUInt32LE(offset + 24),
      localOffset: buffer.readUInt32LE(offset + 42),
    })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/**
 * 读取单个 ZIP 条目内容。
 *
 * @param buffer 完整 OFD 文件字节
 * @param entry 中央目录条目
 * @returns 解压后的字节；不支持的压缩方式返回空 Buffer
 * @throws {Error} 本地头损坏或解压结果超限时抛出
 */
function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const local = entry.localOffset
  if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`条目 ${entry.name} 的本地头损坏`)
  const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
  const raw = buffer.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return raw
  if (entry.method === 8) return inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES })
  return Buffer.alloc(0)
}

/**
 * 取首个匹配标签的文本内容。
 *
 * @param xml XML 文本
 * @param tag 完整标签名（含命名空间前缀）
 * @returns 标签内容；找不到返回 undefined
 */
function firstTag(xml: string, tag: string): string | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`).exec(xml)
  return match === null ? undefined : match[1]
}

/**
 * 解析元素的属性表。
 *
 * @param attrs 属性串，例如 `BaseLoc="Pages/Page_0/Content.xml" ID="1"`
 * @returns 属性名到值的映射
 */
function readAttributes(attrs: string): Record<string, string> {
  const result: Record<string, string> = {}
  const pattern = /([\w:.-]+)\s*=\s*"([^"]*)"/g
  let match = pattern.exec(attrs)
  while (match !== null) {
    const key = match[1]
    const value = match[2]
    if (key !== undefined && value !== undefined) result[key] = value
    match = pattern.exec(attrs)
  }
  return result
}

/**
 * 解码 XML 文本节点中的实体。
 *
 * @param value 原始文本
 * @returns 解码后的文本
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_all, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
}

/**
 * 抽取一段内容 XML 中的可见文本片段。
 *
 * @param xml 内容 XML 文本
 * @returns 按出现顺序的文本片段
 */
function extractTextRuns(xml: string): string[] {
  const runs: string[] = []
  const pattern = /<ofd:TextCode\b[^>]*>([\s\S]*?)<\/ofd:TextCode>/g
  let match = pattern.exec(xml)
  while (match !== null) {
    const text = decodeEntities((match[1] ?? '').replace(/<[^>]+>/g, ''))
    if (text.trim().length > 0) runs.push(text)
    match = pattern.exec(xml)
  }
  return runs
}

/**
 * 读取 OFD 摘要。
 *
 * @param buffer 完整 OFD 文件字节
 * @param options.includeText 是否抽取每页文本（默认 true）
 * @param options.maxPages 最多抽取多少页，单位「页」（默认全部）
 * @returns 文档摘要
 * @throws {Error} 不是有效 OFD 容器时抛出
 */
export function summarizeOfd(buffer: Buffer, options: { includeText?: boolean; maxPages?: number } = {}): OfdSummary {
  const includeText = options.includeText ?? true
  const entries = readZipEntries(buffer)
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  const skipped: string[] = []

  const read = (name: string): string | undefined => {
    const entry = byName.get(name)
    if (entry === undefined) return undefined
    try {
      const bytes = readZipEntry(buffer, entry)
      if (bytes.length === 0 && entry.size > 0) {
        skipped.push(name)
        return undefined
      }
      return bytes.toString('utf8')
    } catch {
      skipped.push(name)
      return undefined
    }
  }

  // OFD.xml：版本号、文档信息与正文基准路径（DocRoot）
  const ofdXml = read('OFD.xml') ?? ''
  const versionMatch = /<ofd:OFD\b[^>]*\bVersion="([^"]*)"/.exec(ofdXml)
  const docBodyMatch = /<ofd:DocBody\b([^>]*)>([\s\S]*?)<\/ofd:DocBody>/.exec(ofdXml)
  const docInfo: OfdDocInfo = {}
  const docBody = docBodyMatch?.[2]
  if (docBody !== undefined) {
    const block = firstTag(docBody, 'ofd:DocInfo') ?? ''
    const childPattern = /<ofd:(\w+)\b[^>]*>([\s\S]*?)<\/ofd:\1>/g
    let child = childPattern.exec(block)
    while (child !== null) {
      const key = child[1]
      const value = child[2]
      if (key !== undefined && value !== undefined) docInfo[key] = decodeEntities(value.replace(/<[^>]+>/g, '')).trim()
      child = childPattern.exec(block)
    }
  }
  const docRootText = docBody === undefined ? undefined : firstTag(docBody, 'ofd:DocRoot')
  const docRoot = (docRootText ?? '').trim().replace(/\/Document\.xml$/i, '')

  // 文档正文：DocRoot 前缀 + Pages/Page[BaseLoc] 给出页序
  let pageNames: string[] = []
  if (docRoot !== '') {
    const pagesBlock = firstTag(read(`${docRoot}/Document.xml`) ?? '', 'ofd:Pages') ?? ''
    const pagePattern = /<ofd:Page\b([^>]*?)\/?>/g
    let pageMatch = pagePattern.exec(pagesBlock)
    while (pageMatch !== null) {
      const attrs = pageMatch[1] ?? ''
      pageNames.push(`${docRoot}/${readAttributes(attrs).BaseLoc ?? ''}`.replace(/\/+/g, '/'))
      pageMatch = pagePattern.exec(pagesBlock)
    }
  }
  if (pageNames.length === 0) {
    pageNames = entries
      .map((entry) => entry.name)
      .filter((name) => /(^|\/)Content\.xml$/i.test(name))
      .sort()
  }

  const pages: OfdPageText[] = []
  if (includeText) {
    const limit = options.maxPages === undefined ? pageNames.length : Math.min(pageNames.length, options.maxPages)
    for (let index = 0; index < limit; index += 1) {
      const pageName = pageNames[index]
      const pageXml = pageName === undefined ? undefined : read(pageName)
      pages.push({ page: index + 1, text: pageXml === undefined ? '' : extractTextRuns(pageXml).join('\n') })
    }
  }

  return { version: versionMatch?.[1], docInfo, pageCount: pageNames.length, pages, skipped }
}
