# dsh-ofd-viewer

让 DeepSeek Harness Web 界面直接阅读 **OFD**（GB/T 33190 版式文档）的插件；同时提供
`ofd_read` 工具，让模型不渲染界面也能读到 OFD 的元数据与分页文本。

阅读器基于官方 [ofdrw-viewer-ui](https://github.com/ofdrw/ofdrw-viewer) 的 npm 包
[`@ofdrw/ofdrw-viewer-ui`](https://github.com/ofdrw/ofdrw-viewer/blob/main/packages/ofdrw-viewer-ui/README.md)（MIT）。

![插件架构](docs/diagrams/architecture.png)

---

## 功能

### 界面入口

| 入口 | 操作 | 说明 |
| --- | --- | --- |
| **输入框附件** | 拖入或选择 `.ofd` → 附件卡片点「查看」 | 草稿文件尚未提交也能先看内容 |
| **OFD 阅读面板** | 面板右上角 `＋` 选择本地文件 | 支持「内嵌」切换版式（带边框的卡片式 / 铺满） |
| **右侧栏文档预览** | 文件树、交付卡片、`@文件` 引用里点 `.ofd` | 与 PDF/Word 预览并列，复用同一套文档预览框架 |

### 阅读器能力

随官方组件全开：连续滚动、缩放/旋转、页码跳转、缩略图、大纲、书签、附件、图层显示控制、
全文查找、文本选中复制、打印、图片导出、原始 OFD 导出、签章覆盖层与验证。

### `ofd_read` 工具（给模型用）

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `path` | string，必填 | OFD 路径，相对路径以会话工作目录为基准 |
| `pages` | string | 页码选择：`"3"`、`"1-5"`、`"1,3,7-9"`；省略时取前若干页 |
| `maxPages` | integer | 最多返回页数，默认 30 |
| `includeText` | boolean | `false` 时只返回元数据，默认 `true` |

返回页数、OFD 版本、文档信息（DocInfo）、`returnedPages`、每页文本与解压失败的条目；
单页超过 4000 字符会截断并给出 `truncatedChars`。

---

## 安装

插件以 **Bundle** 形式安装到 DSH profile（本目录即插件包目录）：

- 在 Harness 里用 `plugin_manager` → `install_bundle`，目标填本目录**绝对路径**；或
- 命令行：`dsh plugin --profile <name> install`（先把本包加入该 profile 的依赖）。

安装后需要**重新启动 dsh / 刷新页面**：客户端启动图在进程启动时组合，已运行的进程不会自动加载新插件。

## 环境要求

| 项 | 要求 |
| --- | --- |
| DSH | 提供 `webServer`、`tools`、`fs`、`workingDirectory` 服务的 Web 版（`dsh --profile web`） |
| 浏览器 | Chrome ≥ 67 / 其他现代浏览器（阅读器依赖 Canvas 2D） |
| Node（构建期） | ≥ 22 |

---

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
├── docs/
│   ├── DESIGN.md              设计文档（决策、数据流、取舍）
│   └── diagrams/              交互式架构图与时序图（.html 可缩放/搜索/切换主题）
├── locale/                    插件列表显示名与描述
├── icon.svg                   插件图标
├── cordis.patch.yml           Bundle 补丁
└── lib/                       构建产物（不入库）
```

---

## 开发

```bash
npm install        # 安装依赖（含官方阅读器 @ofdrw/ofdrw-viewer-ui）
npm run typecheck  # tsc 严格模式
npm test           # 纯逻辑单测：文件名判断、资源地址、OFD 文本抽取、清单一致性
npm run build      # 生成 lib/host 与 lib/client
```

修改代码后重新 `npm run build`，再在 Harness 里停用/启用本插件（或重启 dsh）以加载新产物。

### 构建产出

| 产物 | 说明 |
| --- | --- |
| `lib/host/index.js` | 宿主半，**自包含**（profile 安装的插件解析不到 dsh 安装目录的包） |
| `lib/host/ofd-read.js` | 文本抽取，可单独用于调试 |
| `lib/client/client.js` | 客户端半，约 3.3 MB，内含官方阅读器 |
| `lib/client/assets/fonts/` | 内置字体，由宿主路由 `/ofd-viewer-plugin/fonts/*` 提供 |

### 常见问题

**面板打开了，但显示“没有待预览的 OFD 文件”**
先通过输入框附件卡片上的「查看」或面板右上角 `＋` 选择文件；右侧栏预览走的是另一条路径（见下方）。

**文件名、正文发虚或缺字**
先确认 `/ofd-viewer-plugin/fonts/source-han-serif-sc.woff2` 返回 200；若为 404，
说明宿主半没激活（重启 dsh 后仍未激活，检查插件日志中的导入错误）。

**深色主题下阅读器是浅色**
这是刻意设计：白色纸张与工具栏文字在深色宿主下依然清晰。

**右侧栏预览打不开**
需要宿主的文档预览能力（`sidebar.right.tab.document` 插槽与 `.ofd` 渲染器注册）；若宿主版本过旧没有该扩展点，请改用附件入口或面板 `＋`。

---

## 兼容性与边界

- **只抽文本，不做 OCR**：`ofd_read` 抽取 `<TextCode>` 文本；扫描件请先用 MinerU 等工具解析。
- **体积**：内置字体约 19 MB + 阅读器约 3.3 MB。可删除 `assets/fonts/` 并去掉字体路由瘦身，代价是缺字文档整页空白。
- **主题固定浅色**：见上方说明。
- **大文档**：数千页文档首屏会更慢（官方未承诺该规模性能）。
- **草稿附件**：只有通过宿主校验、上传完成的附件才出现「查看」。

更完整的决策记录、数据流与备选方案见 [docs/DESIGN.md](./docs/DESIGN.md)。

---

## 许可证

本插件代码：MIT。官方阅读器 `@ofdrw/ofdrw-viewer-ui`：MIT；
内置字体思源宋体/黑体：SIL Open Font License 1.1（见 `assets/fonts/NOTICE.md`）。
