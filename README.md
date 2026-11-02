# dsh-ofd-viewer

在 DeepSeek Harness Web UI 里直接阅读 OFD（GB/T 33190 版式文档）的插件。阅读器使用
[ofdrw-viewer-ui](https://github.com/ofdrw/ofdrw-viewer) 官方 npm 包 `@ofdrw/ofdrw-viewer-ui`
（MIT），宿主侧另提供 `ofd_read` 工具，让模型直接读取 OFD 的元数据与分页文本。

## 能力

| 入口 | 说明 |
| --- | --- |
| 输入框附件 | 拖入/选择 `.ofd` 后附件卡片出现「查看」，点击打开 OFD 阅读面板 |
| OFD 阅读面板 | 面板右上角 `＋` 可直接选择本地 `.ofd` 文件；支持「内嵌」切换版式 |
| 右侧栏文档预览 | 为 `.ofd` 注册专用渲染器：从文件树、交付卡片、`@文件` 引用打开即渲染 |
| `ofd_read` 工具 | 返回页数、OFD 版本、文档信息与指定页文本（不做 OCR） |

阅读器功能随官方组件全开：连续滚动、缩放/旋转、缩略图、大纲、书签、附件、图层、查找、
选中复制、打印、图片与原 OFD 导出、签章覆盖层与验证。

## 目录结构

```
.
├── src/host/             宿主半：字体静态路由 + ofd_read 工具 + OFD 文本抽取
├── src/client/           客户端半：入口、契约、组件、阅读器挂载与样式
├── src/styles/           官方阅读器样式（构建时从依赖包抽取）
├── src/types/            宿主运行时包的最小类型声明
├── assets/fonts/         内置思源宋体/黑体（OFL 1.1，见 NOTICE.md）
├── scripts/build.mjs     esbuild 构建脚本
├── test/                 单元测试与 OFD 样例
├── lib/                  构建产物（不入库）
├── locale/ icon.svg      插件列表显示信息
└── cordis.patch.yml      Bundle 补丁
```

## 开发

```bash
npm install        # 安装依赖（含 @ofdrw/ofdrw-viewer-ui）
npm run typecheck  # tsc 严格模式
npm test           # 纯逻辑单测（文件名判断、地址解析、OFD 文本抽取、清单校验）
npm run build      # 生成 lib/
```

安装到 profile：在 Harness 内用 `plugin_manager` 的 `install_bundle`，目标为本目录绝对路径。

## 构建要点

- **宿主半**自包含打包：profile 安装的插件无法解析 dsh 安装目录里的宿主包，因此
  `@deepseek-ai/dsh-fs` / `dsh-tools` / cordis 在构建期内联；内联 SDK 读取自身
  `package.json` 取版本的语句在写盘时替换为构建期常量。
- **客户端半**包进 Harness 模块工厂壳（`window.__ModuleLoader__.load`）：React 与
  `react/jsx-runtime` 在运行时从宿主模块表取用；官方阅读器作为普通依赖被内联进
  `lib/client/client.js`（约 3.3 MB）。
- **字体**由宿主路由 `/ofd-viewer-plugin/fonts/*` 提供，阅读器缺字时回退到内置思源宋体/黑体。

## 已知边界

- `ofd_read` 只抽取 `TextCode` 文本，扫描件需先用 MinerU 一类的工具解析。
- 阅读器固定浅色主题（白色纸张与工具栏文字在深色宿主下依然清晰）。
- 内置字体约 19 MB，插件包体积因此偏大；如需精简可删除 `assets/fonts/` 并去掉字体路由。
