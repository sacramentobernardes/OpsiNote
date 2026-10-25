/**
 * Imagens fora do JSON. Cada imagem vira um arquivo em `attachments/`, nomeado
 * pelo SHA-256 do conteúdo (a mesma imagem colada duas vezes ocupa um arquivo só).
 * No JSON fica só o endereço `opsinote-asset://files/<nome>`.
 *
 * Sem dependência do Electron, para poder ser testado em Node puro.
 */
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

export const ASSET_SCHEME = 'opsinote-asset'
export const ASSET_PREFIX = `${ASSET_SCHEME}://files/`

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif'
}
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]))

const NAME_RE = /^[a-f0-9]{64}\.(png|jpg|gif|webp|svg|bmp|avif)$/
const DATA_URI_RE = /data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g
const ASSET_URL_RE = /opsinote-asset:\/\/files\/([a-f0-9]{64}\.[a-z]+)/g

/** Só nomes gerados por nós: impede que um endereço leia arquivos fora da pasta. */
export const isAssetName = (name: string): boolean => NAME_RE.test(name)

export const mimeOf = (name: string): string => EXT_MIME[name.split('.').pop() ?? ''] ?? 'application/octet-stream'

/** Grava a imagem (se ainda não existir) e devolve o nome do arquivo. */
export function saveAsset(dir: string, bytes: Uint8Array, mime: string): string | null {
  const ext = MIME_EXT[mime]
  if (!ext || bytes.byteLength === 0) return null
  const name = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`
  const file = join(dir, name)
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, bytes)
  }
  return name
}

/** Troca imagens embutidas (data:image/…;base64) por endereços de arquivo. */
export function externalizeImages(json: string, dir: string): string {
  if (!json.includes('data:image/')) return json
  return json.replace(DATA_URI_RE, (whole, mime: string, base64: string) => {
    const name = saveAsset(dir, Buffer.from(base64, 'base64'), mime)
    return name ? ASSET_PREFIX + name : whole
  })
}

/** O contrário: embute as imagens de volta, para backups que vão para outro computador. */
export function inlineImages(json: string, dir: string): string {
  return json.replace(ASSET_URL_RE, (whole, name: string) => {
    const file = join(dir, name)
    if (!isAssetName(name) || !existsSync(file)) return whole
    return `data:${mimeOf(name)};base64,${readFileSync(file).toString('base64')}`
  })
}

export function referencedAssets(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(ASSET_URL_RE), (m) => m[1]))
}

/**
 * Apaga imagens que nenhum dado usa mais. Só remove arquivos com mais de
 * `minAgeMs`, para não pegar uma imagem recém-colada que ainda não foi salva.
 */
export function collectGarbage(dir: string, referenced: Set<string>, minAgeMs: number, now = Date.now()): number {
  if (!existsSync(dir)) return 0
  let removed = 0
  for (const name of readdirSync(dir)) {
    if (!isAssetName(name) || referenced.has(name)) continue
    const file = join(dir, name)
    if (now - statSync(file).mtimeMs < minAgeMs) continue
    unlinkSync(file)
    removed++
  }
  return removed
}
