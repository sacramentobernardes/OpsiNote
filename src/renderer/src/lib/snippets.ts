import type { Entry, SnippetGroup } from '../types'
import { fold } from './text'
import { extractVars, resolveVars } from './variables'

/** "s/" no começo de uma palavra abre o menu de snippets; o que vem depois filtra. */
const SNIPPET_RE = /(?:^|\s)[sS]\/([^\s/]*)$/u
/** "/" no começo de uma palavra abre o menu das variáveis da ficha. */
const VARIABLE_RE = /(?:^|\s)\/([^\s/]*)$/u

export interface SlashTrigger {
  kind: 'snippet' | 'variable'
  /** O que foi digitado depois do gatilho. */
  query: string
  /** Tamanho do gatilho com a busca ("s/nma" = 5), para apagá-lo ao inserir. */
  length: number
}

/**
 * Gatilho ("s/" ou "/") com a busca logo antes do cursor, ou `null` se não há.
 * `before` é o texto da linha (ou do campo) até o cursor.
 */
export function slashTrigger(before: string): SlashTrigger | null {
  const s = SNIPPET_RE.exec(before)
  if (s) return { kind: 'snippet', query: s[1], length: s[1].length + 2 }
  const v = VARIABLE_RE.exec(before)
  if (v) return { kind: 'variable', query: v[1], length: v[1].length + 1 }
  return null
}

export interface SnippetMatch {
  group: SnippetGroup
  item: Entry
}

/**
 * Snippets que contêm todas as palavras da busca (no título, no grupo ou no conteúdo),
 * sem acento e sem maiúsculas. Os que batem no título vêm primeiro.
 */
export function matchSnippets(groups: SnippetGroup[], query: string): SnippetMatch[] {
  // Sem busca, os fixados vêm primeiro.
  const all = groups.flatMap((group) => group.items.map((item) => ({ group, item })))
  const q = fold(query.trim())
  if (!q) return [...all.filter((m) => m.item.pinned), ...all.filter((m) => !m.item.pinned)]
  const words = q.split(/\s+/)
  const rank = ({ item }: SnippetMatch): number => {
    const title = fold(item.title)
    return title.startsWith(q) ? 0 : title.includes(q) ? 1 : 2
  }
  return all
    .filter(({ group, item }) => {
      const hay = fold(`${item.title} ${group.title} ${item.content}`)
      return words.every((w) => hay.includes(w))
    })
    .map((m) => ({ m, r: rank(m) }))
    .sort((a, b) => a.r - b.r)
    .map(({ m }) => m)
}

export interface SheetSnippet extends SnippetMatch {
  /** Conteúdo com as variáveis da ficha preenchidas. */
  text: string
  /** Variáveis usadas que a ficha não preenche (como escritas no snippet). */
  missing: string[]
  /** Quantas variáveis o snippet usa. */
  varCount: number
}

/**
 * Snippets vistos de uma ficha: cada um já com os valores dela, e o que falta preencher.
 * A busca é a mesma do menu "/".
 */
export function sheetSnippets(groups: SnippetGroup[], values: Record<string, string>, query = ''): SheetSnippet[] {
  return matchSnippets(groups, query).map((m) => {
    const { text, missing } = snippetText(m.item.content, values)
    return { ...m, text, missing, varCount: extractVars(m.item.content).length }
  })
}

/**
 * Texto do snippet pronto para entrar numa nota ou campo. Com `values`, as variáveis
 * são preenchidas; sem (nos modelos de nota), ficam como {{variável}}.
 */
export function snippetText(content: string, values?: Record<string, string>): { text: string; missing: string[] } {
  const trimmed = content.replace(/\s+$/, '')
  return values ? resolveVars(trimmed, values) : { text: trimmed, missing: [] }
}
