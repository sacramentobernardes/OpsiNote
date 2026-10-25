/**
 * Grafo de conhecimento: como espaços, bibliotecas, tarefas, notas e snippets se ligam.
 *
 * Dois tipos de ligação:
 * - "contém": o espaço (ou biblioteca) e cada tarefa e nota dele;
 * - "menciona": um texto cita o título de outro nó, solto ou como [[Título]].
 *
 * Um nó "sem conexões" é uma tarefa ou nota que não menciona nada e não é mencionada.
 */
import type { AppData, BoardType, Kind } from '../types'
import type { SearchTarget } from './search'
import { fold, htmlToText } from './text'

export type GraphNodeKind = 'workspace' | 'library' | 'task' | 'note' | 'snippet'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  title: string
  /** Onde está ("Pentest ACME › Recon"). */
  path: string
  color?: string
  /** Categoria do espaço (ou do espaço do item), para o ícone e a cor padrão. */
  boardKind?: Kind
  /** Nó do espaço ou biblioteca que contém este item. */
  parent?: string
  target: SearchTarget
  /** Ligações de menção (entrando e saindo). */
  mentions: number
  done?: boolean
  pinned?: boolean
  /** Grupo do snippet (para fixar pelo grafo). */
  groupId?: string
}

export interface GraphLink {
  source: string
  target: string
  kind: 'contains' | 'mentions'
}

export interface Graph {
  nodes: GraphNode[]
  links: GraphLink[]
  /** Nós cujo título pode ser citado (único em todos os dados, não genérico, com 4+ letras). */
  linkable: Set<string>
}

export interface GraphOptions {
  libraries?: boolean
  tasks?: boolean
  notes?: boolean
  snippets?: boolean
  /** Deixa de fora as tarefas concluídas. */
  hideDone?: boolean
}

/** Títulos que o próprio app dá: não identificam nada. */
const GENERIC = new Set(
  ['Sem título', 'Novo espaço', 'Nova biblioteca', 'Nova seção', 'Novo snippet', 'Novo grupo', 'Novo modelo', 'Nova nota', 'Novo item', 'Geral', 'Notas'].map(
    (t) => fold(t)
  )
)
/** Títulos curtos demais casariam com qualquer texto ("ip", "api"). */
const MIN_TITLE = 4

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface Source {
  node: GraphNode
  text: string
}

export function buildGraph(data: AppData, options: GraphOptions = {}): Graph {
  const { libraries = false, tasks = true, notes = true, snippets = false, hideDone = false } = options
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const sources: Source[] = []

  const boards: [BoardType, AppData['workspaces']][] = [['workspace', data.workspaces]]
  if (libraries) boards.push(['library', data.libraries])

  for (const [type, list] of boards) {
    for (const b of list) {
      const view = { type, id: b.id } as const
      const boardNode: GraphNode = {
        id: `b:${b.id}`,
        kind: type,
        title: b.title,
        path: type === 'workspace' ? 'Espaço' : 'Biblioteca',
        color: b.color,
        boardKind: b.kind,
        target: { view },
        mentions: 0,
        ...(b.pinned ? { pinned: true } : {})
      }
      nodes.push(boardNode)
      // O texto da ficha também pode mencionar outros espaços e notas.
      sources.push({ node: boardNode, text: Object.values(b.sheet?.fields ?? {}).join('\n') })
      for (const s of b.sections) {
        for (const list of ['checklist', 'notes'] as const) {
          if ((list === 'checklist' && !tasks) || (list === 'notes' && !notes)) continue
          for (const e of s[list]) {
            if (hideDone && list === 'checklist' && e.done) continue
            const node: GraphNode = {
              id: `e:${e.id}`,
              kind: list === 'checklist' ? 'task' : 'note',
              title: e.title,
              path: `${b.title} › ${s.title}`,
              color: e.color ?? b.color,
              boardKind: b.kind,
              parent: boardNode.id,
              target: { view, sectionId: s.id, list, entryId: e.id },
              mentions: 0,
              ...(list === 'checklist' ? { done: !!e.done } : {}),
              ...(e.pinned ? { pinned: true } : {})
            }
            nodes.push(node)
            links.push({ source: boardNode.id, target: node.id, kind: 'contains' })
            sources.push({ node, text: htmlToText(e.content) })
          }
        }
      }
    }
  }

  if (snippets) {
    for (const g of data.snippetGroups) {
      for (const i of g.items) {
        const node: GraphNode = {
          id: `s:${i.id}`,
          kind: 'snippet',
          title: i.title,
          path: `Snippets › ${g.title}`,
          target: { view: { type: 'snippets' }, entryId: i.id },
          mentions: 0,
          groupId: g.id,
          ...(i.pinned ? { pinned: true } : {})
        }
        nodes.push(node)
        sources.push({ node, text: i.content })
      }
    }
  }

  const linkable = linkableIds(nodes, titleCounts(data))
  addMentions(nodes, sources, links, linkable)
  return { nodes, links, linkable }
}

/**
 * Quantas vezes cada título aparece em TODOS os dados (espaços, bibliotecas, itens, snippets),
 * qualquer que seja o filtro: um título repetido não vira ligação nem quando o outro está oculto.
 */
function titleCounts(data: AppData): Map<string, number> {
  const counts = new Map<string, number>()
  const add = (title: string): void => {
    const t = fold(title.trim())
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  for (const b of [...data.workspaces, ...data.libraries]) {
    add(b.title)
    for (const s of b.sections) for (const e of [...s.checklist, ...s.notes]) add(e.title)
  }
  for (const g of data.snippetGroups) for (const i of g.items) add(i.title)
  return counts
}

function linkableIds(nodes: GraphNode[], counts: Map<string, number>): Set<string> {
  const ids = new Set<string>()
  for (const n of nodes) {
    const t = fold(n.title.trim())
    if (t.length >= MIN_TITLE && !GENERIC.has(t) && counts.get(t) === 1) ids.add(n.id)
  }
  return ids
}

/** Por que um título não pode ser citado, ou null se pode (para explicar ao ligar pelo grafo). */
export function whyNotLinkable(title: string, graph: Graph, id: string): string | null {
  if (graph.linkable.has(id)) return null
  const t = fold(title.trim())
  if (t.length < MIN_TITLE) return `O título “${title}” é curto demais para virar ligação (mínimo de ${MIN_TITLE} letras).`
  if (GENERIC.has(t)) return `“${title}” é um título genérico. Renomeie para poder ligar.`
  return `Há mais de um item chamado “${title}”. Renomeie um deles para poder ligar.`
}

/** O nó e os vizinhos até `depth` passos (pelas ligações de qualquer tipo). */
export function neighborhood(graph: Graph, root: string, depth: number): Set<string> {
  const near = neighbors(graph)
  const seen = new Set([root])
  let frontier = [root]
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const n of near.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
  }
  return seen
}

/** Só os nós de `ids` e as ligações entre eles. */
export function subgraph(graph: Graph, ids: Set<string>): Graph {
  return {
    nodes: graph.nodes.filter((n) => ids.has(n.id)),
    links: graph.links.filter((l) => ids.has(l.source) && ids.has(l.target)),
    linkable: graph.linkable
  }
}

/** Os mais citados (e que mais citam), para o painel "Mais conectados". */
export function mostConnected(graph: Graph, limit = 5): GraphNode[] {
  return graph.nodes
    .filter((n) => n.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions || a.title.localeCompare(b.title))
    .slice(0, limit)
}

/** Já existe menção entre os dois (em qualquer sentido)? */
export function areLinked(graph: Graph, a: string, b: string): boolean {
  return graph.links.some((l) => l.kind === 'mentions' && ((l.source === a && l.target === b) || (l.source === b && l.target === a)))
}

/** Conteúdo com a menção nova no fim, como um parágrafo [[Título]]. */
export function withMention(html: string, title: string): string {
  const safe = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const base = html.trim() === '<p></p>' ? '' : html
  return `${base}<p>[[${safe}]]</p>`
}

/** Liga cada texto aos nós cujo título ele cita. */
function addMentions(nodes: GraphNode[], sources: Source[], links: GraphLink[], linkable: Set<string>): void {
  // Título → nó. Só os citáveis: um título repetido (em qualquer lugar dos dados) fica de fora,
  // porque não dá para saber qual é o citado.
  const byTitle = new Map<string, GraphNode[]>()
  for (const n of nodes) if (linkable.has(n.id)) byTitle.set(fold(n.title.trim()), [n])
  const titles = [...byTitle.keys()]
  if (titles.length === 0) return

  // Uma busca só por texto: todos os títulos numa alternância, os mais longos primeiro,
  // com bordas de palavra (letras e números não podem encostar no título).
  titles.sort((a, b) => b.length - a.length)
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${titles.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu')

  const seen = new Set<string>()
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const { node, text } of sources) {
    if (!text.trim()) continue
    for (const m of fold(text).matchAll(re)) {
      const other = byTitle.get(m[0])![0]
      // Citar a si mesmo, ou o espaço onde o item já está, não é uma ligação nova.
      if (other.id === node.id || other.id === node.parent || other.parent === node.id) continue
      const key = node.id < other.id ? `${node.id}|${other.id}` : `${other.id}|${node.id}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ source: node.id, target: other.id, kind: 'mentions' })
      byId.get(node.id)!.mentions++
      other.mentions++
    }
  }
}

/** Tarefas e notas que não mencionam nada nem são mencionadas. */
export function orphans(graph: Graph): GraphNode[] {
  return graph.nodes.filter((n) => (n.kind === 'note' || n.kind === 'task') && n.mentions === 0)
}

/** Vizinhos de cada nó (pelas duas pontas das ligações). */
export function neighbors(graph: Graph): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>(graph.nodes.map((n) => [n.id, new Set()]))
  for (const l of graph.links) {
    map.get(l.source)?.add(l.target)
    map.get(l.target)?.add(l.source)
  }
  return map
}
