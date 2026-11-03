/**
 * 读取并校验 cordis.patch.yml 与 package.json，防止插件清单与源码漂移。
 * 运行：npm test
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/** 项目根目录。 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('package.json 声明了宿主半、客户端半与列表元数据', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@cliven/dsh-ofd-viewer')
  assert.equal(manifest.exports['.'], './lib/host/index.js')
  assert.equal(manifest.exports['./client'], './lib/client/client.js')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.files.includes('lib/**'))
  assert.ok(manifest.files.includes('locale/*.json'))
  assert.ok(manifest.files.includes('icon.svg'))
})

test('cordis.patch.yml 插入唯一插件行', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /- insert:/)
  assert.equal(patch.match(/id: '@cliven\/dsh-ofd-viewer'/g)?.length, 1)
  assert.match(patch, /name: '@cliven\/dsh-ofd-viewer'/)
})

test('不重复插入宿主自带的侧栏文档预览行，保证组合包可卸载', () => {
  // 只检查条目行，注释里出现的名字不算引用。
  const rows = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
  // ui-sidebar-documentpreview 由宿主 @deepseek-ai/dsh-web-app 的补丁层无条件插入。
  // 本包若再 insert 一次，该宿主组件会计入本包的组件清单，卸载时 plugin-manager
  // 判定「组合包的组件仍在运行」并抛 bundle-in-use，插件将永远无法移除。
  assert.ok(
    !rows.includes('ui-sidebar-documentpreview'),
    'cordis.patch.yml 不得插入宿主的侧栏文档预览行，否则插件无法卸载',
  )
  assert.ok(
    !rows.includes('@deepseek-ai/dsh-client-ui-sidebar-documentpreview'),
    'cordis.patch.yml 不得引用宿主的侧栏文档预览包，否则插件无法卸载',
  )
})

test('宿主 SDK 包不能出现在 dependencies 里', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  // 插件管理器按依赖图把包装进 profile 的 node_modules，会盖住宿主自带版本并触发兼容性门禁
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    assert.ok(!name.startsWith('@deepseek-ai/'), `${name} 不应作为插件依赖安装进 profile`)
  }
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-documentpreview'))
})

test('宿主半产物只保留 DSH 运行时提供的裸 import', () => {
  const source = readFileSync(join(root, 'lib/host/index.js'), 'utf8')
  const allowed = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-fs', '@deepseek-ai/dsh-tools']
  const bare = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)]
    .map((match) => match[1])
    .filter((specifier) => !specifier.startsWith('node:'))
  for (const specifier of bare) assert.ok(allowed.includes(specifier), `${specifier} 不在受支持的宿主包清单里`)
  assert.ok(!bare.includes('@deepseek-ai/dsh-llm'), 'dsh-llm 不应被保留为裸 import')
})

test('宿主 peer 下限不低于 0.2.1，且 devDependencies 精确锁定同一版本', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  // 下限写 0.2.0 时 pnpm 会解析到最早的 0.2.0-rc.2，与本地实际运行的 0.2.1-rc.2 不一致。
  for (const [name, range] of Object.entries(manifest.peerDependencies)) {
    assert.equal(range, '>=0.2.1-0 <0.3.0-0', `${name} 的 peer 范围`)
    // 精确版本让 lockfile 可复现，避免 minimumReleaseAge 拉到未固定的小版本。
    assert.equal(manifest.devDependencies[name], '0.2.1-rc.2', `${name} 的 devDependencies 精确版本`)
  }
})

test('中英文列表元数据齐全', () => {
  for (const locale of ['zh', 'en']) {
    const dict = JSON.parse(readFileSync(join(root, 'locale', `${locale}.json`), 'utf8'))
    assert.ok(dict.meta.title.length > 0, `${locale}.meta.title`)
    assert.ok(dict.meta.description.length > 0, `${locale}.meta.description`)
  }
})
