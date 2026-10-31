import type {
  AppData,
  Board,
  BoardType,
  Entry,
  Kind,
  ListType,
  MindLayout,
  MindMap,
  MindNode,
  MindShape,
  Section,
  SnippetGroup,
  TargetSheet,
  Template,
  Theme,
  TrashItem
} from '../types'
import { KINDS, newId, relinkParents } from './util'
import { purgeExpired } from './trash'
import { cleanOverrides } from './shortcuts'
import { cleanAppearance } from './appearance'

/** O que um arquivo importado acrescenta aos dados atuais. */
export interface ImportResult {
  workspaces: Board[]
  libraries: Board[]
  templates: Template[]
  snippetGroups: SnippetGroup[]
}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const color = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/**
 * Na importação todos os ids são novos (importar nunca sobrescreve nada). Ao carregar os
 * próprios dados, os ids são mantidos; só ganham um id novo os itens que não têm.
 */
type IdMode = 'fresh' | 'keep'

/** Ids já usados durante um normalizeData: um id repetido (arquivo editado à mão) ganha um novo. */
let seenIds: Set<string> | null = null

/** Id antigo → id dado, dentro do espaço sendo lido (para o mapa mental achar as seções e itens). */
let boardIds: Map<string, string> | null = null

function idOf(v: Json, mode: IdMode): string {
  let id: string
  if (mode === 'keep' && typeof v.id === 'string' && v.id && !seenIds?.has(v.id)) {
    seenIds?.add(v.id)
    id = v.id
  } else id = newId()
  if (typeof v.id === 'string' && v.id) boardIds?.set(v.id, id)
  return id
}

/** Mapas mentais muito fundos ou enormes (arquivo editado à mão) são cortados. */
const MIND_DEPTH = 64
const MIND_NODES = 20_000

function toMindMap(v: unknown, ids: Map<string, string>): MindMap | undefined {
  if (!isObject(v) || !isObject(v.root)) return undefined
  let budget = MIND_NODES
  const node = (x: Json, depth: number): MindNode => {
    budget--
    const ref = isObject(x.ref) ? x.ref : null
    const sectionId = ref && typeof ref.sectionId === 'string' ? ids.get(ref.sectionId) : undefined
    const entryId = ref && typeof ref.entryId === 'string' ? ids.get(ref.entryId) : undefined
    const list = ref && LISTS.includes(ref.list as ListType) ? (ref.list as ListType) : undefined
    const linked = sectionId && (!ref?.entryId || (entryId && list))
    const c = color(x.color)
    return {
      // Ids dos nós só precisam ser únicos dentro do mapa: ficam como estão.
      id: str(x.id) || newId(),
      text: str(x.text),
      children:
        depth < MIND_DEPTH
          ? arr(x.children)
              .filter(isObject)
              .filter(() => budget > 0)
              .map((ch) => node(ch, depth + 1))
          : [],
      ...(x.collapsed === true ? { collapsed: true } : {}),
      ...(typeof x.note === 'string' && x.note ? { note: x.note } : {}),
      ...(typeof x.url === 'string' && x.url ? { url: x.url } : {}),
      ...(c ? { color: c } : {}),
      ...(x.filled === true ? { filled: true } : {}),
      ...(MIND_SHAPES.includes(x.shape as MindShape) ? { shape: x.shape as MindShape } : {}),
      ...(x.bold === true ? { bold: true } : {}),
      ...(x.big === true ? { big: true } : {}),
      ...(linked ? { ref: { sectionId, ...(entryId ? { entryId, list } : {}) } } : {})
    }
  }
  const root = node(v.root, 0)
  // Ids repetidos quebrariam a seleção: os repetidos ganham um novo.
  const seen = new Set<string>()
  const fix = (n: MindNode): void => {
    if (seen.has(n.id)) n.id = newId()
    seen.add(n.id)
    n.children.forEach(fix)
  }
  fix(root)
  const width = num(v.lineWidth, 0)
  const lineColor = color(v.lineColor)
  // Posições arrastadas: só números de verdade e de nós que existem.
  const moved: NonNullable<MindMap['moved']> = {}
  if (isObject(v.moved)) {
    for (const l of MIND_LAYOUTS) {
      const byId = v.moved[l]
      if (!isObject(byId)) continue
      const out: Record<string, [number, number]> = {}
      for (const [id, xy] of Object.entries(byId)) {
        if (seen.has(id) && Array.isArray(xy) && xy.length === 2 && xy.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e6))
          out[id] = [xy[0], xy[1]]
      }
      if (Object.keys(out).length) moved[l] = out
    }
  }
  return {
    root,
    ...(Object.keys(moved).length ? { moved } : {}),
    ...(MIND_LAYOUTS.includes(v.layout as MindLayout) ? { layout: v.layout as MindLayout } : {}),
    ...(width >= 1 && width <= 6 ? { lineWidth: width } : {}),
    ...(lineColor ? { lineColor } : {})
  }
}

function toEntry(v: unknown, withDone: boolean, mode: IdMode = 'fresh'): Entry | null {
  if (!isObject(v)) return null
  const c = color(v.color)
  return {
    id: idOf(v, mode),
    title: str(v.title, 'Sem título'),
    content: str(v.content),
    ...(c ? { color: c } : {}),
    ...(withDone ? { done: v.done === true } : {}),
    ...(v.pinned === true ? { pinned: true } : {}),
    // Ainda com o id do arquivo; toBoard troca pelo id dado ao pai (ou tira).
    ...(typeof v.parentId === 'string' && v.parentId ? { parentId: v.parentId } : {})
  }
}

const entries = (v: unknown, withDone: boolean, mode: IdMode = 'fresh'): Entry[] =>
  arr(v)
    .map((e) => toEntry(e, withDone, mode))
    .filter((e): e is Entry => e !== null)

function toSection(v: unknown, mode: IdMode = 'fresh'): Section | null {
  if (!isObject(v)) return null
  return {
    id: idOf(v, mode),
    title: str(v.title, 'Seção'),
    checklist: entries(v.checklist, true, mode),
    notes: entries(v.notes, false, mode),
    ...(v.collapsed === true ? { collapsed: true } : {})
  }
}

/** Campos de texto da ficha. Fichas antigas guardavam escopo e contatos fora de "fields". */
function sheetFields(v: Json): Record<string, string> {
  const fields: Record<string, string> = {}
  if (isObject(v.fields)) {
    for (const [k, x] of Object.entries(v.fields)) if (typeof x === 'string') fields[k] = x
  }
  for (const k of ['scope', 'contacts']) {
    if (typeof v[k] === 'string' && v[k] && !(k in fields)) fields[k] = v[k] as string
  }
  return fields
}

function toSheet(v: unknown, mode: IdMode = 'fresh'): TargetSheet | undefined {
  if (!isObject(v)) return undefined
  const date = (d: unknown): string | undefined => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined)
  const start = date(v.start)
  const end = date(v.end)
  return {
    vars: arr(v.vars)
      .filter(isObject)
      .map((x) => ({ id: idOf(x, mode), key: str(x.key), value: str(x.value) })),
    fields: sheetFields(v),
    ...(start ? { start } : {}),
    ...(end ? { end } : {})
  }
}

function toBoard(v: unknown, defaultKind: Kind, mode: IdMode = 'fresh'): Board | null {
  if (!isObject(v)) return null
  // Formato novo usa "sections"; o formato do Swiftness usa "folders".
  const ids = new Map<string, string>()
  boardIds = ids
  let sections: Section[]
  try {
    sections = arr(v.sections ?? v.folders)
      .map((s) => toSection(s, mode))
      .filter((s): s is Section => s !== null)
  } finally {
    boardIds = null
  }
  for (const s of sections) relinkParents(s, ids)
  const mindmap = toMindMap(v.mindmap, ids)
  const kind = KINDS.includes(v.kind as Kind) ? (v.kind as Kind) : defaultKind
  const now = Date.now()
  const sheet = toSheet(v.sheet, mode)
  const c = color(v.color)
  return {
    id: idOf(v, mode),
    title: str(v.title, 'Sem título'),
    kind,
    ...(c ? { color: c } : {}),
    sections,
    ...(sheet ? { sheet } : {}),
    ...(mindmap ? { mindmap } : {}),
    ...(v.pinned === true ? { pinned: true } : {}),
    // Importado conta como novo; carregado mantém as datas.
    createdAt: mode === 'keep' ? num(v.createdAt, now) : now,
    updatedAt: mode === 'keep' ? num(v.updatedAt, now) : now
  }
}

function toTemplate(v: unknown, mode: IdMode = 'fresh'): Template | null {
  if (!isObject(v)) return null
  return { id: idOf(v, mode), title: str(v.title, 'Modelo'), content: str(v.content) }
}

function toSnippetGroup(v: unknown, mode: IdMode = 'fresh'): SnippetGroup | null {
  if (!isObject(v)) return null
  // Swiftness chamava de "payloads", com os itens em "data".
  return {
    id: idOf(v, mode),
    title: str(v.title, 'Snippets'),
    // Snippets não têm subitens.
    items: entries(v.items ?? v.data, false, mode).map(({ parentId: _parent, ...e }) => e),
    ...(v.collapsed === true ? { collapsed: true } : {})
  }
}

const collect = <T>(v: unknown, fn: (x: unknown) => T | null): T[] =>
  arr(v)
    .map(fn)
    .filter((x): x is T => x !== null)

/**
 * Lê um backup do OpsiNote (ou do antigo MyMap) ou uma exportação do Swiftness. Todos os ids são
 * regenerados, então importar nunca sobrescreve o que já existe.
 */
export function parseImport(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  if (!isObject(parsed)) throw new Error('Formato de arquivo não reconhecido.')

  const isLegacy = !('version' in parsed) && ('targets' in parsed || 'payloads' in parsed || 'libraries' in parsed)
  const result: ImportResult = {
    workspaces: collect(isLegacy ? parsed.targets : parsed.workspaces, (v) => toBoard(v, isLegacy ? 'pentest' : 'other')),
    libraries: collect(parsed.libraries, (v) => toBoard(v, isLegacy ? 'pentest' : 'other')),
    templates: collect(parsed.templates, (v) => toTemplate(v)),
    snippetGroups: collect(isLegacy ? parsed.payloads : parsed.snippetGroups, (v) => toSnippetGroup(v))
  }

  const total = result.workspaces.length + result.libraries.length + result.templates.length + result.snippetGroups.length
  if (total === 0) throw new Error('Nenhum dado reconhecido no arquivo.')
  return result
}

const BOARD_TYPES: BoardType[] = ['workspace', 'library']
const LISTS: ListType[] = ['checklist', 'notes']
const THEMES: Theme[] = ['system', 'light', 'dark']
const MIND_LAYOUTS: MindLayout[] = ['map', 'right', 'down', 'radial']
const MIND_SHAPES: MindShape[] = ['pill', 'rect', 'plain']

/** Item da lixeira: só entra se tiver o que restaurar; o resto é completado. */
function toTrashItem(v: unknown): TrashItem | null {
  if (!isObject(v)) return null
  const base = { id: idOf(v, 'keep'), deletedAt: num(v.deletedAt, Date.now()), index: num(v.index, 0) }
  const boardType = BOARD_TYPES.includes(v.boardType as BoardType) ? (v.boardType as BoardType) : 'workspace'
  const origin = {
    boardType,
    boardId: str(v.boardId),
    boardTitle: str(v.boardTitle, 'Sem título'),
    ...(KINDS.includes(v.boardKind as Kind) ? { boardKind: v.boardKind as Kind } : {}),
    ...(color(v.boardColor) ? { boardColor: color(v.boardColor) } : {})
  }
  switch (v.kind) {
    case 'board': {
      const board = toBoard(v.board, 'other', 'keep')
      return board ? { ...base, kind: 'board', boardType, board } : null
    }
    case 'section': {
      const section = toSection(v.section, 'keep')
      return section ? { ...base, ...origin, kind: 'section', section } : null
    }
    case 'entry': {
      const list = LISTS.includes(v.list as ListType) ? (v.list as ListType) : 'notes'
      const entry = toEntry(v.entry, list === 'checklist', 'keep')
      return entry ? { ...base, ...origin, kind: 'entry', sectionId: str(v.sectionId), sectionTitle: str(v.sectionTitle, 'Seção'), list, entry } : null
    }
    case 'template': {
      const template = toTemplate(v.template, 'keep')
      return template ? { ...base, kind: 'template', template } : null
    }
    case 'snippetGroup': {
      const group = toSnippetGroup(v.group, 'keep')
      return group ? { ...base, kind: 'snippetGroup', group } : null
    }
    case 'snippet': {
      const snippet = toEntry(v.snippet, false, 'keep')
      return snippet ? { ...base, kind: 'snippet', groupId: str(v.groupId), groupTitle: str(v.groupTitle, 'Snippets'), snippet } : null
    }
    default:
      return null
  }
}

/**
 * Confere os dados carregados do disco e completa o que faltar (ids, títulos, listas),
 * para um campo ausente nunca derrubar a interface. Os ids existentes são mantidos.
 */
export function normalizeData(raw: unknown): AppData | null {
  if (!isObject(raw) || raw.version !== 1) return null
  const settings = isObject(raw.settings) ? raw.settings : {}
  const shortcuts = cleanOverrides(settings.shortcuts)
  const appearance = cleanAppearance(settings.appearance)
  seenIds = new Set()
  let normalized: AppData
  try {
    normalized = {
      version: 1,
      workspaces: collect(raw.workspaces, (v) => toBoard(v, 'other', 'keep')),
      libraries: collect(raw.libraries, (v) => toBoard(v, 'other', 'keep')),
      templates: collect(raw.templates, (v) => toTemplate(v, 'keep')),
      snippetGroups: collect(raw.snippetGroups, (v) => toSnippetGroup(v, 'keep')),
      trash: collect(raw.trash, toTrashItem),
      settings: {
        theme: THEMES.includes(settings.theme as Theme) ? (settings.theme as Theme) : 'system',
        ...(Object.keys(shortcuts).length > 0 ? { shortcuts } : {}),
        ...(Object.keys(appearance).length > 0 ? { appearance } : {})
      }
    }
  } finally {
    seenIds = null
  }
  // Itens com mais de 30 dias na lixeira saem de vez ao abrir o app.
  purgeExpired(normalized)
  return normalized
}
