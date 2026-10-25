import type { AppData, Board, BoardType, ListType, View } from '../types'
import { fold, foldWithMap, htmlToText } from './text'
import { SHEET_SPECS } from './sheets'

export type SearchKind = 'workspace' | 'library' | 'sheet' | 'section' | 'entry' | 'template' | 'snippetGroup' | 'snippet'

/** Para onde ir ao escolher um resultado. */
export interface SearchTarget {
  view: View
  sectionId?: string
  list?: ListType
  entryId?: string
  sheet?: boolean
}

export interface SearchDoc {
  key: string
  kind: SearchKind
  title: string
  /** Onde o item está ("Pentest Web › Recon › Checklist"). */
  path: string
  text: string
  target: SearchTarget
  /** Pré-calculados para comparar sem acento e sem maiúsculas. */
  foldedTitle: string
  foldedText: string
}

export interface SearchResult {
  doc: SearchDoc
  score: number
  /** Trecho do conteúdo em volta do termo encontrado, quando o termo não está no título. */
  excerpt?: string
}

const LIST_LABEL: Record<ListType, string> = { checklist: 'Checklist', notes: 'Notas' }

function doc(d: Omit<SearchDoc, 'foldedTitle' | 'foldedText'>): SearchDoc {
  return { ...d, foldedTitle: fold(d.title), foldedText: fold(d.text) }
}

function boardDocs(board: Board, type: BoardType): SearchDoc[] {
  const view: View = { type, id: board.id }
  const label = type === 'workspace' ? 'Espaço' : 'Biblioteca'
  const docs = [doc({ key: board.id, kind: type, title: board.title, path: label, text: '', target: { view } })]

  if (board.sheet) {
    const s = board.sheet
    const spec = SHEET_SPECS[board.kind]
    // Só os campos visíveis na categoria atual; os de outra categoria ficam guardados, mas fora da busca.
    const text = [...s.vars.map((v) => `${v.key} ${v.value}`), ...spec.fields.map((f) => s.fields[f.id] ?? '')].join(' ')
    if (text.trim()) {
      docs.push(doc({ key: `${board.id}:sheet`, kind: 'sheet', title: spec.title, path: board.title, text, target: { view, sheet: true } }))
    }
  }

  for (const section of board.sections) {
    docs.push(
      doc({ key: section.id, kind: 'section', title: section.title, path: board.title, text: '', target: { view, sectionId: section.id } })
    )
    for (const list of ['checklist', 'notes'] as const) {
      for (const e of section[list]) {
        docs.push(
          doc({
            key: e.id,
            kind: 'entry',
            title: e.title,
            path: `${board.title} › ${section.title} › ${LIST_LABEL[list]}`,
            text: htmlToText(e.content),
            target: { view, sectionId: section.id, list, entryId: e.id }
          })
        )
      }
    }
  }
  return docs
}

/*
 * Os dados são imutáveis (Immer): um espaço que não mudou continua sendo o mesmo objeto.
 * Guardar o índice por objeto faz a busca reindexar só o que foi editado desde a última vez.
 */
const boardCache: Record<BoardType, WeakMap<Board, SearchDoc[]>> = { workspace: new WeakMap(), library: new WeakMap() }

function cachedBoardDocs(board: Board, type: BoardType): SearchDoc[] {
  let docs = boardCache[type].get(board)
  if (!docs) {
    docs = boardDocs(board, type)
    boardCache[type].set(board, docs)
  }
  return docs
}

/** Índice de tudo o que pode ser encontrado (a lixeira fica de fora). */
export function buildIndex(data: AppData): SearchDoc[] {
  const docs: SearchDoc[] = []
  for (const b of data.workspaces) docs.push(...cachedBoardDocs(b, 'workspace'))
  for (const b of data.libraries) docs.push(...cachedBoardDocs(b, 'library'))
  for (const t of data.templates) {
    docs.push(
      doc({
        key: t.id,
        kind: 'template',
        title: t.title,
        path: 'Modelos de nota',
        text: htmlToText(t.content),
        target: { view: { type: 'templates' }, entryId: t.id }
      })
    )
  }
  for (const g of data.snippetGroups) {
    docs.push(doc({ key: g.id, kind: 'snippetGroup', title: g.title, path: 'Snippets', text: '', target: { view: { type: 'snippets' } } }))
    for (const i of g.items) {
      docs.push(
        doc({
          key: i.id,
          kind: 'snippet',
          title: i.title,
          path: `Snippets › ${g.title}`,
          text: i.content,
          target: { view: { type: 'snippets' }, entryId: i.id }
        })
      )
    }
  }
  return docs
}

const KIND_BONUS: Record<SearchKind, number> = {
  workspace: 6,
  library: 4,
  sheet: 2,
  section: 3,
  entry: 2,
  template: 2,
  snippetGroup: 2,
  snippet: 2
}

function excerpt(text: string, term: string): string | undefined {
  // Procura no texto dobrado e recorta o original nas posições correspondentes.
  const { folded, map } = foldWithMap(text)
  const found = folded.indexOf(term)
  if (found < 0) return undefined
  const at = map[found]
  const start = Math.max(0, at - 40)
  const end = Math.min(text.length, map[found + term.length] + 80)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/**
 * Todos os termos precisam aparecer no título ou no conteúdo. Título pesa mais
 * que conteúdo; título que começa com a busca pesa mais ainda.
 */
export function search(index: SearchDoc[], query: string, limit = 40): SearchResult[] {
  const q = fold(query.trim())
  const terms = q.split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  const results: SearchResult[] = []
  for (const d of index) {
    let score = 0
    let contentTerm: string | undefined
    let ok = true
    for (const t of terms) {
      if (d.foldedTitle.includes(t)) score += 10
      else if (d.foldedText.includes(t)) {
        score += 3
        contentTerm ??= t
      } else {
        ok = false
        break
      }
    }
    if (!ok) continue
    if (d.foldedTitle === q) score += 30
    else if (d.foldedTitle.startsWith(q)) score += 15
    score += KIND_BONUS[d.kind]
    results.push({ doc: d, score, excerpt: contentTerm ? excerpt(d.text, contentTerm) : undefined })
  }

  return results.sort((a, b) => b.score - a.score || a.doc.title.length - b.doc.title.length).slice(0, limit)
}
