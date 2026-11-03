/**
 * 客户端半登记时序测试。
 *
 * 背景：启动图按 URL 长度把插件切成多个并行加载的批次，`dsh.client.inject`
 * 只保证同一批次内的先后。插件与文档预览落在不同批次时，插件 apply 时
 * documentPreviews 可能还不存在。这里用最小桩直接驱动构建产物验证两种情况：
 * 服务已就绪应立即登记，服务晚到应等待后登记。
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

/**
 * 在最小 DOM/模块加载器替身里加载客户端半，返回插件的 apply 与上下文构造器。
 *
 * @returns 插件模块、已记录的服务表与登记结果
 */
function loadPlugin() {
  const bundle = readFileSync(join(projectRoot, 'lib/client/client.js'), 'utf8')
  /** 服务表：由调用方决定何时放入 documentPreviews。 */
  const services = new Map()
  /** documentPreviews 的登记结果。 */
  const registered = []
  /** 沙箱内定时器调用次数。 */
  const counts = { timers: 0 }
  const originalSetTimeout = globalThis.setTimeout
  const sandbox = {
    requiredModules: [],
    document: {
      createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {} }),
      head: { appendChild() {} },
      querySelector: () => null,
    },
    console,
    setTimeout: (callback, delay) => {
      counts.timers += 1
      return originalSetTimeout(callback, delay)
    },
    clearTimeout,
    require: (specifier) => (specifier.startsWith('react') ? rendererStub.react : {}),
  }
  sandbox.window = sandbox
  sandbox.globalThis = sandbox
  let registration
  sandbox.__ModuleLoader__ = {
    load: (value) => {
      registration = value
    },
  }
  sandbox.window.__DSH_MODULE_LOADER__ = sandbox.__ModuleLoader__
  vm.createContext(sandbox)
  vm.runInContext(bundle, sandbox, { filename: 'client.js', timeout: 20000 })
  const produced = registration.factory(() => ({}))
  const plugin = produced?.default ?? produced
  /** 记录 event 清理函数的上下文桩。 */
  const context = {
    get: (name) => services.get(name),
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: { register: () => () => {}, inject: (_key, callback) => { callback(); return () => {} } },
    layout: { selectPanel: () => {} },
    effect: (callback) => {
      callback()
    },
    on: () => () => {},
    inject: () => () => {},
  }
  return { plugin, services, registered, counts, context }
}

test('documentPreviews 已就绪时立即登记渲染器', () => {
  const { plugin, services, registered, counts, context } = loadPlugin()
  services.set('documentPreviews', {
    register: (definition) => {
      registered.push(definition)
      return () => {}
    },
  })
  plugin.apply(context)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].id, '@cliven/dsh-ofd-viewer/ofd')
  assert.equal(registered[0].loading, 'renderer')
  // 产物在 vm 沙箱里创建，数组原型与当前 realm 不同，按值比较
  assert.equal([...registered[0].extensions].join(','), 'ofd')
  assert.equal(counts.timers, 0, '服务已就绪时不应安排轮询')
})

test('documentPreviews 晚于插件就绪时仍能登记', async () => {
  const { plugin, services, registered, counts, context } = loadPlugin()
  plugin.apply(context)
  assert.equal(registered.length, 0, '服务缺失时不应登记')
  assert.ok(counts.timers > 0, '服务缺失时应安排重试')
  services.set('documentPreviews', {
    register: (definition) => {
      registered.push(definition)
      return () => {}
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(registered.length, 1)
  assert.equal(registered[0].loading, 'renderer')
})

/** 渲染体替身：最小 React 实现，让渲染体工厂可以脱离 React 运行。 */
const rendererStub = {
  /**
   * 渲染体用到的 React 桩：不做调度，直接返回可断言的节点。
   */
  react: {
    createElement: (type, props, ...children) => ({ type, props, children }),
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
    Fragment: 'Fragment',
    // 真实 React 在 commit 阶段把 DOM 节点写入 ref.current，这里直接给出容器
    useRef: () => ({ current: rendererStub.container }),
    useState: (value) => [value, () => {}],
    useEffect: (effect) => {
      const cleanup = effect()
      if (typeof cleanup === 'function') rendererStub.effects.push(cleanup)
    },
    useLayoutEffect: () => {},
  },
  /** 渲染体挂载阅读器的容器桩 */
  container: {
    style: {},
    replaceChildren() {},
    appendChild() {},
    querySelector: () => null,
  },
  /** 渲染体留下的 effect 清理函数 */
  effects: [],
  /** 测试期间捕获的 console.error，阅读器装载失败等噪音不污染输出 */
  errors: [],
  /**
   * 在替身里执行一次渲染体工厂。
   *
   * @param factory 调用渲染体工厂的函数
   * @returns 渲染出的根节点
   */
  run(factory) {
    this.effects = []
    return factory()
  },
}

/**
 * 在真实 Cordis 里挂载构建产物的客户端半。
 *
 * 宿主把 Remote 命名空间注册成名字含点的独立服务（`remote.workspaceFiles`），
 * 只有按服务名 `ctx.get` 才取得到；写成 `ctx.remote.workspaceFiles` 会因为
 * `remote` 未注入而抛 cannot get property。这里用真 Cordis 复现宿主的服务布局，
 * 保证渲染体注册时拿到的确实是该命名空间服务。
 *
 * @returns 插槽登记结果、渲染体插槽注册表与卸载句柄
 */
async function loadPluginInCordis() {
  const cordis = await import('@deepseek-ai/cordis')
  const root = new cordis.Context()
  /** 侧栏插槽登记结果 */
  const registrations = []
  /** 渲染体插槽组件 */
  const bodies = []
  /** readBytes 调用记录 */
  const calls = []
  /** 读取字节桩：返回 1 字节、版本 v1 */
  const readBytes = async (sessionId, path) => {
    calls.push({ sessionId, path })
    return { ok: true, value: { data: new Uint8Array([0]), version: 'v1' } }
  }
  root.plugin({
    name: 'host',
    apply(ctx) {
      ctx.provide('slots', {
        register: (options, component) => {
          registrations.push(options)
          if (options.name === 'sidebar.right.tab.document') bodies.push(component)
          return () => {}
        },
        inject: (_key, callback) => callback(),
      })
      ctx.provide('locale', { register: () => () => {}, bind: () => (key) => key })
      ctx.provide('layout', { selectPanel: () => {} })
      ctx.provide('documentPreviews', { register: () => () => {} })
      ctx.plugin({
        name: 'remote.workspaceFiles',
        inject: ['slots'],
        apply: (ctx) => ctx.provide('remote.workspaceFiles', { readBytes }),
      })
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 50))
  const bundle = readFileSync(join(projectRoot, 'lib/client/client.js'), 'utf8')
  const sandbox = {
    requiredModules: [],
    document: {
      createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {} }),
      head: { appendChild() {} },
      querySelector: () => null,
    },
    console: { ...console, error: (...args) => rendererStub.errors.push(args.join(' ')) },
    setTimeout,
    clearTimeout,
    AbortController,
    TextEncoder,
    TextDecoder,
    crypto: globalThis.crypto,
    require: (specifier) => {
      sandbox.requiredModules.push(specifier)
      return specifier.startsWith('react') ? rendererStub.react : {}
    },
  }
  sandbox.window = sandbox
  sandbox.globalThis = sandbox
  let registration
  sandbox.__ModuleLoader__ = { load: (value) => { registration = value } }
  sandbox.window.__DSH_MODULE_LOADER__ = sandbox.__ModuleLoader__
  sandbox.__DSH_OFD_VIEWER_REQUIRE__ = sandbox.require
  vm.createContext(sandbox)
  vm.runInContext(bundle, sandbox, { filename: 'client.js', timeout: 20000 })
  // 宿主模块加载器：factory 的参数就是 bundle 取 React 用的 require
  const plugin = registration.factory(sandbox.require)
  const dispose = root.plugin(plugin.default ?? plugin)
  await new Promise((resolve) => setTimeout(resolve, 100))
  return { registrations, bodies, calls, dispose, requiredModules: sandbox.requiredModules }
}

test('真 Cordis 下渲染体能取到 remote.workspaceFiles 并读到字节', async () => {
  const { registrations, bodies, calls } = await loadPluginInCordis()
  const definition = registrations.find((item) => item.name === 'sidebar.right.tab.document')
  assert.equal(definition?.key, '@cliven/dsh-ofd-viewer/ofd')
  assert.equal(bodies.length, 1, '渲染体应已注册')
  // 真正调用渲染体工厂：按 ctx.remote.workspaceFiles 取服务会在这里抛
  // cannot get property "remote" without inject
  const node = rendererStub.run(() =>
    bodies[0]({ resourceAddress: 'dsh-resource://file/session/s1/a.ofd', content: { kind: 'renderer', revision: 1 } }),
  )
  assert.equal(node?.type, 'div')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(calls.length, 1, () => `渲染体应调用 readBytes 读取字节，捕获的错误：${rendererStub.errors.join(' / ')}`)
  assert.equal(calls[0].sessionId, 's1')
  assert.equal(calls[0].path, 'a.ofd')
})
