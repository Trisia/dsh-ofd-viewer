/**
 * 构建脚本：把 TS 源码编译为宿主半与浏览器半产物。
 *
 * - lib/host/*.js：Node ESM；DSH 宿主包（cordis、dsh-fs、dsh-tools）不内联，
 *   交给 DSH 运行时解析——内联版本与宿主版本不一致时插件在加载阶段就会失败；
 * - lib/client/client.js：浏览器 ESM，入口登记到 window.__ModuleLoader__；
 *   官方阅读器 @ofdrw/ofdrw-viewer-ui 是 package.json 里的普通依赖，构建时按需拆成
 *   独立分块在运行时动态 import；React 与 react/jsx-runtime 由宿主模块表提供；
 * - lib/client/assets/fonts：内置思源宋体/黑体（由宿主路由静态提供）。
 */
import { build } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 项目根目录（即插件包目录）。 */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
/** 构建输出根目录。 */
const libRoot = join(packageRoot, 'lib')
/** 模块标识：浏览器模块表按包名登记。 */
const MODULE_ID = '@cliven/dsh-ofd-viewer'

/** 以本项目为基准的 CJS 解析器：把宿主包定位到具体文件，缺失时降级为可选依赖。 */
const requireResolve = createRequire(join(packageRoot, 'package.json')).resolve

/**
 * 宿主包：交给 DSH 运行时解析，不打进宿主半产物。
 * 它们不能写进 package.json 的 dependencies——插件管理器按依赖图把包装进 profile 的
 * node_modules，会盖住宿主自带的同版本包并触发兼容性门禁，所以只能留作裸 import。
 */
const HOST_EXTERNALS = new Set(['@deepseek-ai/cordis', '@deepseek-ai/dsh-fs', '@deepseek-ai/dsh-tools'])

/**
 * 宿主包解析：HOST_EXTERNALS 保持外部引用；其余宿主 SDK 包按构建期安装的版本内联，
 * 解析失败时生成只抛错的空模块，避免版本差异让整份产物打不进包。
 */
const optionalHostDependencies = {
  name: 'optional-host-dependencies',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^@deepseek-ai\// }, (args) => {
      if (HOST_EXTERNALS.has(args.path)) return { path: args.path, external: true }
      try {
        return { path: requireResolve(args.path) }
      } catch {
        return { path: args.path, namespace: 'optional-host' }
      }
    })
    buildApi.onLoad({ filter: /.*/, namespace: 'optional-host' }, (args) => ({
      contents: `throw new Error(${JSON.stringify(`optional dependency ${args.path} is unavailable`)})`,
      loader: 'js',
    }))
  },
}

/**
 * 宿主模块请求：bundle 里出现的 React 与 JSX 运行时改写成对宿主注入 require 的调用。
 */
const HOST_MODULES = {
  name: 'host-module-requires',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({
      path: args.path,
      namespace: args.path === 'react/jsx-runtime' ? 'host-jsx' : 'host-require',
    }))
    buildApi.onLoad({ filter: /.*/, namespace: 'host-require' }, () => ({
      loader: 'js',
      contents: [
        `const m = __dshRequire('react');`,
        `export default m;`,
        `export const Component = m.Component;`,
        `export const Fragment = m.Fragment;`,
        `export const createElement = m.createElement;`,
        `export const useEffect = m.useEffect;`,
        `export const useLayoutEffect = m.useLayoutEffect;`,
        `export const useRef = m.useRef;`,
        `export const useState = m.useState;`,
      ].join('\n'),
    }))
    buildApi.onLoad({ filter: /.*/, namespace: 'host-jsx' }, () => ({
      loader: 'js',
      contents: [
        `const m = __dshRequire('react/jsx-runtime');`,
        `export const jsx = m.jsx;`,
        `export const jsxs = m.jsxs;`,
        `export const jsxDEV = m.jsxDEV;`,
        `export const Fragment = m.Fragment;`,
      ].join('\n'),
    }))
  },
}

/**
 * esbuild 的 IIFE 以 `})();` 收尾；在 IIFE 内部插入入口调用并接收其返回值。
 *
 * @param bundle IIFE 产物的完整代码
 * @returns 返回插件模块面的 IIFE 代码
 */
function insertEntryReturn(bundle) {
  // IIFE 收尾前可能跟着 esbuild 附带的版权注释，因此回退查找最近的 `})();`
  const marker = bundle.lastIndexOf('\n})();')
  if (marker < 0) throw new Error('浏览器半产物不以 IIFE 收尾，构建脚本需要同步更新')
  return `${bundle.slice(0, marker)}\n__DSH_ENTRY_MODULE__ = entry_default();${bundle.slice(marker)}`
}

/** 工厂外壳：Harness 模块加载器按此结构登记浏览器插件。 */
const HEADER = `window.__DSH_MODULE_LOADER__ ??= window.__ModuleLoader__;
window.__ModuleLoader__.load({
  id: ${JSON.stringify(MODULE_ID)},
  factory: (require) => {
    // 宿主模块加载器：bundle 里对 React / JSX 运行时的取用都经过它
    var __dshRequire = require;
    globalThis.__DSH_OFD_VIEWER_REQUIRE__ = require;
    var __DSH_ENTRY_MODULE__;
    var module = { exports: {} };
    var exports = module.exports;
`
const FOOTER = `    return __DSH_ENTRY_MODULE__;
  },
});
`

rmSync(libRoot, { recursive: true, force: true })
mkdirSync(join(libRoot, 'host'), { recursive: true })
mkdirSync(join(libRoot, 'client'), { recursive: true })

// 官方样式：从已安装依赖抽取为字符串模块，供浏览器半动态 import
const viewerCss = readFileSync(join(packageRoot, 'node_modules/@ofdrw/ofdrw-viewer-ui/dist/style.css'), 'utf8')
writeFileSync(
  join(packageRoot, 'src/styles/ofdrw-viewer.css.js'),
  `/** 官方 @ofdrw/ofdrw-viewer-ui 样式表（MIT），由 scripts/build.mjs 从依赖包抽取。 */\nexport default ${JSON.stringify(viewerCss)}\n`,
)

// 宿主半：Node ESM（宿主包保持外部引用）
const hostResult = await build({
  entryPoints: {
    index: join(packageRoot, 'src/host/index.ts'),
    'ofd-read': join(packageRoot, 'src/host/ofd-read.ts'),
  },
  outdir: join(libRoot, 'host'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['node:*'],
  conditions: ['node', 'import', 'default'],
  plugins: [optionalHostDependencies],
  write: false,
  logLevel: 'info',
})

for (const output of hostResult.outputFiles) {
  mkdirSync(dirname(output.path), { recursive: true })
  writeFileSync(output.path, output.text)
}

// 浏览器半：ESM bundle（阅读器依赖按需分块）
const clientResult = await build({
  entryPoints: { client: join(packageRoot, 'src/client/entry.ts') },
  outdir: join(libRoot, 'client'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome100',
  jsx: 'automatic',
  jsxImportSource: 'react',
  write: false,
  plugins: [HOST_MODULES],
  logLevel: 'info',
})

// 取出入口导出的注册函数并与工厂壳拼装：IIFE 产物自带作用域，
// 这里在产物末尾写出返回值（模块加载器只接受函数或带 apply 的对象）
const [clientOutput] = clientResult.outputFiles
writeFileSync(
  join(libRoot, 'client/client.js'),
  `${HEADER}${insertEntryReturn(clientOutput.text)}${FOOTER}`,
)

// 内置字体：由宿主静态路由提供
cpSync(join(packageRoot, 'assets/fonts'), join(libRoot, 'client/assets/fonts'), { recursive: true })

// 产物目录的包描述：让 Node 按 ESM 解析 lib 下的文件
writeFileSync(
  join(libRoot, 'package.json'),
  `${JSON.stringify({ name: 'dsh-ofd-viewer-lib', private: true, type: 'module' }, null, 2)}\n`,
)

process.stdout.write(`built ${packageRoot} -> ${libRoot}\n`)
