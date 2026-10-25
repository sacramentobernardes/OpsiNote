import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import {
  BookCopy,
  Brackets,
  CircleCheck,
  ExternalLink,
  FileText,
  ImageDown,
  Layers,
  Link2,
  Maximize,
  Minus,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  TrendingUp,
  Unlink,
  Waypoints,
  X
} from 'lucide-react'
import { useStore, type PinTarget } from '../store'
import type { Kind } from '../types'
import {
  areLinked,
  buildGraph,
  mostConnected,
  neighborhood,
  neighbors,
  orphans,
  subgraph,
  whyNotLinkable,
  withMention,
  type Graph,
  type GraphNode,
  type GraphNodeKind,
  type GraphOptions
} from '../lib/graph'
import { createSimulation, type Simulation } from '../lib/graphLayout'
import { fold } from '../lib/text'
import { copyText, cx } from '../lib/util'
import { useContextMenu, type MenuEntry } from './ui'

const KIND_INFO: Record<GraphNodeKind, { label: string; one: string; icon: ReactNode; radius: number }> = {
  workspace: { label: 'Espaços', one: 'espaço', icon: <Layers size={13} />, radius: 13 },
  library: { label: 'Bibliotecas', one: 'biblioteca', icon: <BookCopy size={13} />, radius: 11 },
  task: { label: 'Tarefas', one: 'tarefa', icon: <CircleCheck size={13} />, radius: 5 },
  note: { label: 'Notas', one: 'nota', icon: <FileText size={13} />, radius: 6 },
  snippet: { label: 'Snippets', one: 'snippet', icon: <Terminal size={13} />, radius: 5 }
}

type ColorBy = 'space' | 'kind' | 'category'
const COLOR_BY: { id: ColorBy; label: string }[] = [
  { id: 'space', label: 'Espaço' },
  { id: 'kind', label: 'Tipo' },
  { id: 'category', label: 'Categoria' }
]
/** Cores fixas para "colorir por tipo" e "por categoria" (as mesmas nos dois temas). */
const KIND_COLORS: Record<GraphNodeKind, string> = {
  workspace: '#f97316',
  library: '#8b5cf6',
  task: '#22c55e',
  note: '#3b82f6',
  snippet: '#64748b'
}
const CATEGORY_COLORS: Record<Kind, string> = {
  pentest: '#ef4444',
  study: '#8b5cf6',
  project: '#3b82f6',
  task: '#22c55e',
  other: '#94a3b8'
}
const CATEGORY_LABELS: Record<Kind, string> = { pentest: 'Pentest', study: 'Estudo', project: 'Projeto', task: 'Tarefas', other: 'Geral' }

const colorOf = (n: GraphNode, by: ColorBy): string | undefined =>
  by === 'kind' ? KIND_COLORS[n.kind] : by === 'category' ? (n.boardKind ? CATEGORY_COLORS[n.boardKind] : KIND_COLORS[n.kind]) : n.color

type Filter = Required<GraphOptions>
const DEFAULT_FILTER: Filter = { tasks: true, notes: true, libraries: false, snippets: false, hideDone: false }
const FILTER_KEYS: { key: 'notes' | 'tasks' | 'libraries' | 'snippets'; kind: GraphNodeKind }[] = [
  { key: 'notes', kind: 'note' },
  { key: 'tasks', kind: 'task' },
  { key: 'libraries', kind: 'library' },
  { key: 'snippets', kind: 'snippet' }
]

/* Filtros e cores lembrados entre aberturas (por computador). */
const PREFS_KEY = 'opsinote.graph'
interface Prefs {
  filter: Filter
  colorBy: ColorBy
}
function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null
    const filter = { ...DEFAULT_FILTER }
    for (const k of Object.keys(DEFAULT_FILTER) as (keyof Filter)[]) if (typeof v?.filter?.[k] === 'boolean') filter[k] = v.filter[k]
    return { filter, colorBy: COLOR_BY.some((c) => c.id === v?.colorBy) ? (v!.colorBy as ColorBy) : 'space' }
  } catch {
    return { filter: DEFAULT_FILTER, colorBy: 'space' }
  }
}
function writePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // Sem armazenamento local: as preferências valem só nesta sessão.
  }
}

/** A partir deste zoom os títulos de todos os nós aparecem (antes, só os dos espaços). */
const LABEL_ZOOM = 2.2
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const LARGE_GRAPH = 400
/**
 * Área de tela (px²) que o título de cada espaço precisa para não encostar nos outros. Se o
 * grafo ocupa menos que isso vezes o número de espaços, os títulos se escondem (um em cima do
 * outro não se lê). Voltam ao aproximar, ao passar o mouse e na busca.
 */
const LABEL_AREA = 18_000
/** Tempo de simulação por quadro: grafos grandes assentam rápido sem travar a tela. */
const FRAME_BUDGET_MS = 10

interface Viewport {
  x: number
  y: number
  k: number
}

const isBoard = (n: GraphNode): boolean => n.kind === 'workspace' || n.kind === 'library'
const isEntry = (n: GraphNode): boolean => n.kind === 'task' || n.kind === 'note'

/** O que fixar no topo a partir de um nó do grafo. */
function pinTargetOf(n: GraphNode): PinTarget | null {
  const t = n.target
  if (isBoard(n) && (t.view.type === 'workspace' || t.view.type === 'library')) return { kind: 'board', type: t.view.type, id: t.view.id }
  if (isEntry(n) && (t.view.type === 'workspace' || t.view.type === 'library') && t.sectionId && t.list && t.entryId) {
    return { kind: 'entry', ref: { boardType: t.view.type, boardId: t.view.id, sectionId: t.sectionId, list: t.list, entryId: t.entryId } }
  }
  if (n.kind === 'snippet' && n.groupId && t.entryId) return { kind: 'snippet', groupId: n.groupId, id: t.entryId }
  return null
}

/**
 * Ponto de partida: cada espaço num anel, os itens dele em volta, os snippets no meio.
 * Quem já tinha posição (o grafo mudou por causa de uma edição ou de um filtro) fica onde estava.
 */
function seedPositions(nodes: GraphNode[], last: Map<string, [number, number]>): Float64Array {
  const pos = new Float64Array(nodes.length * 2)
  const boards = nodes.filter(isBoard)
  const ring = boards.length > 1 ? 140 + 90 * boards.length : 0
  const center = new Map<string, [number, number]>()
  boards.forEach((b, k) => {
    const a = (2 * Math.PI * k) / boards.length
    center.set(b.id, last.get(b.id) ?? [ring * Math.cos(a), ring * Math.sin(a)])
  })
  const around = new Map<string, number>()
  nodes.forEach((n, i) => {
    let p = last.get(n.id) ?? center.get(n.id)
    if (!p) {
      const [cx, cy] = (n.parent && center.get(n.parent)) || [0, 0]
      const k = (around.get(n.parent ?? '') ?? 0) + 1
      around.set(n.parent ?? '', k)
      // Espiral em volta do espaço: previsível e sem dois nós no mesmo ponto.
      const r = 40 + 9 * Math.sqrt(k)
      p = [cx + r * Math.cos(k * 2.4), cy + r * Math.sin(k * 2.4)]
    }
    pos[i * 2] = p[0]
    pos[i * 2 + 1] = p[1]
  })
  return pos
}

const radiusOf = (n: GraphNode): number => KIND_INFO[n.kind].radius + (isBoard(n) ? 0 : Math.min(4, n.mentions))

/**
 * Um nó do SVG. Memorizado: ao passar o mouse ou buscar, só redesenham os nós que mudam de
 * classe; o "apagar o resto" é uma regra de CSS no contêiner. As posições não passam pelo
 * React: a simulação escreve direto no atributo transform.
 */
const GraphNodeEl = memo(function GraphNodeEl({
  node: n,
  index,
  cls,
  color,
  onHover,
  onOpen,
  onMenu
}: {
  node: GraphNode
  index: number
  cls: string
  color: string | undefined
  onHover: (id: string, on: boolean) => void
  onOpen: (n: GraphNode) => void
  onMenu: (e: ReactMouseEvent<Element>, n: GraphNode) => void
}): ReactNode {
  const r = radiusOf(n)
  return (
    <g
      data-i={index}
      className={cx('graph-node', n.kind, n.done && 'done', n.pinned && 'pinned', cls)}
      style={color ? ({ '--node-color': color } as CSSProperties) : undefined}
      // Pelo teclado: Tab chega aos nós, Enter ou Espaço abre, a tecla de menu (ou Shift+F10) abre as opções.
      tabIndex={0}
      role="button"
      aria-label={`${n.title}, ${KIND_INFO[n.kind].one} em ${n.path}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(n)
        }
      }}
      onContextMenu={(e) => onMenu(e, n)}
      onFocus={() => onHover(n.id, true)}
      onBlur={() => onHover(n.id, false)}
      onPointerEnter={() => onHover(n.id, true)}
      onPointerLeave={() => onHover(n.id, false)}
    >
      <title>{`${n.title} · ${n.path}`}</title>
      <circle r={r} />
      {n.pinned && <circle r={r + 4} className="graph-pin-ring" />}
      <text y={r + (isBoard(n) ? 14 : 11)} className={cx('graph-label', isBoard(n) && 'always')}>
        {n.title.length > 32 ? `${n.title.slice(0, 31)}…` : n.title}
      </text>
    </g>
  )
})

/** Pontas de cada ligação como índices, calculadas uma vez por grafo. */
function linkEnds(graph: Graph, index: Map<string, number>): { a: Int32Array; b: Int32Array; mention: Uint8Array } {
  const a = new Int32Array(graph.links.length)
  const b = new Int32Array(graph.links.length)
  const mention = new Uint8Array(graph.links.length)
  graph.links.forEach((l, i) => {
    a[i] = index.get(l.source)!
    b[i] = index.get(l.target)!
    mention[i] = l.kind === 'mentions' ? 1 : 0
  })
  return { a, b, mention }
}

/** Tela do grafo: espaços, tarefas, notas e snippets e como se ligam. */
export function GraphView(): ReactNode {
  const data = useStore((s) => s.data!)
  const navigate = useStore((s) => s.navigate)
  const updateEntry = useStore((s) => s.updateEntry)
  const togglePin = useStore((s) => s.togglePin)
  const showToast = useStore((s) => s.showToast)
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const { filter, colorBy } = prefs
  const setFilter = (f: (prev: Filter) => Filter): void => setPrefs((p) => ({ ...p, filter: f(p.filter) }))
  useEffect(() => writePrefs(prefs), [prefs])
  const [showOrphans, setShowOrphans] = useState(false)
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [far, setFar] = useState(false)
  /** Vizinhança em foco: só o nó e os vizinhos até `depth` passos. */
  const [focus, setFocus] = useState<{ id: string; depth: number } | null>(null)
  /** Ligando pelo menu: o próximo nó clicado recebe a menção. */
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const onNodeHover = useCallback((id: string, on: boolean) => setHover((h) => (on ? id : h === id ? null : h)), [])

  const full = useMemo(() => buildGraph(data, filter), [data, filter])
  const focusRoot = focus && full.nodes.some((n) => n.id === focus.id) ? focus : null
  const graph = useMemo(
    () => (focusRoot ? subgraph(full, neighborhood(full, focusRoot.id, focusRoot.depth)) : full),
    // focusRoot é um objeto novo a cada render; o que importa são o nó e a distância.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [full, focusRoot?.id, focusRoot?.depth]
  )
  const near = useMemo(() => neighbors(graph), [graph])
  const lonely = useMemo(() => orphans(graph), [graph])
  const lonelyIds = useMemo(() => new Set(lonely.map((n) => n.id)), [lonely])
  const hubs = useMemo(() => mostConnected(graph), [graph])
  const index = useMemo(() => new Map(graph.nodes.map((n, i) => [n.id, i])), [graph])
  const byId = useMemo(() => new Map(full.nodes.map((n) => [n.id, n])), [full])
  const ends = useMemo(() => linkEnds(graph, index), [graph, index])
  const mentionCount = useMemo(() => graph.links.filter((l) => l.kind === 'mentions').length, [graph])
  const boardCount = useMemo(() => graph.nodes.filter(isBoard).length, [graph])

  // Títulos sem acento calculados uma vez por grafo, não a cada tecla da busca.
  const folded = useMemo(() => graph.nodes.map((n) => fold(n.title)), [graph])
  const q = fold(query.trim())
  const matches = useMemo(() => (q ? new Set(graph.nodes.filter((_, i) => folded[i].includes(q)).map((n) => n.id)) : null), [graph, folded, q])

  // Só vale se o nó ainda está no grafo (um filtro pode tê-lo tirado).
  const activeHover = hover !== null && index.has(hover) ? hover : null
  const focusSet = useMemo(() => (activeHover ? new Set([activeHover, ...(near.get(activeHover) ?? [])]) : null), [activeHover, near])
  /** O que está em destaque; o resto o CSS apaga. Passar o mouse vale mais que a busca, que vale mais que os sem conexões. */
  const mode = focusSet ? 'hovering' : matches ? 'searching' : showOrphans ? 'orphans' : null

  const canvas = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const world = useRef<SVGGElement>(null)
  const linkLine = useRef<SVGLineElement>(null)
  const nodeEls = useRef<SVGGElement[]>([])
  const paths = useRef<Record<'contains' | 'mentions' | 'nearContains' | 'nearMentions', SVGPathElement | null>>({
    contains: null,
    mentions: null,
    nearContains: null,
    nearMentions: null
  })
  const sim = useRef<Simulation | null>(null)
  const view = useRef<Viewport>({ x: 0, y: 0, k: 1 })
  const fitted = useRef(false)
  const refitted = useRef(false)
  /** A pessoa mexeu na vista (zoom, arrasto): o enquadramento automático não muda mais nada. */
  const userMoved = useRef(false)
  /** Área do grafo (unidades do desenho²), medida ao enquadrar; decide se os títulos cabem. */
  const extent = useRef(Infinity)
  /** Posições da simulação anterior, por id, para o grafo não recomeçar do zero quando muda. */
  const last = useRef(new Map<string, [number, number]>())
  const shown = useRef<GraphNode[]>([])
  const hoverRef = useRef<number>(-1)
  hoverRef.current = activeHover ? (index.get(activeHover) ?? -1) : -1

  /* ----- Ligar dois nós ----- */

  /** Põe [[Título do destino]] no texto da origem. Só notas e tarefas recebem a menção. */
  const createLink = (fromId: string, toId: string): void => {
    setLinkFrom(null)
    const from = byId.get(fromId)
    const to = byId.get(toId)
    if (!from || !to || from.id === to.id) return
    if (!isEntry(from)) {
      showToast('Só notas e tarefas recebem ligações: a menção entra no texto delas. Comece por uma nota ou tarefa.')
      return
    }
    const why = whyNotLinkable(to.title, full, to.id)
    if (why) {
      showToast(why)
      return
    }
    if (areLinked(full, from.id, to.id)) {
      showToast(`“${from.title}” e “${to.title}” já estão ligados.`)
      return
    }
    const t = from.target
    if ((t.view.type !== 'workspace' && t.view.type !== 'library') || !t.sectionId || !t.list || !t.entryId) return
    const { type, id: boardId } = t.view
    const sectionId = t.sectionId
    const list = t.list
    const entryId = t.entryId
    const board = (type === 'workspace' ? data.workspaces : data.libraries).find((b) => b.id === boardId)
    const entry = board?.sections.find((s) => s.id === sectionId)?.[list].find((e) => e.id === entryId)
    if (!entry) return
    const before = entry.content
    updateEntry(type, boardId, sectionId, list, entryId, { content: withMention(before, to.title) })
    showToast(`Ligado: “${from.title}” → “${to.title}”`, {
      label: 'Desfazer',
      run: () => useStore.getState().updateEntry(type, boardId, sectionId, list, entryId, { content: before })
    })
  }
  const createLinkRef = useRef(createLink)
  createLinkRef.current = createLink
  const linkFromRef = useRef(linkFrom)
  linkFromRef.current = linkFrom

  // Esc cancela a ligação em andamento.
  useEffect(() => {
    if (!linkFrom) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setLinkFrom(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [linkFrom])

  const openNode = useCallback(
    (n: GraphNode) => {
      // Escolhendo o destino de uma ligação, o clique liga em vez de abrir.
      if (linkFromRef.current) createLinkRef.current(linkFromRef.current, n.id)
      else navigate(n.target)
    },
    [navigate]
  )

  /* ----- Menu do botão direito ----- */

  const contextMenu = useContextMenu()
  const menuFor = (n: GraphNode): MenuEntry[] => {
    const pin = pinTargetOf(n)
    const why = whyNotLinkable(n.title, full, n.id)
    const entries: (MenuEntry | null)[] = [
      { label: 'Abrir', icon: <ExternalLink size={14} />, onSelect: () => navigate(n.target) },
      { label: 'Ver só a vizinhança', icon: <Waypoints size={14} />, onSelect: () => setFocus({ id: n.id, depth: 1 }) },
      { label: 'Ver a vizinhança (2 passos)', icon: <Waypoints size={14} />, onSelect: () => setFocus({ id: n.id, depth: 2 }) },
      { type: 'separator' },
      isEntry(n) ? { label: 'Ligar a outro nó…', icon: <Link2 size={14} />, hint: 'Shift+arrastar', onSelect: () => setLinkFrom(n.id) } : null,
      {
        label: 'Copiar [[Título]]',
        icon: <Brackets size={14} />,
        disabled: !!why,
        onSelect: () => void copyText(`[[${n.title}]]`).then(() => showToast(`[[${n.title}]] copiado: cole numa nota para ligar.`))
      },
      pin
        ? n.pinned
          ? { label: 'Desafixar', icon: <PinOff size={14} />, onSelect: () => togglePin(pin) }
          : { label: 'Fixar no topo', icon: <Pin size={14} />, onSelect: () => togglePin(pin) }
        : null
    ]
    return entries.filter((e): e is MenuEntry => e !== null)
  }
  const menuRef = useRef(menuFor)
  menuRef.current = menuFor
  const contextOpen = useRef(contextMenu.open)
  contextOpen.current = contextMenu.open
  const onNodeMenu = useCallback(
    (e: ReactMouseEvent<Element>, n: GraphNode) => contextOpen.current(e as ReactMouseEvent<HTMLElement>, menuRef.current(n), `Opções de “${n.title}”`),
    []
  )

  /* ----- Vista ----- */

  const applyView = (): void => {
    const v = view.current
    world.current?.setAttribute('transform', `translate(${v.x},${v.y}) scale(${v.k})`)
    // Os títulos ficam do mesmo tamanho na tela, qualquer que seja o zoom.
    svg.current?.style.setProperty('--k', String(v.k))
    setZoomed(v.k >= LABEL_ZOOM)
    setFar(boardCount > 1 && extent.current * v.k * v.k < boardCount * LABEL_AREA)
  }

  /**
   * Escreve as posições no SVG. As ligações são poucos <path> (um por tipo, mais as do nó em
   * destaque): milhares de <line> custariam milhares de escritas por quadro.
   */
  const paint = (): void => {
    const s = sim.current
    if (!s) return
    const p = s.pos
    const els = nodeEls.current
    for (let i = 0; i < els.length && i * 2 + 1 < p.length; i++) els[i].setAttribute('transform', `translate(${p[i * 2].toFixed(1)},${p[i * 2 + 1].toFixed(1)})`)
    const h = hoverRef.current
    let contains = ''
    let mentions = ''
    let nearContains = ''
    let nearMentions = ''
    for (let i = 0; i < ends.a.length; i++) {
      const a = ends.a[i]
      const b = ends.b[i]
      const seg = `M${p[a * 2].toFixed(1)} ${p[a * 2 + 1].toFixed(1)}L${p[b * 2].toFixed(1)} ${p[b * 2 + 1].toFixed(1)}`
      if (ends.mention[i]) mentions += seg
      else contains += seg
      if (h >= 0 && (a === h || b === h)) {
        if (ends.mention[i]) nearMentions += seg
        else nearContains += seg
      }
    }
    paths.current.contains?.setAttribute('d', contains)
    paths.current.mentions?.setAttribute('d', mentions)
    paths.current.nearContains?.setAttribute('d', nearContains)
    paths.current.nearMentions?.setAttribute('d', nearMentions)
  }

  /** Enquadra todos os nós na tela. */
  const fit = (): void => {
    const s = sim.current
    const el = svg.current
    if (!s || !el || graph.nodes.length === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < graph.nodes.length; i++) {
      minX = Math.min(minX, s.pos[i * 2])
      maxX = Math.max(maxX, s.pos[i * 2])
      minY = Math.min(minY, s.pos[i * 2 + 1])
      maxY = Math.max(maxY, s.pos[i * 2 + 1])
    }
    const { width, height } = el.getBoundingClientRect()
    if (width === 0 || height === 0) return
    extent.current = Math.max(1, (maxX - minX) * (maxY - minY))
    const pad = 60
    const k = Math.min(2, Math.max(0.15, Math.min((width - pad * 2) / (maxX - minX || 1), (height - pad * 2) / (maxY - minY || 1))))
    view.current = { k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k }
    applyView()
  }

  /*
   * Um laço de animação só: avança a simulação o que couber no orçamento do quadro e redesenha.
   * `run` não abre um segundo laço se já houver um (arrastar chama a cada movimento).
   */
  const loop = useRef<number | null>(null)
  const steps = useRef(0)
  const stop = (): void => {
    if (loop.current !== null) cancelAnimationFrame(loop.current)
    loop.current = null
  }
  const run = (): void => {
    if (loop.current !== null) return
    const tick = (): void => {
      const s = sim.current
      if (!s) {
        loop.current = null
        return
      }
      let active = true
      const start = performance.now()
      let n = 0
      while (active && n < 40 && (n === 0 || performance.now() - start < FRAME_BUDGET_MS)) {
        active = s.step()
        n++
      }
      steps.current += n
      paint()
      // Enquadra quando o desenho toma forma e de novo quando assenta, a não ser que a pessoa
      // já tenha mexido no zoom ou arrastado a vista.
      if (!fitted.current && (steps.current >= 150 || !active)) {
        fitted.current = true
        fit()
      } else if (!active && !userMoved.current && !refitted.current) {
        refitted.current = true
        fit()
      }
      loop.current = active ? requestAnimationFrame(tick) : null
    }
    loop.current = requestAnimationFrame(tick)
  }

  // Entrar ou sair da vizinhança enquadra de novo o que ficou na tela.
  const focusKey = focusRoot ? `${focusRoot.id}:${focusRoot.depth}` : ''
  const lastFocusKey = useRef(focusKey)

  // Nova simulação quando o grafo muda; os nós que já existiam ficam onde estavam.
  useLayoutEffect(() => {
    if (lastFocusKey.current !== focusKey) {
      lastFocusKey.current = focusKey
      userMoved.current = false
      refitted.current = false
      fitted.current = false
    }
    // Guarda onde estava cada nó do grafo anterior (uma vez, não a cada quadro).
    const prev = sim.current
    if (prev) shown.current.forEach((n, i) => last.current.set(n.id, [prev.pos[i * 2], prev.pos[i * 2 + 1]]))
    shown.current = graph.nodes
    // Os elementos na ordem do grafo (a mesma do render): a simulação escreve neles.
    nodeEls.current = Array.from(world.current?.querySelectorAll<SVGGElement>('.graph-node') ?? [])

    const initial = seedPositions(graph.nodes, last.current)
    const charge = Float64Array.from(graph.nodes, (n) => (isBoard(n) ? 6 : 1))
    const links = graph.links.map((l, i) => ({
      source: ends.a[i],
      target: ends.b[i],
      length: l.kind === 'contains' ? 55 : 130,
      strength: l.kind === 'contains' ? 0.06 : 0.025
    }))
    sim.current = createSimulation(graph.nodes.length, links, initial, charge)
    // Tudo já tinha posição (só mudou um texto): mexe pouco, em vez de reorganizar tudo.
    if (graph.nodes.length > 0 && graph.nodes.every((n) => last.current.has(n.id))) sim.current.reheat(0.08)
    steps.current = 0

    paint()
    if (!fitted.current && !prev) {
      const el = svg.current
      if (el) {
        const { width, height } = el.getBoundingClientRect()
        view.current = { x: width / 2, y: height / 2, k: 0.9 }
        applyView()
      }
    }
    run()
    return stop
    // paint/fit/run leem o grafo desta execução pelo fechamento; só o grafo novo recomeça tudo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, ends])

  // O destaque das ligações do nó em foco é desenhado junto com as posições.
  useEffect(() => {
    if (loop.current === null) paint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHover])

  const restart = (): void => {
    sim.current?.reheat(1)
    run()
  }

  /* ----- Zoom e arrasto ----- */

  const toWorld = (clientX: number, clientY: number): [number, number] => {
    const r = svg.current!.getBoundingClientRect()
    const v = view.current
    return [(clientX - r.left - v.x) / v.k, (clientY - r.top - v.y) / v.k]
  }

  const zoomAt = (factor: number, clientX?: number, clientY?: number): void => {
    const el = svg.current
    if (!el) return
    userMoved.current = true
    const r = el.getBoundingClientRect()
    const cx = (clientX ?? r.left + r.width / 2) - r.left
    const cy = (clientY ?? r.top + r.height / 2) - r.top
    const v = view.current
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor))
    view.current = { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k }
    applyView()
  }
  const zoomRef = useRef(zoomAt)
  zoomRef.current = zoomAt

  useEffect(() => {
    const el = svg.current
    if (!el) return
    // Passivo desligado: a roda do mouse dá zoom em vez de rolar a página.
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      zoomRef.current(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  type Drag = { kind: 'pan' | 'node' | 'link'; i?: number; startX: number; startY: number; vx: number; vy: number; moved: boolean }
  const drag = useRef<Drag | null>(null)

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0) return
    const nodeEl = (e.target as Element).closest<SVGGElement>('[data-i]')
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      // Shift + arrastar de um nó desenha uma ligação até outro.
      kind: nodeEl ? (e.shiftKey ? 'link' : 'node') : 'pan',
      i: nodeEl ? Number(nodeEl.dataset.i) : undefined,
      startX: e.clientX,
      startY: e.clientY,
      vx: view.current.x,
      vy: view.current.y,
      moved: false
    }
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drag.current
    if (!d) return
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) d.moved = true
    if (!d.moved) return
    if (d.kind === 'pan') {
      userMoved.current = true
      view.current = { ...view.current, x: d.vx + e.clientX - d.startX, y: d.vy + e.clientY - d.startY }
      applyView()
    } else if (d.kind === 'link' && d.i !== undefined && sim.current && linkLine.current) {
      const [x, y] = toWorld(e.clientX, e.clientY)
      const p = sim.current.pos
      const line = linkLine.current
      line.setAttribute('x1', String(p[d.i * 2]))
      line.setAttribute('y1', String(p[d.i * 2 + 1]))
      line.setAttribute('x2', String(x))
      line.setAttribute('y2', String(y))
      line.style.display = 'block'
    } else if (d.kind === 'node' && d.i !== undefined && sim.current && d.i < graph.nodes.length) {
      const [x, y] = toWorld(e.clientX, e.clientY)
      sim.current.fix(d.i, x, y)
      sim.current.pos[d.i * 2] = x
      sim.current.pos[d.i * 2 + 1] = y
      sim.current.reheat(0.3)
      paint()
      run()
    }
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drag.current
    drag.current = null
    if (linkLine.current) linkLine.current.style.display = 'none'
    if (!d || d.i === undefined || d.i >= graph.nodes.length) return
    const from = graph.nodes[d.i]
    if (d.kind === 'link') {
      // Solto em cima de outro nó: liga. A captura do ponteiro faz o alvo ser o SVG; procura pelo ponto.
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGGElement>('[data-i]')
      const to = under ? graph.nodes[Number(under.dataset.i)] : undefined
      if (d.moved && to && to.id !== from.id) createLink(from.id, to.id)
      else if (!d.moved) openNode(from)
      return
    }
    if (d.kind === 'node') {
      sim.current?.fix(d.i, null)
      // Clique (sem arrastar) abre o conteúdo do nó (ou liga, escolhendo o destino).
      if (!d.moved) openNode(from)
    }
  }

  /* ----- Imagem ----- */

  const saveImage = async (): Promise<void> => {
    const el = canvas.current
    if (!el) return
    // Sem os botões de zoom e o balão na imagem.
    el.classList.add('capturing')
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const r = el.getBoundingClientRect()
    try {
      const d = new Date()
      const name = `opsinote-grafo-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.png`
      const ok = await window.api.saveImage({ x: r.left, y: r.top, width: r.width, height: r.height }, name)
      if (ok) showToast('Imagem do grafo salva')
    } catch (err) {
      showToast(`Não foi possível salvar a imagem: ${(err as Error).message}`)
    } finally {
      el.classList.remove('capturing')
    }
  }

  /* ----- Destaques ----- */

  const hovered = activeHover ? graph.nodes[index.get(activeHover)!] : undefined
  const counts = useMemo(() => {
    const c: Partial<Record<GraphNodeKind, number>> = {}
    for (const n of graph.nodes) c[n.kind] = (c[n.kind] ?? 0) + 1
    return c
  }, [graph])
  const linkSource = linkFrom ? byId.get(linkFrom) : undefined
  const focusNode = focusRoot ? byId.get(focusRoot.id) : undefined

  const sideButton = (n: GraphNode, extra?: ReactNode): ReactNode => (
    <button
      type="button"
      onClick={() => openNode(n)}
      onContextMenu={(e) => onNodeMenu(e, n)}
      onPointerEnter={() => setHover(n.id)}
      onPointerLeave={() => setHover(null)}
      onFocus={() => setHover(n.id)}
      onBlur={() => setHover(null)}
    >
      {KIND_INFO[n.kind].icon}
      <span className="graph-orphan-text">
        <span>{n.title}</span>
        <small>{n.path}</small>
      </span>
      {extra}
    </button>
  )

  return (
    <main className="graph-view">
      <header className="graph-head">
        <div>
          <h1>Grafo</h1>
          <p className="muted small">
            Um texto se liga a outro quando cita o título dele (solto ou como <code>[[Título]]</code>). Clique num nó para abrir,
            arraste para mover e role para dar zoom. <strong>Shift + arraste</strong> de uma nota até outro nó para ligar os dois;
            o botão direito mostra mais opções.
          </p>
        </div>
        <div className="graph-toolbar">
          <label className="search">
            <Search size={14} />
            <input id="graph-search" placeholder="Destacar pelo título" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {matches?.size === 0 && (
            <span className="graph-no-match muted small" role="status">
              Nenhum título com “{query.trim()}”
            </span>
          )}
          <div className="graph-filters" role="group" aria-label="Mostrar no grafo">
            {FILTER_KEYS.map(({ key, kind }) => (
              <button
                key={key}
                type="button"
                className={cx('chip small', filter[key] && 'active')}
                aria-pressed={filter[key]}
                onClick={() => setFilter((f) => ({ ...f, [key]: !f[key] }))}
              >
                {KIND_INFO[kind].icon} {KIND_INFO[kind].label}
              </button>
            ))}
            <button
              type="button"
              className={cx('chip small', filter.hideDone && 'active')}
              aria-pressed={filter.hideDone}
              disabled={!filter.tasks}
              onClick={() => setFilter((f) => ({ ...f, hideDone: !f.hideDone }))}
            >
              Ocultar concluídas
            </button>
          </div>
          <label className="graph-color-by">
            <span>Cores por</span>
            <select id="graph-color-by" value={colorBy} onChange={(e) => setPrefs((p) => ({ ...p, colorBy: e.target.value as ColorBy }))}>
              {COLOR_BY.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn small" onClick={() => void saveImage()} disabled={graph.nodes.length === 0}>
            <ImageDown size={14} /> Salvar imagem
          </button>
        </div>
      </header>

      {(focusNode || linkSource) && (
        <div className={cx('graph-banner', linkSource && 'linking')} role="status">
          {linkSource ? (
            <>
              <Link2 size={14} />
              <span>
                Clique no nó a ligar com <strong>{linkSource.title}</strong>. <kbd>Esc</kbd> cancela.
              </span>
              <button type="button" className="btn small ghost" onClick={() => setLinkFrom(null)}>
                Cancelar
              </button>
            </>
          ) : (
            focusNode && (
              <>
                <Waypoints size={14} />
                <span>
                  Vizinhança de <strong>{focusNode.title}</strong>
                </span>
                <span className="graph-depth" role="group" aria-label="Distância">
                  {[1, 2, 3].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={cx('chip small', focusRoot?.depth === d && 'active')}
                      aria-pressed={focusRoot?.depth === d}
                      onClick={() => setFocus({ id: focusNode.id, depth: d })}
                    >
                      {d} {d === 1 ? 'passo' : 'passos'}
                    </button>
                  ))}
                </span>
                <button type="button" className="btn small ghost" onClick={() => setFocus(null)}>
                  <X size={14} /> Grafo completo
                </button>
              </>
            )
          )}
        </div>
      )}

      <div className="graph-body">
        {/* Com muitos nós, sem transições: animar milhares de elementos de uma vez trava a tela. */}
        <div
          ref={canvas}
          className={cx('graph-canvas', zoomed && 'zoomed', mode, graph.nodes.length > LARGE_GRAPH && 'large', far && 'far', linkFrom && 'picking')}
        >
          {graph.nodes.length === 0 && <p className="graph-empty muted">Nada para mostrar. Crie um espaço ou ligue mais tipos acima.</p>}
          <svg
            ref={svg}
            className="graph-svg"
            role="img"
            aria-label={`Grafo com ${graph.nodes.length} nós e ${mentionCount} menções`}
            data-nodes={graph.nodes.length}
            data-links={graph.links.length}
            data-mentions={mentionCount}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <g ref={world}>
              <path ref={(el) => void (paths.current.contains = el)} className="graph-links contains" />
              <path ref={(el) => void (paths.current.mentions = el)} className="graph-links mentions" />
              <path ref={(el) => void (paths.current.nearContains = el)} className="graph-links contains near" />
              <path ref={(el) => void (paths.current.nearMentions = el)} className="graph-links mentions near" />
              <line ref={linkLine} className="graph-new-link" style={{ display: 'none' }} />
              <g className="graph-nodes">
                {graph.nodes.map((n, i) => (
                  <GraphNodeEl
                    key={n.id}
                    node={n}
                    index={i}
                    color={colorOf(n, colorBy)}
                    cls={cx(
                      showOrphans && lonelyIds.has(n.id) && 'orphan',
                      matches?.has(n.id) && 'match',
                      activeHover === n.id && 'hovered',
                      focusSet?.has(n.id) && 'near',
                      focusRoot?.id === n.id && 'root',
                      linkFrom === n.id && 'link-source'
                    )}
                    onHover={onNodeHover}
                    onOpen={openNode}
                    onMenu={onNodeMenu}
                  />
                ))}
              </g>
            </g>
          </svg>

          <div className="graph-zoom" role="group" aria-label="Zoom">
            <button type="button" className="icon-btn" title="Aproximar" aria-label="Aproximar" onClick={() => zoomAt(1.25)}>
              <Plus size={15} />
            </button>
            <button type="button" className="icon-btn" title="Afastar" aria-label="Afastar" onClick={() => zoomAt(0.8)}>
              <Minus size={15} />
            </button>
            <button type="button" className="icon-btn" title="Enquadrar tudo" aria-label="Enquadrar tudo" onClick={fit}>
              <Maximize size={15} />
            </button>
            <button type="button" className="icon-btn" title="Reorganizar" aria-label="Reorganizar" onClick={restart}>
              <RefreshCw size={15} />
            </button>
          </div>

          {hovered && (
            <div className="graph-tooltip" role="status">
              <strong>{hovered.title}</strong>
              <span>{hovered.path}</span>
              <span>
                {hovered.mentions === 0
                  ? isBoard(hovered)
                    ? `${near.get(hovered.id)?.size ?? 0} itens`
                    : 'Sem conexões'
                  : `${hovered.mentions} ${hovered.mentions === 1 ? 'menção' : 'menções'}`}
              </span>
            </div>
          )}
          {contextMenu.menu}
        </div>

        <aside className="graph-side" aria-label="Resumo do grafo">
          <section>
            <h2>Resumo</h2>
            <ul className="graph-legend">
              {colorBy === 'category'
                ? (Object.keys(CATEGORY_COLORS) as Kind[]).map((k) => (
                    <li key={k}>
                      <span className="graph-dot" style={{ background: CATEGORY_COLORS[k] }} /> {CATEGORY_LABELS[k]}
                    </li>
                  ))
                : (Object.keys(KIND_INFO) as GraphNodeKind[])
                    .filter((k) => counts[k])
                    .map((k) => (
                      <li key={k}>
                        <span
                          className={cx('graph-dot', k)}
                          style={colorBy === 'kind' ? { background: KIND_COLORS[k], borderColor: KIND_COLORS[k] } : undefined}
                        />{' '}
                        {KIND_INFO[k].label}
                        <span className="graph-count">{counts[k]}</span>
                      </li>
                    ))}
              <li>
                <span className="graph-line mentions" /> Menções
                <span className="graph-count">{mentionCount}</span>
              </li>
              <li>
                <span className="graph-line contains" /> Faz parte do espaço
              </li>
            </ul>
          </section>

          {hubs.length > 0 && (
            <section>
              <h2>
                <TrendingUp size={14} /> Mais conectados
              </h2>
              <ul className="graph-orphans graph-hubs">
                {hubs.map((n) => (
                  <li key={n.id}>{sideButton(n, <span className="graph-count">{n.mentions}</span>)}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="graph-lonely">
            <h2>
              <Unlink size={14} /> Sem conexões
              <span className="graph-count">{lonely.length}</span>
            </h2>
            <p className="muted small">Tarefas e notas que não citam nada e não são citadas.</p>
            <label className="graph-toggle">
              <input type="checkbox" checked={showOrphans} onChange={(e) => setShowOrphans(e.target.checked)} />
              Destacar no grafo
            </label>
            {lonely.length > 0 && (
              <ul className="graph-orphans">
                {lonely.slice(0, 200).map((n) => (
                  <li key={n.id}>{sideButton(n)}</li>
                ))}
                {lonely.length > 200 && <li className="muted small">…e mais {lonely.length - 200}</li>}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}
