# 内置字体说明

本目录下的字体文件随插件分发，用于在 OFD 文档没有内嵌字体时兜底显示中文。
两个文件都不依赖外部 CDN：构建时由 `scripts/build.mjs` 原样复制到 `lib/client/assets/fonts/`，
再由宿主半的字体路由 `/ofd-viewer-plugin/fonts/*` 提供，阅读器按需请求。

## 字体清单

| 文件 | 字体 | 真实 family 名 | 授权 | 体积 |
| --- | --- | --- | --- | --- |
| `source-han-serif-sc.woff2` | 思源宋体（Noto Serif CJK SC） | `Noto Serif CJK SC` | SIL Open Font License 1.1 | 11 098 716 B（约 10.6 MiB） |
| `source-han-sans-sc.woff2` | 思源黑体（Noto Sans CJK SC） | `Noto Sans CJK SC` | SIL Open Font License 1.1 | 7 817 104 B（约 7.5 MiB） |

文件名固定，不随内容变化；字体路由下发 `cache-control: private, max-age=86400`（一天）。
文件名与路由白名单写在 `src/host/index.ts` 的 `FONT_FILES`，阅读器的字体选项写在
`src/client/viewer.ts` 的 `viewerOptions()`，替换字体文件时两处需要保持一致。

## 子集范围

两个字体都由完整字体抽取单一字体面后做同规格子集，仅保留：

- CJK 统一表意文字基本区 `U+4E00–U+9FFF`（20992 字，常用汉字全覆盖）
- CJK 标点 `U+3000–U+303F`、全角形式 `U+FF00–U+FFEF`、兼容标点 `U+FE10–FE4F`
- 基本拉丁与扩展拉丁 `U+0020–U+024F`、常用标点 `U+2000–U+206F`
- 带圈数字、箭头、数学符号、制表符、几何图形、杂项符号

**不含** CJK 扩展区 `ExtA–ExtE`（`U+3400–U+4DBF` 及更高平面）与部首补充等
生僻区块：这些字仍会触发 `W_GLYPH_MISSING`，属于已知边界。

## 授权与来源

### 思源宋体（Noto Serif CJK SC）

- 上游：Adobe Source Han Serif / Google Noto Serif CJK，二者为同一套字形。
- 授权：SIL Open Font License 1.1，允许再分发与子集化。
- 本次来源：系统包 `fonts-noto-cjk` 的 `/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc`，
  抽取第 2 面（`Noto Serif CJK SC`）。
- 版权：Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.

### 思源黑体（Noto Sans CJK SC）

- 上游：Adobe Source Han Sans / Google Noto Sans CJK，二者为同一套字形。
- 授权：SIL Open Font License 1.1，允许再分发与子集化。
- 本次来源：系统包 `fonts-noto-cjk` 的 `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`，
  抽取第 2 面（`Noto Sans CJK SC`）。
- 版权：Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.

## 重新生成

字体由 `fonttools` 从系统字体中抽取单一字体面，并按上述区块做子集，可复现子集范围与输出：

```bash
# 需要 Python 3.10+、fonttools 与 brotli
python3 -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools brotli
.venv-fonts/bin/python .tmp/build-fonts.py   # 核心逻辑见下
```

子集脚本的核心逻辑（脚本本身不入库，用到时按下面的内容重建即可）：

```python
from fontTools.ttLib import TTCollection
from fontTools.subset import Subsetter, parse_unicodes

RANGES = ['U+4E00-9FFF', 'U+3000-303F', 'U+FF00-FFEF', 'U+FE10-FE4F',
          'U+0020-024F', 'U+2000-206F', 'U+2460-24FF', 'U+2190-21FF',
          'U+2200-22FF', 'U+2500-257F', 'U+25A0-25FF', 'U+2600-26FF']

SOURCES = [
    ('/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc', 'assets/fonts/source-han-serif-sc.woff2'),
    ('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'assets/fonts/source-han-sans-sc.woff2'),
]

for source, target in SOURCES:
    font = TTCollection(source).fonts[1]   # 第 2 面即 SC 字体
    subsetter = Subsetter()
    subsetter.populate(unicodes=parse_unicodes(','.join(RANGES)))
    subsetter.subset(font)
    font.flavor = 'woff2'
    font.save(target)
```

输出体积明显小于原字体，是因为只保留了上述区块，并非压缩了字库质量。
