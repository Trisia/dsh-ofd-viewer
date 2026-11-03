/**
 * 输入框附件栏渲染测试。
 *
 * 背景：附件栏以 `priority: -100` 覆盖宿主 `conversation.input.attachments`，
 * 覆盖后必须完整还原宿主的图片缩略图形态。曾经只渲染 `kind === 'file'` 的卡片，
 * 导致粘贴的图片在输入框里什么都不显示。这里用最小 React 桩驱动构建产物，
 * 断言图片附件与 OFD 文件卡片同时出现在轨道上。
 * 运行：pnpm build 之后执行 `node --test test/*.test.mjs`
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

/** 项目根目录。 */
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 1 个像素的 PNG data URL，模拟宿主生成的草稿对象 URL。 */
const PREVIEW_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * 遍历桩渲染出的节点树，按谓词收集元素。
 *
 * @param node 节点（元素、数组或文本）
 * @param predicate 判定函数
 * @param found 收集结果
 * @returns 收集结果
 */
function collect(node, predicate, found = []) {
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const child of node) collect(child, predicate, found)
    return found
  }
  if (node.__element === true && predicate(node)) found.push(node)
  collect(node.children, predicate, found)
  return found
}

/**
 * 在最小 React/DOM 替身里加载客户端半，取出附件栏组件。
 *
 * @returns 在给定属性下渲染附件栏并返回节点树的函数
 */
function loadAttachments() {
  const bundle = readFileSync(join(projectRoot, 'lib/client/client.js'), 'utf8')
  /** 附件栏组件（由插槽桩记录）。 */
  let attachmentsComponent
  /** 组件渲染期间用到的 React 桩。 */
  const react = {
    createElement: (type, props, ...children) => ({
      __element: true,
      type,
      props,
      children: children.length === 1 ? children[0] : children,
    }),
    jsx: (type, props) => ({
      __element: true,
      type,
      props,
      children: (props ?? {}).children,
    }),
    jsxs: (type, props) => ({
      __element: true,
      type,
      props,
      children: (props ?? {}).children,
    }),
    Fragment: 'Fragment',
    useRef: () => ({ current: 0 }),
    useState: (value) => [value, () => {}],
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useEffect: () => {},
  }
  const sandbox = {
    document: {
      createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {}, click() {} }),
      head: { appendChild() {} },
      body: { appendChild() {} },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
    },
    console,
    setTimeout,
    clearTimeout,
    require: (specifier) => {
      if (specifier === 'react') return react
      if (specifier === 'react/jsx-runtime') return react
      if (specifier === 'react-dom') return { createPortal: (node) => node }
      return {}
    },
  }
  sandbox.window = sandbox
  sandbox.globalThis = sandbox
  let registration
  sandbox.__ModuleLoader__ = { load: (value) => (registration = value) }
  sandbox.window.__DSH_MODULE_LOADER__ = sandbox.__ModuleLoader__
  vm.createContext(sandbox)
  vm.runInContext(bundle, sandbox, { filename: 'client.js', timeout: 20000 })
  const produced = registration.factory((specifier) => sandbox.require(specifier))
  const plugin = produced?.default ?? produced
  plugin.apply({
    get: () => undefined,
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (_key, callback) => (callback(), () => {}),
      register: (options, component) => {
        if (options.name === 'conversation.input.attachments') attachmentsComponent = component
        return () => {}
      },
    },
    layout: { selectPanel: () => {} },
    effect: (callback) => callback(),
  })
  assert.ok(attachmentsComponent !== undefined, '插件应注册 conversation.input.attachments')

  /**
   * 以给定附件渲染一次附件栏。
   *
   * @param props 附件栏属性
   * @returns 渲染出的节点树
   */
  return (props) =>
    attachmentsComponent({
      canAcceptDrop: true,
      onAddFiles: () => {},
      onRemoveAttachment: () => {},
      uploads: {},
      onRetryFile: () => {},
      t: (key) => key,
      openOfd: () => {},
      ...props,
    })
}

test('图片附件渲染为缩略图，与 OFD 文件卡片并列', () => {
  const render = loadAttachments()
  const tree = render({
    attachments: [
      { kind: 'image', id: 'img-1', file: { name: 'paste.png', size: 1024 }, previewUrl: PREVIEW_URL },
      { kind: 'file', id: 'ofd-1', file: { name: '合同.ofd', size: 4096 } },
    ],
    uploads: { 'ofd-1': { status: 'ready' } },
  })
  const images = collect(tree, (node) => node.type === 'img')
  assert.equal(images.length, 1, '图片附件必须渲染出缩略图')
  assert.equal(images[0].props.src, PREVIEW_URL, '缩略图使用草稿对象 URL')

  const thumbnails = collect(tree, (node) => node.props?.className === 'ofd-pv-thumb')
  assert.equal(thumbnails.length, 1, '缩略图按钮用于打开原图')

  const cards = collect(tree, (node) => node.props?.className === 'ofd-pv-card')
  assert.equal(cards.length, 1, 'OFD 附件仍渲染为文件卡片')
  assert.equal(cards[0].props.title, '合同.ofd')
})

test('只有图片附件时也渲染轨道而不是空白', () => {
  const render = loadAttachments()
  const tree = render({
    attachments: [{ kind: 'image', id: 'img-1', file: { name: 'paste.png', size: 1024 }, previewUrl: PREVIEW_URL }],
  })
  const rails = collect(tree, (node) => node.props?.className === 'ofd-pv-rail')
  assert.equal(rails.length, 1, '图片附件必须出现在附件轨道里')
  assert.equal(collect(tree, (node) => node.type === 'img').length, 1)
})

test('没有附件且未拖拽时不渲染任何内容', () => {
  const render = loadAttachments()
  assert.equal(render({ attachments: [] }), null)
})
