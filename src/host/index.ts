/**
 * dsh-ofd-viewer 宿主半：提供内置字体静态路由与 ofd_read 摘要工具。
 * 阅读器渲染由客户端半（src/client）负责。
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { summarizeOfd } from './ofd-read.js'

/** 字体路由前缀；客户端半按 `${FONT_PATH_PREFIX}/<文件名>` 取内置字体。 */
export const FONT_PATH_PREFIX = '/ofd-viewer-plugin/fonts'

/** 内置字体：路由文件名 → 构建产物中的相对路径（lib/host → lib/client/assets/fonts）。 */
const FONT_FILES: Readonly<Record<string, string>> = {
  'source-han-serif-sc.woff2': '../client/assets/fonts/source-han-serif-sc.woff2',
  'source-han-sans-sc.woff2': '../client/assets/fonts/source-han-sans-sc.woff2',
}

/** ofd_read 默认返回的正文页数（单位 页）。 */
const DEFAULT_MAX_PAGES = 30

/** ofd_read 每页默认返回的文本长度上限（单位 字符，按 Unicode 码点计）。 */
const MAX_CHARS_PER_PAGE = 4000

/**
 * 宿主插件依赖的服务；缺任意一个时插件保持不激活。
 *
 * clientModules 不直接使用，只用于排序：浏览器半是启动期（immediately）同步加载的，
 * 侧栏文档预览渲染器必须在该行之后加载，否则注册时 documentPreviews 服务还不存在，
 * .ofd 会被当作未知二进制走「该格式文件暂时无法预览」。启动表按依赖先后排序，
 * 而浏览器模块表只认包名形式的依赖，因此这层顺序由宿主半声明。
 */
export const inject = ['webServer', 'tools', 'fs', 'workingDirectory', 'clientModules']


/** 连接服务的可选面：用于拒绝未经授权来源的请求。 */
interface ConnectionFace {
  /** @param req 入站请求 @returns 拒绝时返回状态码，放行返回 undefined */
  requestRejection?(req: IncomingMessage): number | undefined
}

/** ofd_read 的调用参数（由 defineTool 依据 schema 校验后传入）。 */
interface ReadToolArgs {
  /** OFD 文件路径，相对路径以会话工作目录为基准 */
  path: string
  /** 1 起始的页码选择，如 "3"、"1-5"、"1,3,7-9"；可带偏移，如 "4#2001-4000" */
  pages?: string
  /** 最多返回页数（单位 页） */
  maxPages?: number
  /** 每页最多返回的字符数（单位 字符，按 Unicode 码点计），默认 MAX_CHARS_PER_PAGE */
  maxCharsPerPage?: number
  /** 是否返回正文；false 时只返回元数据 */
  includeText?: boolean
}

/** ofd_read 返回的一页文本（单页可分段读取，因此带页内偏移）。 */
interface ReadPageText {
  /** 页码，从 1 开始 */
  page: number
  /** 该页按出现顺序拼接的可见文本（本段） */
  text: string
  /** 本段在该页文本中的起始位置，从 1 开始计（单位 字符，按 Unicode 码点计） */
  offset: number
  /** 该页文本的总长度（单位 字符，按 Unicode 码点计） */
  totalChars: number
  /** 该页后面还有未返回的字符时为 true */
  hasMore: boolean
  /** 本页后续内容应传入的 pages 选择串；本段已是该页末尾时缺省 */
  next?: string
}

/** ofd_read 的规范返回值。 */
interface ReadToolValue {
  /** 解析后的主机文件系统路径 */
  path: string
  /** 文件字节数（单位 byte） */
  bytes: number
  /** OFD 版本号 */
  version?: string
  /** 文档信息 */
  docInfo: Record<string, string>
  /** 文档页数（单位 页） */
  pageCount: number
  /** 本次返回的页码列表（单位 页） */
  returnedPages: number[]
  /** 返回的页文本 */
  pages: ReadPageText[]
  /** 每页返回的字符上限（单位 字符） */
  maxCharsPerPage: number
  /** 解压失败的条目 */
  skippedEntries?: string[]
}

/**
 * 解析包内资源路径。
 *
 * @param relative 相对本文件所在目录的路径
 * @returns 绝对文件系统路径
 */
function assetPath(relative: string): string {
  // 构建产物位于 lib/host/index.js；源码运行时也按 lib/host 的层级解析
  return fileURLToPath(new URL(relative, import.meta.url))
}

/**
 * 注册内置字体静态路由；非本机来源按连接服务给出的拒绝状态应答。
 *
 * @param ctx 宿主上下文
 * @returns 无返回值
 */
function registerFontRoutes(ctx: Context): void {
  // 改用根上下文注册：插件自身上下文会在 apply 结束且无持有的 fiber 时被卸载，路由随之注销
  const connection = ctx.get('connection') as ConnectionFace | undefined
  const target = ctx.root
  target.effect(
    () =>
      target.webServer.register({
        kind: 'prefix',
        path: FONT_PATH_PREFIX,
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          const rejection = connection?.requestRejection?.(req)
          if (rejection !== undefined) {
            res.statusCode = rejection
            res.end()
            return
          }
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.statusCode = 405
            res.setHeader('allow', 'GET, HEAD')
            res.end()
            return
          }
          const name = new URL(req.url ?? '/', 'http://localhost').pathname.slice(FONT_PATH_PREFIX.length + 1)
          const relative = Object.hasOwn(FONT_FILES, name) ? FONT_FILES[name] : undefined
          if (relative === undefined) {
            res.statusCode = 404
            res.end()
            return
          }
          let bytes: Buffer
          try {
            bytes = await readFile(assetPath(relative))
          } catch {
            res.statusCode = 404
            res.end()
            return
          }
          res.statusCode = 200
          res.setHeader('content-type', 'font/woff2')
          res.setHeader('content-length', String(bytes.byteLength))
          res.setHeader('cache-control', 'private, max-age=86400')
          res.end(req.method === 'HEAD' ? undefined : bytes)
        },
      }),
    `ofd-viewer: GET ${FONT_PATH_PREFIX}/<font>`,
  )
}

/**
 * 解析一个页内选择项：`4` / `4#2001-4000` / `4-6#1-500`。
 *
 * @param text 选择项，形如 `4`、`4#2001-4000`、`4-6#1-500`
 * @returns 页码范围与页内偏移范围；两者都是 1 起始的闭区间
 * @throws {Error} 选择项非法时抛出
 */
function parsePart(text: string): { start: number; end: number; from: number; to: number } {
  const [pageText = '', offsetText] = text.split('#')
  const pageRange = /^(\d+)\s*-\s*(\d+)$/.exec(pageText.trim())
  const pageNumber = /^\d+$/.exec(pageText.trim())
  let start: number
  let end: number
  if (pageRange !== null) {
    start = Number(pageRange[1])
    end = Number(pageRange[2])
    if (start < 1 || end < start) throw new Error(`Invalid page range "${text}"`)
  } else if (pageNumber !== null) {
    start = Number(pageText.trim())
    end = start
    if (start < 1) throw new Error(`Invalid page number "${text}"`)
  } else {
    throw new Error(`Invalid page selection "${text}"`)
  }
  // 未给页内偏移时取整页
  if (offsetText === undefined) return { start, end, from: 1, to: Number.POSITIVE_INFINITY }
  const offsetRange = /^(\d+)\s*-\s*(\d+)$/.exec(offsetText.trim())
  if (offsetRange === null) throw new Error(`Invalid page offset "${text}"`)
  const from = Number(offsetRange[1])
  const to = Number(offsetRange[2])
  if (from < 1 || to < from) throw new Error(`Invalid page offset "${text}"`)
  return { start, end, from, to }
}

/**
 * 把页码选择串解析为需要读取的页与页内区间。
 *
 * @param spec 形如 "1-5"、"3"、"1,3,7-9"、"4#2001-4000"；缺省时取前若干页
 * @param pageCount 文档总页数（单位 页）
 * @param maxPages 最多返回页数（单位 页）
 * @returns 每页一项，含页码与该页要读取的字符区间（从 1 开始，单位 字符）
 * @throws {Error} 选择串非法时抛出
 */
function selectPages(
  spec: string | undefined,
  pageCount: number,
  maxPages: number,
): { page: number; from: number; to: number }[] {
  if (pageCount === 0) return []
  const limit = Math.max(1, Math.floor(maxPages))
  if (spec === undefined || spec.trim() === '') {
    return Array.from({ length: Math.min(pageCount, limit) }, (_all, index) => ({ page: index + 1, from: 1, to: Number.POSITIVE_INFINITY }))
  }
  // 同一页可能出现多次（例如两次请求页内不同区间），保留首次出现的位置
  const wanted = new Map<number, { page: number; from: number; to: number }>()
  for (const part of spec.split(',')) {
    if (part.trim() === '') continue
    const { start, end, from, to } = parsePart(part)
    for (let page = start; page <= Math.min(end, pageCount); page += 1) {
      if (!wanted.has(page)) wanted.set(page, { page, from, to })
    }
  }
  return [...wanted.values()].sort((a, b) => a.page - b.page).slice(0, limit)
}

/**
 * 读取选定页文本，按页面区间与本页字符上限分段。
 *
 * @param bytes 完整 OFD 字节
 * @param selected 页码与页内区间
 * @param maxCharsPerPage 每页最多返回的字符数（单位 字符，按 Unicode 码点计）
 * @returns 页文本列表
 */
function readSelectedPages(
  bytes: Uint8Array,
  selected: { page: number; from: number; to: number }[],
  maxCharsPerPage: number,
): ReadPageText[] {
  if (selected.length === 0) return []
  const limit = Math.max(1, Math.floor(maxCharsPerPage))
  const last = selected[selected.length - 1]
  if (last === undefined) return []
  // 只解压到需要的最后一页，避免整本解压
  const full = summarizeOfd(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    includeText: true,
    maxPages: last.page,
  })
  return selected.map(({ page, from, to }) => {
    const chars = Array.from(full.pages.find((item) => item.page === page)?.text ?? '')
    const totalChars = chars.length
    // 偏移超出本页范围时返回空段，但仍带总数，便于调用方判断
    if (from > totalChars) return { page, text: '', offset: from, totalChars, hasMore: false }
    const end = Math.min(to, totalChars, from + limit - 1)
    const hasMore = end < Math.min(to, totalChars)
    return {
      page,
      text: chars.slice(from - 1, end).join(''),
      offset: from,
      totalChars,
      hasMore,
      ...(hasMore ? { next: `${page}#${end + 1}-${Math.min(Number.isFinite(to) ? to : totalChars, totalChars)}` } : {}),
    }
  })
}

/**
 * 注册 ofd_read 工具：读取会话文件系统中的 OFD，返回元数据与每页文本。
 *
 * @param ctx 宿主上下文
 * @returns 无返回值
 */
function registerReadTool(ctx: Context): void {
  ctx.tools.register(
    defineTool({
      name: 'ofd_read',
      description:
        'Read an OFD (GB/T 33190) document and return its metadata plus extracted page text. Use it to answer questions about an OFD invoice, e-invoice, contract or archive without rendering it; the OFD Viewer plugin renders it in the Web UI. A long page is returned in segments; pass the `next` value of a returned page to read the rest of it.',
      parameters: {
        path: {
          type: 'string',
          required: true,
          description: 'Path of an OFD file. Relative paths use the Session working directory.',
        },
        pages: {
          type: 'string',
          description:
            '1-based page selection such as "2", "1-5" or "1,3,7-9". Append "#<from>-<to>" to a page or range to read a character slice of that page, e.g. "4#2001-4000" or "4-6#1-500". Omit for the first pages.',
        },
        maxPages: {
          type: 'integer',
          description: `Maximum pages of text to return, in pages (default ${DEFAULT_MAX_PAGES}).`,
        },
        maxCharsPerPage: {
          type: 'integer',
          description: `Maximum characters returned per page, in characters (default ${MAX_CHARS_PER_PAGE}); longer pages are split into segments.`,
        },
        includeText: {
          type: 'boolean',
          description: 'Set false to return metadata only, without page text (default true).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            bytes: { type: 'integer', required: true },
            version: { type: 'string' },
            docInfo: { type: 'object', additionalProperties: true, required: true },
            pageCount: { type: 'integer', required: true },
            returnedPages: { type: 'array', required: true, items: { type: 'integer' } },
            pages: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  page: { type: 'integer', required: true },
                  text: { type: 'string', required: true },
                  offset: { type: 'integer', required: true },
                  totalChars: { type: 'integer', required: true },
                  hasMore: { type: 'boolean', required: true },
                  next: { type: 'string' },
                },
              },
            },
            maxCharsPerPage: { type: 'integer', required: true },
            skippedEntries: { type: 'array', items: { type: 'string' } },
          },
        },
        render: (_args: ReadToolArgs, value: ReadToolValue) => [
          {
            type: 'text',
            text: [
              `${value.path} · ${value.pageCount} 页 · ${value.bytes} 字节`,
              ...value.pages.map((page) =>
                `【第 ${page.page} 页${page.hasMore || page.offset > 1 ? ` · 第 ${page.offset}-${page.offset + Array.from(page.text).length - 1} 字，共 ${page.totalChars} 字` : ''}】\n${page.text}${
                  page.next === undefined ? '' : `\n…（本页未完，继续读取请传 pages: "${page.next}"）`
                }`,
              ),
            ].join('\n\n'),
          },
        ],
      },
      async execute(args: ReadToolArgs, exec): Promise<ReadToolValue> {
        if (exec.agent === undefined) throw new Error('ofd_read requires an agent Session')
        const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
        const target = await ctx.fs.resolve(args.path, { cwd, signal: exec.signal })
        const info = await ctx.fs.stat(target, exec.signal)
        if (info === undefined || info.type !== 'file') {
          throw new FsError(`Cannot read ${args.path}: not a regular file.`, 'FS_NOT_FOUND')
        }
        const hostPath = ctx.fs.processPath(target)
        const bytes = await ctx.fs.readBytes(target, exec.signal, Number.MAX_SAFE_INTEGER)
        const summary = summarizeOfd(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { includeText: false })
        const selected =
          args.includeText === false ? [] : selectPages(args.pages, summary.pageCount, args.maxPages ?? DEFAULT_MAX_PAGES)
        const maxCharsPerPage = args.maxCharsPerPage ?? MAX_CHARS_PER_PAGE
        const pages = readSelectedPages(bytes, selected, maxCharsPerPage)
        return {
          path: hostPath,
          bytes: bytes.byteLength,
          ...(summary.version === undefined ? {} : { version: summary.version }),
          docInfo: summary.docInfo,
          pageCount: summary.pageCount,
          returnedPages: pages.map((page) => page.page),
          pages,
          maxCharsPerPage: Math.max(1, Math.floor(maxCharsPerPage)),
          ...(summary.skipped.length === 0 ? {} : { skippedEntries: summary.skipped }),
        }
      },
    }),
  )
}

/**
 * 插件入口。
 *
 * @param ctx 宿主上下文
 * @returns 无返回值
 */
export function apply(ctx: Context): void {
  registerFontRoutes(ctx)
  registerReadTool(ctx)
}
