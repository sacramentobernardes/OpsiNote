import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import {
  ArrowDown,
  ArrowUp,
  Bold,
  ChevronsDownUp,
  ChevronsUpDown,
  Circle,
  CircleCheck,
  CornerDownRight,
  ExternalLink,
  FileText,
  FolderOpen,
  ImageDown,
  Link,
  ListTree,
  LocateFixed,
  Maximize,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Network,
  Orbit,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  StickyNote,
  Sun,
  Trash2,
  Type,
  Undo2,
  Workflow,
  X
} from 'lucide-react'
import { useBinding, useStore } from '../store'
import type { Board, BoardType, ListType, MindLayout, MindMap, MindNode, MindShape, Section } from '../types'
import {
  adoptTopics,
  createTopic,
  findNode,
  generateMindMap,
  keepContent,
  linkedItem,
  moveBy,
  moveTopic,
  nodeUrl,
  normalizeUrl,
  parentOf,
  removeTopic,
  renameTopic,
  reparentTopic,
  resetMoved,
  setAllCollapsed,
  setTopicDone,
  syncMindMap,
  updateMap,
  updateNode,
  walk,
  type Change,
  type Trashed
} from '../lib/mindmap'
import { bounds, edgePath, layoutMindMap, nearest, type Direction, type Placed, type Size } from '../lib/mindmapLayout'
import { comboFromEvent } from '../lib/shortcuts'
import { sheetValues, sheetVariables } from '../lib/variables'
import { COLORS, cx } from '../lib/util'
import { ColorPicker, InlineEdit, useContextMenu, type MenuEntry } from './ui'
import { RichEditor } from './RichEditor'

const LAYOUTS: { id: MindLayout; label: string; icon: ReactNode }[] = [
  { id: 'map', label: 'Mapa', icon: <Network size={14} /> },
  { id: 'right', label: 'Horizontal', icon: <ListTree size={14} /> },
  { id: 'down', label: 'Vertical', icon: <Workflow size={14} /> },
  { id: 'radial', label: 'Radial', icon: <Orbit size={14} /> }
]

const SHAPES: { id: MindShape | undefined; label: string }[] = [
  { id: undefined, label: 'Arredondado' },
  { id: 'pill', label: 'Pílula' },
  { id: 'rect', label: 'Retângulo' },
  { id: 'plain', label: 'Sem borda' }
]

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3
/** Passos de desfazer guardados por mapa (só nesta sessão). */
const HISTORY = 100

interface Viewport {
  x: number
  y: number
  k: number
}

/* Último mapa aberto e largura do painel, por computador. */
const LAST_KEY = 'opsinote.mindmap'
const WIDE_KEY = 'opsinote.mindmap.wide'
type BoardKey = { type: BoardType; id: string }
function readLast(): BoardKey | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as Partial<BoardKey> | null
    return v && (v.type === 'workspace' || v.type === 'library') && typeof v.id === 'string' ? { type: v.type, id: v.id } : null
  } catch {
    return null
  }
}
function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Sem armazenamento local: vale só para esta sessão.
  }
}
function readWide(): boolean {
  try {
    return localStorage.getItem(WIDE_KEY) === '1'
  } catch {
    return false
  }
}

/** Texto escuro ou claro, o que se lê melhor sobre a cor (#rrggbb). */
function textOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? '#1a1204' : '#ffffff'
}

/** Sem acentos e sem maiúsculas, para a busca. */
const fold = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Tamanho provável antes da primeira medida (só para o primeiro quadro não sair embolado). */
const estimate = (n: MindNode): Size => ({ w: Math.min(260, 28 + n.text.length * 7), h: 32 })

/** Que tipo de item do espaço o tópico representa (null: nenhum, é um tópico solto). Subitem não é tarefa. */
type Linked = 'section' | 'note' | 'task' | 'done' | 'sub' | null

interface Item {
  node: MindNode
  placed: Placed
  /** Cor do ramo (o nó colorido mais próximo acima dele, sem contar a raiz). */
  branch?: string
}

/** Mapa salvo e seções do espaço num momento (um passo de desfazer). */
interface Snap {
  map: MindMap | undefined
  sections: Section[]
}
/** `trashed`: o que o passo seguinte a este mandou para a lixeira (para refazer igual). */
type Step = { snap: Snap; trashed?: Trashed[] }

type NodeProps = {
  item: Item
  layout: MindLayout
  isRoot: boolean
  rootColor: string
  selected: boolean
  editing: boolean
  linked: Linked
  /** A caixa de marcar das tarefas (só nos espaços; nas bibliotecas as tarefas são modelo). */
  checkable: boolean
  /** "feitas/total" das tarefas do ramo. */
  progress?: string
  /** Com uma busca: se o tópico bate com ela. */
  match?: boolean
  register: (id: string, el: HTMLDivElement | null) => void
  onToggle: (id: string) => void
  onCheck: (id: string) => void
  onOpenLink: (url: string) => void
  onOpenRef: (n: MindNode) => void
  onShowNote: (id: string) => void
  onFinishEdit: (id: string, text: string | null, next?: 'child' | 'sibling') => void
  onMenu: (e: ReactMouseEvent<HTMLElement>, n: MindNode) => void
}

/** Um tópico. Memorizado: mover a vista ou editar outro nó não redesenha este. */
const MindNodeEl = memo(function MindNodeEl({
  item,
  layout,
  isRoot,
  rootColor,
  selected,
  editing,
  linked,
  checkable,
  progress,
  match,
  register,
  onToggle,
  onCheck,
  onOpenLink,
  onOpenRef,
  onShowNote,
  onFinishEdit,
  onMenu
}: NodeProps): ReactNode {
  const { node: n, placed } = item
  const color = isRoot ? (n.color ?? rootColor) : n.color
  const filled = isRoot || (!!n.color && n.filled)
  const url = nodeUrl(n)
  const kids = n.children.length
  const isTask = linked === 'task' || linked === 'done'
  const done = linked === 'done'
  const refIcon =
    linked === 'section' ? (
      <FolderOpen size={12} />
    ) : linked === 'sub' ? (
      <CornerDownRight size={12} />
    ) : linked === 'note' ? (
      <FileText size={12} />
    ) : isTask && !checkable ? (
      done ? <CircleCheck size={12} /> : <Circle size={12} />
    ) : null
  // O botão de recolher fica do lado de onde saem os filhos.
  const leavesBelow = n.children.every((c) => c.collapsed || !c.children.length)
  const toggleSide =
    layout === 'down' ? (leavesBelow ? 'bottom-left' : 'bottom') : layout === 'radial' ? 'bottom' : placed.side === 'left' ? 'left' : 'right'
  const style = {
    left: placed.box.x,
    top: placed.box.y,
    ...(color ? { '--node-color': color } : {}),
    ...(filled && color && /^#/.test(color) ? { '--node-text': textOn(color) } : {})
  } as CSSProperties
  return (
    <div
      ref={(el) => register(n.id, el)}
      data-id={n.id}
      className={cx(
        'mm-node',
        isRoot && 'root',
        placed.depth === 1 && 'branch',
        color && 'colored',
        filled && 'filled',
        n.shape && `shape-${n.shape}`,
        n.bold && 'bold',
        n.big && 'big',
        selected && 'selected',
        done && 'done',
        match === true && 'match',
        match === false && 'dim'
      )}
      style={style}
      onContextMenu={(e) => onMenu(e, n)}
    >
      {isTask && checkable && (
        <input
          type="checkbox"
          className="mm-check-box"
          checked={done}
          title={done ? 'Marcar como pendente' : 'Marcar como concluída'}
          aria-label={`Concluir ${n.text}`}
          onChange={() => onCheck(n.id)}
        />
      )}
      {editing ? (
        <textarea
          className="mm-edit"
          defaultValue={n.text}
          autoFocus
          rows={1}
          aria-label="Texto do tópico"
          onFocus={(e) => e.currentTarget.select()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') onFinishEdit(n.id, null)
            else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onFinishEdit(n.id, e.currentTarget.value, 'sibling')
            } else if (e.key === 'Tab') {
              e.preventDefault()
              onFinishEdit(n.id, e.currentTarget.value, 'child')
            }
          }}
          onBlur={(e) => onFinishEdit(n.id, e.currentTarget.value)}
        />
      ) : (
        <span className="mm-text">{n.text || ' '}</span>
      )}
      {progress && !editing && <span className="mm-progress">{progress}</span>}
      {(refIcon || url || n.note) && !editing && (
        <span className="mm-icons">
          {refIcon && (
            <button type="button" className="mm-icon" title="Abrir no espaço" aria-label="Abrir no espaço" onClick={() => onOpenRef(n)}>
              {refIcon}
            </button>
          )}
          {n.note && (
            <button type="button" className="mm-icon" title="Ver a nota" aria-label="Ver a nota" onClick={() => onShowNote(n.id)}>
              <StickyNote size={12} />
            </button>
          )}
          {url && (
            <button type="button" className="mm-icon" title={url} aria-label={`Abrir ${url}`} onClick={() => onOpenLink(url)}>
              <ExternalLink size={12} />
            </button>
          )}
        </span>
      )}
      {kids > 0 && !isRoot && (
        <button
          type="button"
          className={cx('mm-toggle', toggleSide, n.collapsed && 'closed')}
          title={n.collapsed ? `Mostrar ${kids} ${kids === 1 ? 'tópico' : 'tópicos'}` : 'Recolher'}
          aria-label={n.collapsed ? 'Expandir' : 'Recolher'}
          aria-expanded={!n.collapsed}
          onClick={() => onToggle(n.id)}
        >
          {n.collapsed ? kids : <Minus size={10} />}
        </button>
      )}
    </div>
  )
})

/** Campo que só grava ao sair dele (cada tecla não vira um passo de desfazer). */
function DraftField({
  value,
  onCommit,
  multiline,
  placeholder,
  label
}: {
  value: string
  onCommit: (v: string) => void
  multiline?: boolean
  placeholder?: string
  label: string
}): ReactNode {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (): void => {
    if (draft !== value) onCommit(draft)
  }
  const common = {
    value: draft,
    placeholder,
    'aria-label': label,
    onBlur: commit,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value)
  }
  return multiline ? (
    <textarea {...common} rows={5} />
  ) : (
    <input
      {...common}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** Tela do mapa mental de um espaço ou biblioteca. */
export function MindMapView(): ReactNode {
  const data = useStore((s) => s.data!)
  const view = useStore((s) => s.view)
  const commitMindMap = useStore((s) => s.commitMindMap)
  const updateBoard = useStore((s) => s.updateBoard)
  const updateEntry = useStore((s) => s.updateEntry)
  const navigate = useStore((s) => s.navigate)
  const showToast = useStore((s) => s.showToast)
  const setTheme = useStore((s) => s.setTheme)
  const doneKeys = useBinding('toggleDone')

  /* ----- Qual espaço ----- */

  const requested = view.type === 'mindmap' ? view.board : undefined
  const [picked, setPicked] = useState<BoardKey | null>(() => requested ?? readLast())
  useEffect(() => {
    if (requested) setPicked(requested)
  }, [requested?.type, requested?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const found = picked ? (picked.type === 'workspace' ? data.workspaces : data.libraries).find((b) => b.id === picked.id) : undefined
  const boardType: BoardType = found ? picked!.type : data.workspaces.length ? 'workspace' : 'library'
  const board: Board | undefined = found ?? data.workspaces[0] ?? data.libraries[0]
  const key = board ? `${boardType}:${board.id}` : ''
  useEffect(() => {
    if (board) writePref(LAST_KEY, JSON.stringify({ type: boardType, id: board.id }))
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const stored = board?.mindmap
  const sections = board?.sections
  // O mapa sempre igual ao espaço: títulos atuais, itens novos dentro, excluídos fora.
  const map = useMemo(
    () => (board ? (stored ? syncMindMap(stored, board).map : generateMindMap(board)) : null),
    [stored, sections, board?.title] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const layout = map?.layout ?? 'map'
  const moved = map?.moved?.[layout]

  /* ----- Editar, desfazer ----- */

  const history = useRef<{ key: string; past: Step[]; future: Step[] }>({ key: '', past: [], future: [] })
  if (history.current.key !== key) history.current = { key, past: [], future: [] }
  const [, bump] = useState(0)
  /** O estado gravado agora, mesmo entre duas edições no mesmo evento (renomear e criar o próximo). */
  const current = useRef<Snap>({ map: stored, sections: sections ?? [] })
  current.current = { map: stored, sections: sections ?? [] }

  /** Grava uma edição do mapa (e do espaço, se ela mudou seções ou itens) como um passo de desfazer. */
  const apply = (next: { map: MindMap | undefined; sections?: Section[]; trashed?: Trashed[] }): void => {
    if (!board) return
    const cur = current.current
    const nextSections = next.sections ?? cur.sections
    if (nextSections === cur.sections && (next.map === cur.map || (next.map && !cur.map && next.map === map))) return
    const h = history.current
    h.past.push({ snap: cur, trashed: next.trashed })
    if (h.past.length > HISTORY) h.past.shift()
    h.future = []
    current.current = { map: next.map, sections: nextSections }
    commitMindMap(boardType, board.id, { map: next.map, sections: nextSections, trashed: next.trashed })
  }
  const commit = (next: MindMap | undefined): void => apply({ map: next })
  const applyChange = (c: Change): void => apply(c)

  const travel = (back: boolean): void => {
    const h = history.current
    const from = back ? h.past : h.future
    const step = from.pop()
    if (!board || !step) return
    const cur = current.current
    ;(back ? h.future : h.past).push({ snap: cur, trashed: step.trashed })
    const sectionsNow = keepContent(step.snap.sections, cur.sections)
    current.current = { map: step.snap.map, sections: sectionsNow }
    // Refazer uma exclusão manda os itens para a lixeira de novo.
    commitMindMap(boardType, board.id, { map: step.snap.map, sections: sectionsNow, trashed: back ? undefined : step.trashed })
    bump((n) => n + 1)
  }

  // Mapas da versão anterior podem ter tópicos soltos embaixo de seções e tarefas: viram itens do espaço.
  useEffect(() => {
    if (!map || !board) return
    const r = adoptTopics(map, board.sections)
    if (!r) return
    history.current.past = []
    history.current.future = []
    commitMindMap(boardType, board.id, { map: r.map, sections: r.sections })
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const editingRef = useRef(editing)
  editingRef.current = editing
  /** Tela vai até o nó selecionado depois do próximo layout (criado ou escolhido pelo teclado). */
  const revealNext = useRef(false)
  const selectedNode = map && selected ? findNode(map.root, selected) : undefined
  useEffect(() => {
    if (selected && map && !findNode(map.root, selected)) setSelected(null)
  }, [map, selected])

  /** Aba do painel: o documento do item (como na árvore do espaço) ou a aparência do tópico. */
  const [tab, setTab] = useState<'doc' | 'topic'>('doc')
  const [wide, setWide] = useState(readWide)

  const canvas = useRef<HTMLDivElement>(null)
  const focusCanvas = (): void => canvas.current?.focus({ preventScroll: true })

  const select = (id: string | null, reveal = false): void => {
    setSelected(id)
    revealNext.current = reveal
  }

  /** Tópico recém-criado e ainda não digitado: Esc (ou deixar vazio) o descarta. */
  const fresh = useRef<string | null>(null)

  /** Cria (no espaço também, se for embaixo da raiz, de uma seção ou de um item) e já abre para digitar. */
  const create = (how: 'child' | 'sibling', from: string, base = map, list?: ListType): void => {
    if (!base) return
    const r = createTopic(base, current.current.sections, how, from, list)
    if (!r.id) return
    applyChange(r)
    fresh.current = r.id
    select(r.id, true)
    setEditing(r.id)
  }

  const remove = (id: string): void => {
    if (!map || id === map.root.id) return
    const parent = parentOf(map.root, id)
    const r = removeTopic(map, current.current.sections, id)
    applyChange(r)
    select(parent?.id ?? null, true)
    const items = r.trashed?.length ?? 0
    showToast(items ? `Tópico excluído; ${items === 1 ? '1 item foi' : `${items} itens foram`} para a lixeira` : 'Tópico excluído', {
      label: 'Desfazer',
      run: () => travel(true)
    })
  }

  const toggle = (id: string): void => {
    const n = map && findNode(map.root, id)
    if (map && n?.children.length) commit(updateNode(map, id, { collapsed: !n.collapsed }))
  }

  const check = (id: string): void => {
    const n = map && findNode(map.root, id)
    const entry = n ? linkedItem(current.current.sections, n).entry : undefined
    if (n && entry) apply({ map: current.current.map, sections: setTopicDone(current.current.sections, n, !entry.done) })
  }

  const rename = (id: string, text: string, base = map): MindMap | null => {
    if (!base || !board) return base
    if (id === base.root.id) {
      // A raiz é o espaço: renomear o tópico central renomeia o espaço.
      if (text !== board.title) updateBoard(boardType, board.id, { title: text })
      return base
    }
    const r = renameTopic(base, current.current.sections, id, text)
    applyChange(r)
    return r.map
  }

  const finishEdit = (id: string, text: string | null, next?: 'child' | 'sibling'): void => {
    if (editingRef.current !== id || !map) return
    editingRef.current = null
    setEditing(null)
    const t = text?.trim()
    const wasFresh = fresh.current === id
    fresh.current = null
    if (wasFresh && !t) {
      // Desfaz a criação (no espaço também), sem deixar um "refazer" que traria o tópico de volta.
      travel(true)
      history.current.future.pop()
      select(parentOf(map.root, id)?.id ?? null)
      focusCanvas()
      return
    }
    const base = t && t !== findNode(map.root, id)?.text ? rename(id, t) : map
    if (next && text !== null) create(next, id, base ?? map)
    else focusCanvas()
  }

  const openLink = (url: string): void => {
    // O processo principal manda para o navegador (setWindowOpenHandler).
    window.open(url, '_blank', 'noopener')
  }
  const openRef = (n: MindNode): void => {
    if (!board || !n.ref) return
    const { section, list, entry } = linkedItem(board.sections, n)
    if (!section) return
    navigate({ view: { type: boardType, id: board.id }, sectionId: section.id, ...(entry ? { list, entryId: entry.id } : {}) })
  }
  const openDoc = (id: string): void => {
    select(id)
    setTab('doc')
  }

  /* ----- Ligação de cada tópico com o espaço ----- */

  const index = useMemo(() => {
    const entries = new Map<string, { list: ListType; done: boolean; sub: boolean }>()
    const ids = new Set<string>()
    for (const s of sections ?? []) {
      ids.add(s.id)
      for (const list of ['checklist', 'notes'] as const) for (const e of s[list]) entries.set(e.id, { list, done: !!e.done, sub: !!e.parentId })
    }
    return { entries, sections: ids }
  }, [sections])
  const linkedKind = (n: MindNode): Linked => {
    if (!n.ref) return null
    if (!n.ref.entryId) return index.sections.has(n.ref.sectionId) ? 'section' : null
    const e = index.entries.get(n.ref.entryId)
    return !e ? null : e.sub ? 'sub' : e.list === 'notes' ? 'note' : e.done ? 'done' : 'task'
  }

  /** Progresso das tarefas de cada ramo (só nos espaços). */
  const progress = useMemo(() => {
    const out = new Map<string, string>()
    if (!map || boardType !== 'workspace') return out
    const visit = (n: MindNode): [number, number] => {
      let done = 0
      let total = 0
      for (const c of n.children) {
        const [d, t] = visit(c)
        done += d
        total += t
        const e = c.ref?.entryId ? index.entries.get(c.ref.entryId) : undefined
        if (e?.list === 'checklist' && !e.sub) {
          total++
          if (e.done) done++
        }
      }
      if (total) out.set(n.id, `${done}/${total}`)
      return [done, total]
    }
    visit(map.root)
    return out
  }, [map, index, boardType])

  /* ----- Busca ----- */

  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const q = fold(query.trim())
    if (!q || !map) return null
    const out: string[] = []
    walk(map.root, (n) => {
      if (fold(n.text).includes(q)) out.push(n.id)
    })
    return out
  }, [map, query])
  const matchSet = useMemo(() => (matches ? new Set(matches) : null), [matches])

  /** Vai para o próximo (ou anterior) resultado, abrindo os ramos recolhidos acima dele. */
  const findNext = (back = false): void => {
    if (!map || !matches?.length) return
    const at = selected ? matches.indexOf(selected) : -1
    const id = matches[at < 0 ? (back ? matches.length - 1 : 0) : (at + (back ? -1 : 1) + matches.length) % matches.length]
    let next = map
    for (let p = parentOf(map.root, id); p; p = parentOf(map.root, p.id)) if (p.collapsed) next = updateNode(next, p.id, { collapsed: undefined })
    if (next !== map) commit(next)
    select(id, true)
  }

  /* ----- Medidas e posições ----- */

  const nodeEls = useRef(new Map<string, HTMLDivElement>())
  const [sizes, setSizes] = useState<Map<string, Size>>(() => new Map())
  const register = useRef((id: string, el: HTMLDivElement | null) => {
    if (el) nodeEls.current.set(id, el)
    else nodeEls.current.delete(id)
  }).current

  const placement = useMemo(
    () => (map ? layoutMindMap(map.root, (n) => sizes.get(n.id) ?? estimate(n), layout, moved) : new Map<string, Placed>()),
    [map, sizes, layout, moved]
  )
  const items = useMemo(() => {
    const out: Item[] = []
    if (!map) return out
    const visit = (n: MindNode, parentColor: string | undefined, depth: number): void => {
      const placed = placement.get(n.id)
      if (!placed) return
      const branch = depth === 0 ? undefined : (n.color ?? parentColor)
      out.push({ node: n, placed, branch })
      if (!n.collapsed) for (const c of n.children) visit(c, branch, depth + 1)
    }
    visit(map.root, undefined, 0)
    return out
  }, [map, placement])

  // Mede os nós depois de cada desenho; se algum mudou de tamanho, o layout é refeito antes de pintar.
  useLayoutEffect(() => {
    let next: Map<string, Size> | null = null
    for (const [id, el] of nodeEls.current) {
      const w = el.offsetWidth
      const h = el.offsetHeight
      const old = sizes.get(id)
      if (!old || Math.abs(old.w - w) > 0.5 || Math.abs(old.h - h) > 0.5) (next ??= new Map(sizes)).set(id, { w, h })
    }
    if (next) setSizes(next)
  })

  /* ----- Vista ----- */

  const world = useRef<HTMLDivElement>(null)
  const vp = useRef<Viewport>({ x: 0, y: 0, k: 1 })
  const [zoomPct, setZoomPct] = useState(100)
  const applyView = (): void => {
    const v = vp.current
    if (world.current) world.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`
    setZoomPct(Math.round(v.k * 100))
  }

  const fit = (): void => {
    const el = canvas.current
    const b = bounds(placement)
    if (!el || !b) return
    const { width, height } = el.getBoundingClientRect()
    if (!width || !height) return
    const pad = 48
    const k = Math.min(1.2, Math.max(MIN_ZOOM, Math.min((width - pad * 2) / b.w, (height - pad * 2) / b.h)))
    vp.current = { k, x: width / 2 - (b.x + b.w / 2) * k, y: height / 2 - (b.y + b.h / 2) * k }
    applyView()
  }

  // Enquadra ao trocar de espaço, quando os tamanhos já foram medidos.
  const fittedKey = useRef('')
  useLayoutEffect(() => {
    if (fittedKey.current === key || !map || !sizes.has(map.root.id)) return
    fittedKey.current = key
    fit()
  })

  // Leva a vista até o nó escolhido pelo teclado ou recém-criado, se estiver fora da tela.
  useLayoutEffect(() => {
    if (!revealNext.current || !selected) return
    const p = placement.get(selected)
    const el = canvas.current
    if (!p || !el) return
    revealNext.current = false
    const { width, height } = el.getBoundingClientRect()
    const v = vp.current
    const x = p.box.x * v.k + v.x
    const y = p.box.y * v.k + v.y
    const m = 40
    let dx = 0
    let dy = 0
    if (x < m) dx = m - x
    else if (x + p.box.w * v.k > width - m) dx = width - m - (x + p.box.w * v.k)
    if (y < m) dy = m - y
    else if (y + p.box.h * v.k > height - m) dy = height - m - (y + p.box.h * v.k)
    if (dx || dy) {
      vp.current = { ...v, x: v.x + dx, y: v.y + dy }
      applyView()
    }
  })

  const zoomAt = (factor: number, clientX?: number, clientY?: number): void => {
    const el = canvas.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (clientX ?? r.left + r.width / 2) - r.left
    const py = (clientY ?? r.top + r.height / 2) - r.top
    const v = vp.current
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor))
    vp.current = { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }
    applyView()
  }
  const zoomRef = useRef(zoomAt)
  zoomRef.current = zoomAt
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    // Passivo desligado: a roda dá zoom em vez de rolar a página.
    const onWheel = (e: WheelEvent): void => {
      if ((e.target as Element).closest('.mm-edit')) return
      e.preventDefault()
      zoomRef.current(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /*
   * ----- Arrastar -----
   * O fundo (ou a raiz) move a vista. Um tópico vai junto com o ramo: solto sobre outro tópico,
   * vira filho dele; solto no vazio, fica onde foi deixado.
   */

  type Drag = {
    id?: string
    els: HTMLElement[]
    startX: number
    startY: number
    vx: number
    vy: number
    moved: boolean
    target?: HTMLElement | null
  }
  const drag = useRef<Drag | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || (e.target as Element).closest('button, textarea, input, .mm-zoom')) return
    const nodeEl = (e.target as Element).closest<HTMLElement>('.mm-node')
    const id = nodeEl?.dataset.id
    e.currentTarget.setPointerCapture(e.pointerId)
    const els: HTMLElement[] = []
    const n = id && map && id !== map.root.id ? findNode(map.root, id) : undefined
    if (n) {
      const add = (x: MindNode): void => {
        const el = nodeEls.current.get(x.id)
        if (el) els.push(el)
        if (!x.collapsed) x.children.forEach(add)
      }
      add(n)
    }
    drag.current = { id, els, startX: e.clientX, startY: e.clientY, vx: vp.current.x, vy: vp.current.y, moved: false }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true
      d.els.forEach((el, i) => el.classList.add(i ? 'dragging-along' : 'dragging'))
    }
    if (!d.moved) return
    if (!d.els.length) {
      vp.current = { ...vp.current, x: d.vx + dx, y: d.vy + dy }
      applyView()
      return
    }
    for (const el of d.els) el.style.translate = `${dx / vp.current.k}px ${dy / vp.current.k}px`
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.mm-node') ?? null
    if (under !== d.target) {
      d.target?.classList.remove('drop-target')
      d.target = under
      under?.classList.add('drop-target')
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    drag.current = null
    if (!d) return
    for (const el of d.els) {
      el.classList.remove('dragging', 'dragging-along')
      el.style.translate = ''
    }
    d.target?.classList.remove('drop-target')
    if (!d.moved) {
      // Abrir o painel estreita a tela: a vista vai até o tópico se ele ficar embaixo do painel.
      select(d.id ?? null, !selected)
      focusCanvas()
      return
    }
    if (!map || !d.id || !d.els.length) return
    const to = d.target?.dataset.id
    if (to && to !== d.id) {
      const r = reparentTopic(map, current.current.sections, d.id, to)
      if (r.map === map) showToast('Um tópico não pode ir para dentro dele mesmo.')
      else {
        applyChange(r)
        select(d.id, true)
      }
      return
    }
    const k = vp.current.k
    commit(moveBy(map, layout, d.id, (e.clientX - d.startX) / k, (e.clientY - d.startY) / k))
    select(d.id, true)
  }

  /* ----- Teclado ----- */

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget || !map) return
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      travel(!e.shiftKey)
      return
    }
    if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      travel(false)
      return
    }
    if (ctrl && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      document.querySelector<HTMLInputElement>('.mm-search input')?.focus()
      return
    }
    if (!selected) {
      if (e.key.startsWith('Arrow') || e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        select(map.root.id, true)
      }
      return
    }
    const arrows: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
    if (doneKeys && comboFromEvent(e) === doneKeys) {
      e.preventDefault()
      check(selected)
    } else if (ctrl && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      applyChange(moveTopic(map, current.current.sections, selected, e.key === 'ArrowUp' ? -1 : 1))
    } else if (arrows[e.key] && !e.altKey) {
      e.preventDefault()
      const to = nearest(placement, selected, arrows[e.key])
      if (to) select(to, true)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      create('child', selected)
    } else if (e.key === 'Enter' && !ctrl) {
      e.preventDefault()
      create('sibling', selected)
    } else if (e.key === 'F2') {
      e.preventDefault()
      setEditing(selected)
    } else if (e.key === ' ') {
      e.preventDefault()
      toggle(selected)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      remove(selected)
    } else if (e.key === 'Escape') {
      select(null)
    }
  }

  /* ----- Menu do botão direito ----- */

  /** O que "novo filho" cria embaixo do tópico. */
  const childLabel = (n: MindNode): string => {
    const kind = n.id === map?.root.id ? 'root' : linkedKind(n)
    return kind === 'root' ? 'Nova seção' : kind === 'section' ? 'Nova tarefa' : kind ? 'Novo subitem' : 'Novo tópico filho'
  }

  const contextMenu = useContextMenu()
  const menuFor = (n: MindNode): MenuEntry[] => {
    if (!map) return []
    const isRoot = n.id === map.root.id
    const url = nodeUrl(n)
    const kind = linkedKind(n)
    const isTask = kind === 'task' || kind === 'done'
    const entries: (MenuEntry | null)[] = [
      { label: 'Editar texto', icon: <Pencil size={14} />, hint: 'F2', onSelect: () => setEditing(n.id) },
      { label: childLabel(n), icon: <CornerDownRight size={14} />, hint: 'Tab', onSelect: () => create('child', n.id) },
      kind === 'section' ? { label: 'Nova nota', icon: <FileText size={14} />, onSelect: () => create('child', n.id, map, 'notes') } : null,
      isRoot ? null : { label: 'Novo tópico irmão', icon: <Plus size={14} />, hint: 'Enter', onSelect: () => create('sibling', n.id) },
      isTask && boardType === 'workspace'
        ? { label: kind === 'done' ? 'Marcar como pendente' : 'Marcar como concluída', icon: <CircleCheck size={14} />, hint: doneKeys ?? undefined, onSelect: () => check(n.id) }
        : null,
      kind === 'task' || kind === 'done' || kind === 'note' || kind === 'sub' ? { label: 'Abrir documento', icon: <FileText size={14} />, onSelect: () => openDoc(n.id) } : null,
      { type: 'separator' },
      n.children.length && !isRoot
        ? {
            label: n.collapsed ? 'Expandir' : 'Recolher',
            icon: n.collapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />,
            hint: 'Espaço',
            onSelect: () => toggle(n.id)
          }
        : null,
      isRoot ? null : { label: 'Mover para cima', icon: <ArrowUp size={14} />, hint: 'Ctrl+↑', onSelect: () => applyChange(moveTopic(map, current.current.sections, n.id, -1)) },
      isRoot ? null : { label: 'Mover para baixo', icon: <ArrowDown size={14} />, hint: 'Ctrl+↓', onSelect: () => applyChange(moveTopic(map, current.current.sections, n.id, 1)) },
      moved?.[n.id] ? { label: 'Voltar ao lugar automático', icon: <LocateFixed size={14} />, onSelect: () => commit(resetMoved(map, layout, n.id)) } : null,
      { type: 'separator' },
      url ? { label: 'Abrir link', icon: <ExternalLink size={14} />, onSelect: () => openLink(url) } : null,
      kind ? { label: 'Abrir no espaço', icon: <FolderOpen size={14} />, onSelect: () => openRef(n) } : null,
      { label: 'Detalhes, cor e link…', icon: <StickyNote size={14} />, onSelect: () => { select(n.id); setTab('topic') } },
      isRoot ? null : { type: 'separator' },
      isRoot
        ? null
        : { label: kind ? 'Excluir (vai para a lixeira)' : 'Excluir', icon: <Trash2 size={14} />, hint: 'Delete', danger: true, onSelect: () => remove(n.id) }
    ]
    // Sem separadores sobrando no começo, no fim ou em dupla.
    const isSep = (x: MenuEntry): boolean => (x as { type?: string }).type === 'separator'
    return entries
      .filter((x): x is MenuEntry => x !== null)
      .filter((x, i, all) => !isSep(x) || (i > 0 && i < all.length - 1 && !isSep(all[i - 1])))
  }
  const onMenu = (e: ReactMouseEvent<HTMLElement>, n: MindNode): void => {
    setSelected(n.id)
    contextMenu.open(e, menuFor(n), `Opções de “${n.text}”`)
  }

  // Funções estáveis para os nós: assim o memo deles vale e só redesenha o nó que mudou.
  const latest = useRef({ toggle, check, openLink, openRef, select, finishEdit, onMenu })
  latest.current = { toggle, check, openLink, openRef, select, finishEdit, onMenu }
  const handlers = useMemo(
    () => ({
      onToggle: (id: string) => latest.current.toggle(id),
      onCheck: (id: string) => latest.current.check(id),
      onOpenLink: (url: string) => latest.current.openLink(url),
      onOpenRef: (n: MindNode) => latest.current.openRef(n),
      onShowNote: (id: string) => latest.current.select(id),
      onFinishEdit: (id: string, text: string | null, next?: 'child' | 'sibling') => latest.current.finishEdit(id, text, next),
      onMenu: (e: ReactMouseEvent<HTMLElement>, n: MindNode) => latest.current.onMenu(e, n)
    }),
    []
  )

  /* ----- Barra ----- */

  const theme = data.settings.theme
  const dark = theme === 'dark' || (theme === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches)

  const rebuild = (): void => {
    if (!stored) return
    commit(undefined)
    showToast('Mapa recriado a partir das seções e itens', { label: 'Desfazer', run: () => travel(true) })
  }

  const saveImage = async (): Promise<void> => {
    const el = canvas.current
    if (!el || !board) return
    // Sem os botões de zoom e a seleção na imagem.
    el.classList.add('capturing')
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const r = el.getBoundingClientRect()
    try {
      const safe = board.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'mapa'
      const ok = await window.api.saveImage({ x: r.left, y: r.top, width: r.width, height: r.height }, `opsinote-mapa-${safe}.png`)
      if (ok) showToast('Imagem do mapa salva')
    } catch (err) {
      showToast(`Não foi possível salvar a imagem: ${(err as Error).message}`)
    } finally {
      el.classList.remove('capturing')
    }
  }

  /* ----- Desenho ----- */

  if (!board || !map) {
    return (
      <main className="mm-view">
        <header className="mm-head">
          <h1>Mapa mental</h1>
        </header>
        <p className="mm-empty muted">Crie um espaço ou uma biblioteca para ver o mapa mental dele.</p>
      </main>
    )
  }

  const rootColor = board.color ?? 'var(--accent)'
  const lineWidth = map.lineWidth ?? 1.5
  const h = history.current
  const byId = new Map(items.map((i) => [i.node.id, i]))
  const selectedKind = selectedNode ? linkedKind(selectedNode) : null
  const showsDoc = !!selectedNode && !!selectedKind && selectedKind !== 'section' && tab === 'doc'

  return (
    <main className="mm-view">
      <header className="mm-head">
        <div className="mm-title">
          <h1>Mapa mental</h1>
          <select
            className="mm-board"
            aria-label="Espaço ou biblioteca"
            value={key}
            onChange={(e) => {
              const [type, id] = e.target.value.split(':') as [BoardType, string]
              setPicked({ type, id })
              select(null)
            }}
          >
            {data.workspaces.length > 0 && (
              <optgroup label="Espaços">
                {data.workspaces.map((b) => (
                  <option key={b.id} value={`workspace:${b.id}`}>
                    {b.title}
                  </option>
                ))}
              </optgroup>
            )}
            {data.libraries.length > 0 && (
              <optgroup label="Bibliotecas">
                {data.libraries.map((b) => (
                  <option key={b.id} value={`library:${b.id}`}>
                    {b.title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <label className="mm-search">
            <Search size={14} />
            <input
              type="search"
              placeholder="Buscar no mapa"
              aria-label="Buscar no mapa"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  findNext(e.shiftKey)
                } else if (e.key === 'Escape') {
                  setQuery('')
                  focusCanvas()
                }
              }}
            />
            {matches && (
              <span className="mm-search-count muted small">
                {matches.length ? `${selected && matches.includes(selected) ? matches.indexOf(selected) + 1 : 0}/${matches.length}` : 'nada'}
              </span>
            )}
          </label>
        </div>
        <div className="mm-toolbar">
          <div className="mm-group" role="group" aria-label="Arranjo">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={cx('chip small', layout === l.id && 'active')}
                aria-pressed={layout === l.id}
                onClick={() => {
                  commit(updateMap(map, { layout: l.id === 'map' ? undefined : l.id }))
                  fittedKey.current = ''
                }}
              >
                {l.icon} {l.label}
              </button>
            ))}
          </div>
          <label className="mm-lines">
            <span>Linhas</span>
            <select
              aria-label="Espessura das linhas"
              value={lineWidth}
              onChange={(e) => commit(updateMap(map, { lineWidth: Number(e.target.value) === 1.5 ? undefined : Number(e.target.value) }))}
            >
              {[1, 1.5, 2, 3, 4, 6].map((w) => (
                <option key={w} value={w}>
                  {w} px
                </option>
              ))}
            </select>
            <ColorPicker value={map.lineColor} onChange={(c) => commit(updateMap(map, { lineColor: c }))} />
          </label>
          <div className="mm-group">
            <button type="button" className="icon-btn" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!h.past.length} onClick={() => travel(true)}>
              <Undo2 size={15} />
            </button>
            <button type="button" className="icon-btn" title="Refazer (Ctrl+Y)" aria-label="Refazer" disabled={!h.future.length} onClick={() => travel(false)}>
              <Redo2 size={15} />
            </button>
            <button type="button" className="icon-btn" title="Expandir tudo" aria-label="Expandir tudo" onClick={() => commit(setAllCollapsed(map, false))}>
              <ChevronsUpDown size={15} />
            </button>
            <button type="button" className="icon-btn" title="Recolher tudo" aria-label="Recolher tudo" onClick={() => commit(setAllCollapsed(map, true))}>
              <ChevronsDownUp size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Reorganizar: todos os tópicos arrastados voltam ao lugar automático"
              aria-label="Reorganizar"
              disabled={!moved}
              onClick={() => commit(resetMoved(map, layout))}
            >
              <LocateFixed size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Recriar do espaço: tira os tópicos soltos, as cores e as posições"
              aria-label="Recriar do espaço"
              onClick={rebuild}
              disabled={!stored}
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title={dark ? 'Tema claro' : 'Tema escuro'}
              aria-label={dark ? 'Tema claro' : 'Tema escuro'}
              onClick={() => setTheme(dark ? 'light' : 'dark')}
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
          <button type="button" className="btn small" onClick={() => void saveImage()}>
            <ImageDown size={14} /> Salvar imagem
          </button>
        </div>
        <p className="mm-hint muted small">
          Duplo clique edita · <kbd>Tab</kbd> cria um filho (embaixo de uma seção, uma tarefa; embaixo de uma tarefa, um subitem, que aparece
          embaixo dela no espaço) · <kbd>Enter</kbd> cria um irmão · arraste um tópico para movê-lo, ou solte-o sobre outro para mudá-lo de ramo.
        </p>
      </header>

      <div className={cx('mm-body', selectedNode && 'with-side', showsDoc && 'with-doc', showsDoc && wide && 'wide')}>
        <div
          ref={canvas}
          className={cx('mm-canvas', `layout-${layout}`, matchSet && 'searching')}
          tabIndex={0}
          role="application"
          aria-label={`Mapa mental de ${board.title}`}
          onKeyDown={onKeyDown}
          // O ponteiro fica preso no canvas (para arrastar), então o duplo clique chega aqui, não no tópico.
          onDoubleClick={(e) => {
            const id = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.mm-node')?.dataset.id
            if (id && !(e.target as Element).closest('button, textarea, input')) setEditing(id)
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div ref={world} className="mm-world">
            <svg className="mm-edges" aria-hidden="true">
              {items.map((it) => {
                const parent = it.placed.parent ? byId.get(it.placed.parent) : undefined
                if (!parent) return null
                return (
                  <path
                    key={it.node.id}
                    d={edgePath(parent.placed.box, it.placed)}
                    style={{ stroke: map.lineColor ?? it.branch ?? 'var(--mm-line)', strokeWidth: lineWidth }}
                  />
                )
              })}
            </svg>
            {items.map((it) => (
              <MindNodeEl
                key={it.node.id}
                item={it}
                layout={layout}
                isRoot={it.node.id === map.root.id}
                rootColor={rootColor}
                selected={selected === it.node.id}
                editing={editing === it.node.id}
                linked={linkedKind(it.node)}
                checkable={boardType === 'workspace'}
                progress={progress.get(it.node.id)}
                match={matchSet ? matchSet.has(it.node.id) : undefined}
                register={register}
                {...handlers}
              />
            ))}
          </div>

          <div className="mm-zoom" role="group" aria-label="Zoom">
            <button type="button" className="icon-btn" title="Aproximar" aria-label="Aproximar" onClick={() => zoomAt(1.25)}>
              <Plus size={15} />
            </button>
            <span className="mm-zoom-pct">{zoomPct}%</span>
            <button type="button" className="icon-btn" title="Afastar" aria-label="Afastar" onClick={() => zoomAt(0.8)}>
              <Minus size={15} />
            </button>
            <button type="button" className="icon-btn" title="Enquadrar tudo" aria-label="Enquadrar tudo" onClick={fit}>
              <Maximize size={15} />
            </button>
          </div>
          {contextMenu.menu}
        </div>

        {selectedNode && (
          <NodePanel
            key={selectedNode.id}
            node={selectedNode}
            board={board}
            boardType={boardType}
            kind={selectedKind}
            isRoot={selectedNode.id === map.root.id}
            tab={showsDoc ? 'doc' : 'topic'}
            wide={wide}
            childLabel={childLabel(selectedNode)}
            onTab={setTab}
            onWide={() => {
              writePref(WIDE_KEY, wide ? '0' : '1')
              setWide(!wide)
            }}
            onPatch={(patch) => commit(updateNode(map, selectedNode.id, patch))}
            onRename={(text) => rename(selectedNode.id, text)}
            onCheck={() => check(selectedNode.id)}
            onContent={(content) => {
              const { section, list, entry } = linkedItem(board.sections, selectedNode)
              if (section && list && entry) updateEntry(boardType, board.id, section.id, list, entry.id, { content })
            }}
            onClose={() => {
              select(null)
              focusCanvas()
            }}
            onChild={(list) => create('child', selectedNode.id, map, list)}
            onSibling={() => create('sibling', selectedNode.id)}
            onRemove={() => remove(selectedNode.id)}
            onOpenRef={() => openRef(selectedNode)}
            onOpenLink={openLink}
            onBadUrl={() => showToast('Endereço inválido: use algo como https://github.com/usuario/projeto')}
          />
        )}
      </div>
    </main>
  )
}

/**
 * Painel ao lado. Para uma tarefa ou nota, duas abas: o documento do item (título, concluída e o
 * editor, iguais aos da árvore do espaço) e o tópico (link, nota do mapa e aparência).
 */
function NodePanel({
  node: n,
  board,
  boardType,
  kind,
  isRoot,
  tab,
  wide,
  childLabel,
  onTab,
  onWide,
  onPatch,
  onRename,
  onCheck,
  onContent,
  onClose,
  onChild,
  onSibling,
  onRemove,
  onOpenRef,
  onOpenLink,
  onBadUrl
}: {
  node: MindNode
  board: Board
  boardType: BoardType
  kind: Linked
  isRoot: boolean
  tab: 'doc' | 'topic'
  wide: boolean
  childLabel: string
  onTab: (tab: 'doc' | 'topic') => void
  onWide: () => void
  onPatch: (patch: Partial<Omit<MindNode, 'id' | 'children'>>) => void
  onRename: (text: string) => void
  onCheck: () => void
  onContent: (html: string) => void
  onClose: () => void
  onChild: (list?: ListType) => void
  onSibling: () => void
  onRemove: () => void
  onOpenRef: () => void
  onOpenLink: (url: string) => void
  onBadUrl: () => void
}): ReactNode {
  const { section, list, entry } = linkedItem(board.sections, n)
  const url = nodeUrl(n)
  const isItem = !!entry
  const heading = isRoot ? 'Tópico central' : kind === 'section' ? 'Seção' : kind === 'sub' ? 'Subitem' : kind === 'note' ? 'Nota' : isItem ? 'Tarefa' : 'Tópico'
  const parentTitle = entry?.parentId ? section?.[list!].find((e) => e.id === entry.parentId)?.title : undefined

  return (
    <aside className={cx('mm-side', tab === 'doc' && 'doc')} aria-label="Detalhes do tópico">
      <div className="mm-side-head">
        {isItem ? (
          <div className="mm-tabs" role="tablist" aria-label="Painel">
            <button type="button" role="tab" aria-selected={tab === 'doc'} className={cx('mm-tab', tab === 'doc' && 'active')} onClick={() => onTab('doc')}>
              <FileText size={13} /> Documento
            </button>
            <button type="button" role="tab" aria-selected={tab === 'topic'} className={cx('mm-tab', tab === 'topic' && 'active')} onClick={() => onTab('topic')}>
              <StickyNote size={13} /> Tópico
            </button>
          </div>
        ) : (
          <h2>{heading}</h2>
        )}
        <div className="mm-side-actions">
          {tab === 'doc' && (
            <button type="button" className="icon-btn" title={wide ? 'Painel estreito' : 'Painel largo'} aria-label={wide ? 'Painel estreito' : 'Painel largo'} onClick={onWide}>
              {wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
          <button type="button" className="icon-btn" title="Fechar (Esc)" aria-label="Fechar" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </div>

      {tab === 'doc' && entry && section ? (
        <div className="mm-doc">
          <div className="mm-doc-bar">
            <span className="mm-crumbs muted small">
              {section.title} › {parentTitle ? `Subitem de “${parentTitle}”` : list === 'notes' ? 'Notas' : 'Checklist'}
            </span>
            {boardType === 'workspace' && list === 'checklist' && !entry.parentId && (
              <button type="button" className={cx('done-toggle', entry.done && 'on')} onClick={onCheck}>
                <CircleCheck size={16} /> {entry.done ? 'Concluído' : 'Pendente'}
              </button>
            )}
            <button type="button" className="btn small ghost" title="Abrir na árvore do espaço" onClick={onOpenRef}>
              <FolderOpen size={14} /> Abrir no espaço
            </button>
          </div>
          <InlineEdit className="doc-title" value={entry.title} onChange={onRename} />
          <RichEditor
            content={entry.content}
            onChange={onContent}
            // Nas bibliotecas a ficha é só modelo: as {{variáveis}} ficam para preencher depois.
            snippetValues={boardType === 'workspace' ? sheetValues(board.sheet) : undefined}
            variables={boardType === 'workspace' ? sheetVariables(board.sheet) : sheetVariables(board.sheet).map((v) => ({ ...v, value: '' }))}
          />
        </div>
      ) : (
        <>
          <section>
            <label className="mm-field">
              <span>{isRoot ? 'Nome do espaço' : kind === 'section' ? 'Nome da seção' : 'Texto'}</span>
              <DraftField label="Texto do tópico" value={n.text} onCommit={(v) => v.trim() && onRename(v.trim())} />
            </label>
            {kind === 'section' && (
              <button type="button" className="btn small ghost mm-open-link" onClick={onOpenRef}>
                <FolderOpen size={14} /> Abrir no espaço
              </button>
            )}
          </section>

          <section>
            <label className="mm-field">
              <span>
                <Link size={13} /> Link
              </span>
              <DraftField
                label="Link do tópico"
                placeholder="https://…"
                value={n.url ?? ''}
                onCommit={(v) => {
                  if (!v.trim()) return onPatch({ url: undefined })
                  const u = normalizeUrl(v)
                  if (u) onPatch({ url: u })
                  else onBadUrl()
                }}
              />
            </label>
            {url && (
              <button type="button" className="btn small ghost mm-open-link" onClick={() => onOpenLink(url)}>
                <ExternalLink size={14} /> Abrir no navegador
              </button>
            )}
          </section>

          <section>
            <label className="mm-field">
              <span>
                <StickyNote size={13} /> Nota do mapa
              </span>
              <DraftField
                label="Nota do tópico"
                multiline
                placeholder="Explicações, comandos, detalhes… Aparece só aqui, sem poluir o mapa."
                value={n.note ?? ''}
                onCommit={(v) => onPatch({ note: v.trim() ? v : undefined })}
              />
            </label>
          </section>

          <section>
            <h3>Cor</h3>
            <div className="mm-swatches" role="group" aria-label="Cor do tópico">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cx('color-swatch', n.color === c && 'selected')}
                  style={{ background: c }}
                  aria-label={c}
                  aria-pressed={n.color === c}
                  onClick={() => onPatch({ color: c })}
                />
              ))}
              <button
                type="button"
                className={cx('color-swatch none', !n.color && 'selected')}
                title={isRoot ? 'Cor do espaço' : 'Sem cor'}
                aria-label="Sem cor"
                onClick={() => onPatch({ color: undefined, filled: undefined })}
              />
            </div>
            {!isRoot && (
              <label className="mm-check">
                <input type="checkbox" checked={!!n.filled} disabled={!n.color} onChange={(e) => onPatch({ filled: e.target.checked })} />
                Preencher o fundo (senão, só a borda)
              </label>
            )}
          </section>

          <section>
            <h3>Formato</h3>
            <div className="mm-shapes" role="group" aria-label="Formato do balão">
              {SHAPES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className={cx('chip small', n.shape === s.id && 'active')}
                  aria-pressed={n.shape === s.id}
                  onClick={() => onPatch({ shape: s.id })}
                >
                  <span className={cx('mm-shape-dot', s.id && `shape-${s.id}`)} /> {s.label}
                </button>
              ))}
            </div>
            <div className="mm-shapes">
              <button type="button" className={cx('chip small', n.bold && 'active')} aria-pressed={!!n.bold} onClick={() => onPatch({ bold: !n.bold })}>
                <Bold size={13} /> Negrito
              </button>
              <button type="button" className={cx('chip small', n.big && 'active')} aria-pressed={!!n.big} onClick={() => onPatch({ big: !n.big })}>
                <Type size={13} /> Texto grande
              </button>
            </div>
          </section>

          <section className="mm-row">
            <button type="button" className="btn small" onClick={() => onChild()}>
              <CornerDownRight size={14} /> {childLabel}
            </button>
            {kind === 'section' && (
              <button type="button" className="btn small" onClick={() => onChild('notes')}>
                <FileText size={14} /> Nova nota
              </button>
            )}
            {!isRoot && (
              <button type="button" className="btn small" onClick={onSibling}>
                <Plus size={14} /> Irmão
              </button>
            )}
            {!isRoot && (
              <button type="button" className="btn small ghost danger" onClick={onRemove}>
                <Trash2 size={14} /> Excluir
              </button>
            )}
          </section>
        </>
      )}
    </aside>
  )
}
