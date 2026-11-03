<p align="center">
  <img src="./icon.svg" width="72" height="72" alt="OFD 预览插件图标">
</p>

<h1 align="center">dsh-ofd-viewer</h1>

<p align="center">
  <strong>在 DSH 里直接看 OFD</strong><br>
  DeepSeek Harness Web 的 OFD（GB/T 33190 版式文档）预览插件：右侧栏、独立面板、输入框附件三处入口都能直接阅读 OFD，另带一个 <code>ofd_read</code> 工具，让模型不渲染界面也能读到 OFD 的元数据与分页文本。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@cliven/dsh-ofd-viewer"><img src="https://img.shields.io/npm/v/@cliven/dsh-ofd-viewer?logo=npm" alt="npm 版本"></a>
  <a href="https://github.com/Trisia/dsh-ofd-viewer/actions/workflows/ci.yml?query=branch%3Amaster"><img src="https://github.com/Trisia/dsh-ofd-viewer/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI 构建状态"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/Trisia/dsh-ofd-viewer" alt="MIT License"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/dsh-%E2%89%A50.2.1--rc.2-4B32C3" alt="DSH 版本要求：>= 0.2.1-rc.2"></a>
</p>

<p align="center">
  <img src="./docs/preview.png" alt="DSH 右侧栏文档预览中渲染的 OFD 文档：左侧缩略图，中间页面对开显示，右侧是 OFD 阅读器工具栏，可切换大纲、签章、图层、查找" width="100%">
</p>

[English](README.en.md) | 中文

## 能做什么

DSH 自带的文档预览覆盖 PDF、Word 等格式，但国内公文、电子发票、合同与档案大量使用 OFD。
装上前，`.ofd` 在右侧栏里只显示成二进制；装上后：

- **右侧栏直接看**：文件树、交付卡片、`@文件` 引用里点 `.ofd`，与 PDF/Word 预览并列，走同一套文档预览框架。
- **草稿附件先看**：输入框附件卡片上直接有「查看」，文件还没提交给模型也能先翻一遍。
- **独立 OFD 面板**：面板右上角 `＋` 选择任意本地 OFD，支持「内嵌」切换版式。
- **模型读得到**：`ofd_read` 工具返回页数、版本、文档信息与每页文本，不用渲染也能回答“这张发票的金额是多少”。
- **功能全开**：连续滚动、缩放/旋转、页码跳转、缩略图、大纲、书签、附件、图层显示控制、全文查找、文本选中复制、打印、图片导出、原始 OFD 导出、签章覆盖层与验证。
- **中文不缺字**：内置思源宋体/黑体，文档没有内嵌字体时也不会整页空白。

阅读器基于官方 [ofdrw-viewer-ui](https://github.com/ofdrw/ofdrw-viewer) 的 npm 包
[`@ofdrw/ofdrw-viewer-ui`](https://github.com/ofdrw/ofdrw-viewer/blob/main/packages/ofdrw-viewer-ui/README.md)（MIT）。

## 安装

在 DSH 的 **设置 → 插件 → 添加插件** 中填入插件名与版本号：

```text
@cliven/dsh-ofd-viewer@0.1.0
```

也可以用命令行安装：

```bash
dsh plugin --profile web add @cliven/dsh-ofd-viewer@0.1.0
```

版本号固定为当前发布版本（现在是 `0.1.0`），升级时替换 `@` 后面的数字即可。

安装后重启 DSH Web 服务并刷新页面：客户端启动图在进程启动时组合，已经运行的进程不会自动加载新插件。

从源码构建并挂到本地 profile 的方法见[开发文档](./docs/DEVELOPMENT.md#挂到-dsh-profile)。

## 使用

### 三处入口

| 入口 | 操作 | 说明 |
| --- | --- | --- |
| **输入框附件** | 拖入或选择 `.ofd` → 附件卡片点「查看」 | 草稿文件尚未提交也能先看内容；粘贴的图片照常显示缩略图 |
| **OFD 面板** | 面板右上角 `＋` 选择本地文件 | 支持「内嵌」切换版式（带边框的卡片式 / 铺满） |
| **右侧栏文档预览** | 文件树、交付卡片、`@文件` 引用里点 `.ofd` | 与 PDF/Word 预览并列，复用同一套文档预览框架 |

草稿附件的「查看」入口示意：

<p align="center">
  <img src="./docs/composer-attachment.png" alt="输入框上方的 OFD 附件卡片：左侧 OFD 图标，中间显示文件名与大小，右侧是「查看」按钮与移除按钮" width="100%">
</p>

### 阅读器操作

| 操作 | 效果 |
| --- | --- |
| 滚轮 / 拖动 | 连续滚动翻页 |
| 缩略图、大纲、书签 | 左侧栏切换，点击跳转 |
| 图层、签章、附件 | 右侧栏切换，签章可做覆盖层验证 |
| 全文查找 | 工具栏搜索框，命中处高亮并可跳转 |
| 选中文字 | 选中后可复制 |
| 打印、导出 | 打印当前文档、导出图片、导出原始 OFD |

### `ofd_read` 工具

给模型用的工具，参数与返回如下：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `path` | string，必填 | OFD 路径，相对路径以会话工作目录为基准 |
| `pages` | string | 页码选择：`"3"`、`"1-5"`、`"1,3,7-9"`；可带页内区间，如 `"4#2001-4000"`、`"4-6#1-500"`；省略时取前若干页 |
| `maxPages` | integer | 最多返回页数，默认 30 |
| `maxCharsPerPage` | integer | 每页最多返回的字符数（按 Unicode 字符计），默认 4000 |
| `includeText` | boolean | `false` 时只返回元数据，默认 `true` |

返回页数、OFD 版本、文档信息（DocInfo）、`returnedPages`、每页文本与解压失败的条目。

**长页不会丢内容**：一页超过 `maxCharsPerPage` 时按段返回，该页带有
`offset`（本段起始字符数）、`totalChars`（本页总字符数）、`hasMore`，
以及可直接回传的 `next`，例如：

```json
{ "page": 4, "offset": 1, "totalChars": 5170, "hasMore": true, "next": "4#4001-5170" }
```

再次调用时把 `next` 传给 `pages` 即可读完该页剩余部分，所有片段按顺序拼接等于整页原文。
字符数按 Unicode 字符（码点）计，生僻字与 emoji 都算 1 个字符，不会把字切成半个。

## 更多

- 数据流、插槽与实现取舍：[设计文档](./docs/DESIGN.md)
- 构建、发布与调试：[开发文档](./docs/DEVELOPMENT.md)
- 没有预览、缺字、深色主题等排查：[常见问题](./docs/FAQ.md)

## 许可

本插件代码以 [MIT License](./LICENSE) 发布，Copyright (c) 2026 Quan Guanyu。

内置字体思源宋体/黑体为 SIL Open Font License 1.1（来源与子集范围见
[assets/fonts/NOTICE.md](./assets/fonts/NOTICE.md)）；阅读器 `@ofdrw/ofdrw-viewer-ui` 同为 MIT。
