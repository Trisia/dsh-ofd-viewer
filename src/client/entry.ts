/**
 * 浏览器模块入口：向 Harness 模块表登记本插件的工厂函数。
 * React 由宿主模块表提供（基线模块），插件只记录 require，渲染时再经 src/react-runtime.ts 取用。
 */
import type { ClientModule } from './contracts.js'
import module from './index.js'
import { setHostRequire } from '../commonjs.js'

/**
 * 工厂自建的宿主模块加载器：构建脚本把整个 bundle 包进 Harness 模块工厂的壳里
 * （见 scripts/build.mjs 的 HEADER/FOOTER），`factory(require)` 的 require 在「壳」的参数
 * 作用域，而 bundle 代码位于其内部 IIFE 中；这里在自定义工厂函数的函数体里取到它，
 * 因此 `__dshRequire` 同时具备闭包变量与模块级标识符两重身份 ——
 * 闭包内可直接调用，bundle 顶层（两个作用域重叠处）也能解析到。
 *
 * @returns 插件模块面
 */
function registerPlugin(): ClientModule {
  // 宿主模块加载器：构建壳（scripts/build.mjs 的 HEADER）在自己的作用域声明了同名变量，
  // bundle 顶层因此能按词法作用域解析到它；这里通过全局槽位拿到同一份并交给公共层复用。
  // eslint-disable-next-line no-var -- 与构建壳中的同名声明对应
  var __dshRequire = (globalThis as unknown as { __DSH_OFD_VIEWER_REQUIRE__?: (specifier: string) => unknown })
    .__DSH_OFD_VIEWER_REQUIRE__
  if (typeof __dshRequire !== 'function') throw new Error('dsh-ofd-viewer: host module loader is missing')
  setHostRequire({ require: __dshRequire })
  return {
    name: module.name,
    inject: module.inject,
    apply: module.apply,
    internal: module.internal,
  }
}

export default registerPlugin
