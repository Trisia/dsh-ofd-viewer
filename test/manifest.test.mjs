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
  assert.match(patch, /id: '@cliven\/dsh-ofd-viewer'/)
  assert.match(patch, /name: '@cliven\/dsh-ofd-viewer'/)
})

test('中英文列表元数据齐全', () => {
  for (const locale of ['zh', 'en']) {
    const dict = JSON.parse(readFileSync(join(root, 'locale', `${locale}.json`), 'utf8'))
    assert.ok(dict.meta.title.length > 0, `${locale}.meta.title`)
    assert.ok(dict.meta.description.length > 0, `${locale}.meta.description`)
  }
})
