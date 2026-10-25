import type { SheetVar, TargetSheet } from '../types'
import { fold } from './text'
import { newId } from './util'

/** {{alvo}}, {{ ip }}, {{porta_web}}, {{api.url}}… */
const VAR_RE = /\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu

/** Chave normalizada: maiúsculas e acentos não importam. */
export const varKey = (key: string): string => fold(key.trim())

/** Nomes das variáveis usadas no texto, na ordem em que aparecem, sem repetir. */
export function extractVars(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const m of text.matchAll(VAR_RE)) {
    const k = varKey(m[1])
    if (!seen.has(k)) {
      seen.add(k)
      names.push(m[1])
    }
  }
  return names
}

/** Valores preenchidos da ficha, por chave normalizada. */
export function sheetValues(sheet: TargetSheet | undefined): Record<string, string> {
  const values: Record<string, string> = {}
  for (const v of sheet?.vars ?? []) {
    const k = varKey(v.key)
    if (k && v.value.trim() && !(k in values)) values[k] = v.value
  }
  return values
}

/**
 * Troca cada {{variável}} pelo valor. Variáveis sem valor ficam como estão
 * e são listadas em `missing`.
 */
export function resolveVars(text: string, values: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = []
  const out = text.replace(VAR_RE, (whole, name: string) => {
    const value = values[varKey(name)]
    if (value !== undefined && value !== '') return value
    if (!missing.some((m) => varKey(m) === varKey(name))) missing.push(name)
    return whole
  })
  return { text: out, missing }
}

/** Variável oferecida no menu do "/": chave e valor atual (vazio nos modelos e bibliotecas). */
export interface SheetVariable {
  key: string
  value: string
}

/** Variáveis da ficha com chave, sem repetir (vale a primeira, como em sheetValues). */
export function sheetVariables(sheet: TargetSheet | undefined): SheetVariable[] {
  const seen = new Set<string>()
  const out: SheetVariable[] = []
  for (const v of sheet?.vars ?? []) {
    const k = varKey(v.key)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ key: v.key.trim(), value: v.value })
  }
  return out
}

/**
 * Variáveis que batem com a busca (na chave ou no valor), sem acento e sem maiúsculas.
 * As que começam com a busca vêm primeiro.
 */
export function matchVariables(vars: SheetVariable[], query: string): SheetVariable[] {
  const q = fold(query.trim())
  if (!q) return vars
  const rank = (v: SheetVariable): number => (varKey(v.key).startsWith(q) ? 0 : varKey(v.key).includes(q) ? 1 : 2)
  return vars
    .filter((v) => varKey(v.key).includes(q) || fold(v.value).includes(q))
    .map((v) => ({ v, r: rank(v) }))
    .sort((a, b) => a.r - b.r)
    .map(({ v }) => v)
}

/** Ficha em branco; as chaves padrão de cada categoria estão em SHEET_SPECS. */
export function createSheet(keys: string[] = []): TargetSheet {
  return { vars: keys.map((key) => ({ id: newId(), key, value: '' })), fields: {} }
}

/** Copia a estrutura da ficha (chaves) sem os valores, para espaços criados de uma biblioteca. */
export function sheetSkeleton(sheet: TargetSheet | undefined): TargetSheet | undefined {
  if (!sheet) return undefined
  return { vars: sheet.vars.map((v): SheetVar => ({ id: newId(), key: v.key, value: '' })), fields: {} }
}
