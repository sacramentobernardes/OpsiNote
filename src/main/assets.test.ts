import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ASSET_PREFIX,
  collectGarbage,
  externalizeImages,
  inlineImages,
  isAssetName,
  mimeOf,
  referencedAssets,
  saveAsset
} from './assets'

// PNG de 1x1 pixel.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const dataUri = `data:image/png;base64,${PNG}`
const json = (src: string): string => JSON.stringify({ content: `<p>a</p><img src="${src}"><img src="${src}">` })

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'opsinote-assets-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('imagens fora do JSON', () => {
  it('tira as imagens embutidas e grava um arquivo só para imagens iguais', () => {
    const out = externalizeImages(json(dataUri), dir)
    expect(out).not.toContain('data:image')
    expect(out).toContain(ASSET_PREFIX)
    const files = readdirSync(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^[a-f0-9]{64}\.png$/)
    expect(JSON.parse(out).content).toContain(`${ASSET_PREFIX}${files[0]}`)
  })

  it('embute de volta para exportar (ida e volta sem perda)', () => {
    const original = json(dataUri)
    expect(inlineImages(externalizeImages(original, dir), dir)).toBe(original)
  })

  it('não mexe em JSON sem imagens nem em tipos desconhecidos', () => {
    const plain = JSON.stringify({ a: 'texto' })
    expect(externalizeImages(plain, dir)).toBe(plain)
    const odd = json('data:image/x-unknown;base64,AAAA')
    expect(externalizeImages(odd, dir)).toBe(odd)
  })

  it('mantém o endereço se o arquivo sumiu', () => {
    const missing = `${ASSET_PREFIX}${'a'.repeat(64)}.png`
    expect(inlineImages(json(missing), dir)).toBe(json(missing))
  })

  it('só aceita nomes gerados pelo app', () => {
    expect(isAssetName(`${'a'.repeat(64)}.png`)).toBe(true)
    expect(isAssetName('../opsinote-data.json')).toBe(false)
    expect(isAssetName(`${'a'.repeat(64)}.exe`)).toBe(false)
    expect(mimeOf(`${'a'.repeat(64)}.svg`)).toBe('image/svg+xml')
  })

  it('grava bytes enviados pelo editor', () => {
    const name = saveAsset(dir, Buffer.from(PNG, 'base64'), 'image/png')
    expect(name).toMatch(/\.png$/)
    expect(saveAsset(dir, Buffer.from(PNG, 'base64'), 'application/pdf')).toBeNull()
  })
})

describe('limpeza de imagens sem uso', () => {
  it('apaga só as não usadas e antigas', () => {
    const used = saveAsset(dir, Buffer.from('a'), 'image/png')!
    const unusedOld = saveAsset(dir, Buffer.from('b'), 'image/png')!
    const unusedNew = saveAsset(dir, Buffer.from('c'), 'image/png')!
    const day = 24 * 60 * 60 * 1000
    const old = (Date.now() - 2 * day) / 1000
    utimesSync(join(dir, used), old, old)
    utimesSync(join(dir, unusedOld), old, old)

    const referenced = referencedAssets(JSON.stringify({ c: `<img src="${ASSET_PREFIX}${used}">` }))
    expect(collectGarbage(dir, referenced, day)).toBe(1)
    expect(existsSync(join(dir, used))).toBe(true)
    expect(existsSync(join(dir, unusedOld))).toBe(false)
    expect(existsSync(join(dir, unusedNew))).toBe(true)
  })

  it('não falha se a pasta não existe', () => {
    expect(collectGarbage(join(dir, 'nao-existe'), new Set(), 0)).toBe(0)
  })
})
