# 开发文档

面向需要构建、调试或发布本插件的读者。只想安装和使用请看 [README](../README.md)。

## 环境要求

| 项 | 要求 |
| --- | --- |
| DSH | 提供 `webServer`、`tools`、`fs`、`workingDirectory` 服务的 Web 版（`dsh >= 0.2.1-rc.2`） |
| Node（构建期） | 22（见 `.nvmrc`） |
| 包管理器 | pnpm 11（见 `package.json` 的 `packageManager` 字段） |
| 浏览器 | Chrome ≥ 67 / 其他支持 Canvas 2D 的现代浏览器 |

## 目录结构

```
.
├── src/
│   ├── host/                 宿主半
│   │   ├── index.ts            字体静态路由 + ofd_read 工具注册
│   │   └── ofd-read.ts         OFD（ZIP + XML）文本抽取，仅用 node:zlib
│   ├── client/               客户端半
│   │   ├── entry.ts            浏览器模块入口（登记工厂）
│   │   ├── index.tsx           插件 apply：声明渲染器、注册面板与附件栏
│   │   ├── contracts.ts        宿主客户端接口的最小类型契约
│   │   ├── viewer.ts           官方阅读器加载、挂载与销毁
│   │   ├── styles.ts           插件样式与官方样式注入
│   │   ├── components/         附件栏、侧栏渲染体、主面板、阅读器表面等组件
│   │   └── locale.ts           zh/en 文案
│   ├── commonjs.ts            宿主模块 require 访问器（运行时取 React）
│   ├── styles/                官方阅读器样式字符串模块（构建时生成）
│   └── types/                 宿主运行时包的最小类型声明
├── assets/fonts/              内置思源宋体/黑体（OFL 1.1，见 NOTICE.md）
├── scripts/build.mjs          esbuild 构建脚本
├── test/                      单元测试与 OFD 样例
├── docs/                      设计文档、开发文档、常见问题、截图
├── locale/                    插件列表显示名与描述
├── icon.svg                   插件图标
├── cordis.patch.yml           Bundle 补丁
└── lib/                       构建产物（不入库，发布时随包提供）
```

## 构建与校验

```bash
pnpm install        # 安装依赖（含官方阅读器 @ofdrw/ofdrw-viewer-ui）
pnpm typecheck      # tsc 严格模式
pnpm build          # 生成 lib/host 与 lib/client
pnpm test           # 纯逻辑单测：文件名判断、资源地址、OFD 文本抽取、清单一致性
```

`pnpm test` 直接导入构建产物 `lib/host/ofd-read.js`，因此必须先 `pnpm build`。

### 构建产出

| 产物 | 说明 |
| --- | --- |
| `lib/host/index.js` | 宿主半，约 12 KB（宿主 SDK 包留作裸 import，由 profile 的 `node_modules` 解析） |
| `lib/host/ofd-read.js` | 文本抽取，可单独用于调试 |
| `lib/client/client.js` | 客户端半，约 3.2 MB，内含官方阅读器 |
| `lib/client/assets/fonts/` | 内置字体约 19 MB，由宿主路由 `/ofd-viewer-plugin/fonts/*` 提供 |

修改代码后重新 `pnpm build`，再在 DSH 里停用/启用本插件（或重启 dsh）以加载新产物。

## 挂到 DSH profile

### 以源码目录链接（开发时用）

把本仓库链接进目标 profile 的 `node_modules`，再把包名加进该 profile 的 bundle 列表：

```bash
ln -s /absolute/path/to/dsh-ofd-viewer \
  "${DSH_HOME:-$HOME/.dsh}/profiles/web/node_modules/@cliven/dsh-ofd-viewer"
```

然后在 `${DSH_HOME:-$HOME/.dsh}/profiles/web/package.json` 的 `dsh.profile.bundles` 末尾加一行
`"@cliven/dsh-ofd-viewer"`。重启 dsh 即可。

### 用 npm 包安装（发布后）

```bash
dsh plugin --profile web add @cliven/dsh-ofd-viewer
```

`dsh plugin` 实际把参数转发给 profile 目录里的 pnpm，`add` 之后会更新该 profile 的
`package.json` 依赖与 bundle 列表。

## 发布

版本号写在 `package.json` 的 `version`，同时打同名 tag：

```bash
# 1. 改 package.json 的 version（例如 0.1.0 -> 0.1.1）
# 2. 提交并打 tag
git commit -am "chore: release v0.1.1"
git tag v0.1.1
git push origin master v0.1.1
```

`prepack` 脚本会在打包装时重新构建 `lib/`，`files` 字段只把 `lib/`、`locale/`、`icon.svg`
与 `cordis.patch.yml` 放进 tarball，源码与 `node_modules` 不会进入发布包。

发布前建议本地先验证打包内容：

```bash
pnpm pack --dry-run
```

## 调试

### 浏览器侧

- 阅读器与宿主间的日志统一带 `[ofd-viewer]` 前缀（如 `[ofd-viewer] module load failed`）。
- 字体路由返回 404 说明宿主半没有激活，先看 dsh 启动日志里的插件导入错误。
- 客户端产物包在 `window.__ModuleLoader__.load({ id, factory })` 的工厂壳里；
  如果控制台报 `invalid plugin, expect function or object with an "apply" method`，
  说明工厂壳的返回值装配出了问题，检查 `scripts/build.mjs` 的 `insertEntryReturn()`。

### 宿主侧

`lib/host/ofd-read.js` 可以独立调用，用于验证某个 OFD 的文本抽取是否正常：

```js
import { readFileSync } from 'node:fs'
import { summarizeOfd } from './lib/host/ofd-read.js'

const summary = summarizeOfd(readFileSync('test/fixtures/ofd-viewer-ui-showcase.ofd'), { maxPages: 2 })
console.log(summary.pageCount, summary.pages)
```

### 换一个干净的 DSH 实例

调试插件加载问题时，建议用独立的 `DSH_HOME` 跑一个实例，避免被本机其它 profile 干扰：

```bash
mkdir -p /tmp/dsh-demo
DSH_HOME=/tmp/dsh-demo dsh --profile web --port 3099 --no-open
```

`dsh` 会打印带 token 的地址，用浏览器打开即可。启动日志里的
`entry did not activate` 与 `failed to import` 就是插件加载失败的直接原因。
