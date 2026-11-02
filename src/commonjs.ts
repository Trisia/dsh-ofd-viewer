/**
 * CommonJS 互操作：Harness 浏览器插件以 `factory(require)` 形式运行，
 * 本文件记录宿主注入的 require，供本插件对“运行时模块”（React、官方阅读器）做同步加载。
 * 这里的函数只在运行时调用，不会在 bundle 加载期读取宿主模块表。
 */

/** 全局槽位在 Symbol 注册表中的键。 */
const REQUIRE_KEY = Symbol.for('dsh-ofd-viewer.require')

/** require 持有者。 */
export interface RequireSlot {
  /** 宿主注入的 require */
  require: (specifier: string) => unknown
}

/** 已加载模块缓存：说明符 → 导出。 */
const cache = new Map<string, unknown>()

/**
 * 记录宿主注入的 require（由 client.js 入口调用一次）。
 *
 * @param slot 持有者
 * @returns 无返回值
 */
export function setHostRequire(slot: RequireSlot): void {
  ;(globalThis as unknown as Record<symbol, RequireSlot>)[REQUIRE_KEY] = slot
}

/**
 * 同步加载一个模块（结果缓存）。
 *
 * @param specifier 模块说明符
 * @returns 模块导出
 * @throws {Error} 宿主尚未提供 require 时抛出
 */
export function requireModule<T = unknown>(specifier: string): T {
  const cached = cache.get(specifier)
  if (cached !== undefined) return cached as T
  const slot = (globalThis as unknown as Record<symbol, RequireSlot | undefined>)[REQUIRE_KEY]
  if (slot === undefined) throw new Error('dsh-ofd-viewer: the plugin module has not been loaded yet')
  const loaded = slot.require(specifier)
  cache.set(specifier, loaded)
  return loaded as T
}
