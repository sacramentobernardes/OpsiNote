/**
 * Importação de arquivos além do backup .json: HTML, Markdown, CSV e texto.
 * Lê de volta o que lib/exportFormats.ts gera e também arquivos de outros apps
 * (notas do Obsidian, páginas salvas, planilhas), com tudo virando itens novos.
 */
import type { Board, Entry, Kind, Section, SnippetGroup, TargetSheet, Template } from '../types'
import { parseImport, type ImportResult } from './importData'
import { CSV_HEADER, CSV_NUMBER, HTML_DATA_ID, MD_HEADING_OFFSET } from './exportFormats'
import { findElement, parseHtml, sanitizeHtml, serializeHtml, textContent } from './html'
import { markdownToHtml, unescapeMarkdown } from './markdown'
import { SHEET_SPECS } from './sheets'
import { escapeHtml, fold, remoteImagesToLinks } from './text'
import { KINDS, KIND_LABELS, newId } from './util'

export const importTotal = (r: ImportResult): number => r.workspaces.length + r.libraries.length + r.templates.length + r.snippetGroups.length

const extensionOf = (name: string): string => /\.([^./\\]+)$/.exec(name)?.[1].toLowerCase() ?? ''
const titleOf = (name: string): string => name.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '').trim() || 'Importado'

/** Lê um arquivo pelo tipo (extensão). Importar nunca sobrescreve: tudo ganha ids novos. */
export function parseImportFile(name: string, text: string): ImportResult {
  text = text.replace(/^﻿/, '')
  const title = titleOf(name)
  const ext = extensionOf(name)
  let result: ImportResult
  switch (ext) {
    case 'json':
      return parseImport(text)
    case 'html':
    case 'htm':
      result = parseHtmlFile(text, title)
      break
    case 'md':
    case 'markdown':
      result = parseMarkdownFile(text, title)
      break
    case 'csv':
    case 'tsv':
      result = parseCsvFile(text, title)
      break
    case 'txt':
      result = parseTextFile(text, title)
      break
    default:
      // Sem extensão conhecida: um JSON ainda é reconhecido pelo conteúdo.
      if (text.trimStart().startsWith('{')) return parseImport(text)
      throw new Error(`Formato não suportado${ext ? ` (.${ext})` : ''}. Use .json, .html, .md, .csv ou .txt.`)
  }
  if (importTotal(result) === 0) throw new Error('Nenhum dado reconhecido no arquivo.')
  return result
}

/* ----- Peças ----- */

const emptyResult = (): ImportResult => ({ workspaces: [], libraries: [], templates: [], snippetGroups: [] })

function newBoard(title: string, kind: Kind = 'other', color?: string): Board {
  const now = Date.now()
  return { id: newId(), title: title || 'Sem título', kind, ...(color ? { color } : {}), sections: [], createdAt: now, updatedAt: now }
}

const newSection = (title: string): Section => ({ id: newId(), title: title || 'Seção', checklist: [], notes: [] })

const newEntry = (title: string, content: string, done?: boolean): Entry => ({
  id: newId(),
  title: title || 'Sem título',
  content,
  ...(done === undefined ? {} : { done })
})

const isColor = (v: string | undefined): v is string => !!v && /^#[0-9a-f]{3,8}$/i.test(v)
const isDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Categoria pelo id ("pentest") ou pelo nome mostrado ("Pentest", "Estudo"). */
function kindFrom(value: string | undefined): Kind {
  if (!value) return 'other'
  if (KINDS.includes(value as Kind)) return value as Kind
  const v = fold(value.trim())
  return KINDS.find((k) => fold(KIND_LABELS[k]) === v) ?? 'other'
}

/** Texto puro → parágrafos (linha em branco separa; quebra simples vira <br>). */
function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p>${p.split('\n').map((l) => escapeHtml(l.trimEnd())).join('<br>')}</p>`)
    .join('')
}

/** Rótulo da ficha ("Escopo", "Início"…) → onde o valor vai. */
function applySheetValue(sheet: TargetSheet, kind: Kind, label: string, value: string): boolean {
  const spec = SHEET_SPECS[kind]
  const l = fold(label.trim())
  if (l === fold(spec.startLabel) && isDate(value.trim())) sheet.start = value.trim()
  else if (l === fold(spec.endLabel) && isDate(value.trim())) sheet.end = value.trim()
  else {
    // Campos de outras categorias também são aceitos: ficam guardados, como ao trocar de categoria.
    const field = [spec, ...Object.values(SHEET_SPECS)].flatMap((s) => s.fields).find((f) => fold(f.label) === l)
    if (!field) return false
    sheet.fields[field.id] = value
  }
  return true
}

const hasSheet = (s: TargetSheet): boolean => s.vars.length > 0 || Object.keys(s.fields).length > 0 || !!s.start || !!s.end

/* ----- Markdown ----- */

interface MdMarker {
  type: string
  attrs: Record<string, string>
}

interface MdNode {
  level: number
  title: string
  marker?: MdMarker
  lines: string[]
  children: MdNode[]
}

const MARKER_RE = /^\s*<!--\s*opsinote:(\w+)((?:\s+[\w-]+=[^\s>]+)*)\s*-->\s*$/
const HEADING_RE = /^ {0,3}(#{1,3})\s+(.*?)(?:\s+#+)?\s*$/
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/
const TASK_TITLE_RE = /^\[( |x|X)\]\s+(.*)$/
const TASK_LINE_RE = /^[-*+]\s+\[( |x|X)\]\s+(.*)$/

/** Títulos # ## ### viram a árvore; o resto (inclusive #### em diante) é conteúdo do título acima. */
function markdownTree(text: string): MdNode {
  const root: MdNode = { level: 0, title: '', lines: [], children: [] }
  const stack = [root]
  let fence: string | null = null
  let pending: MdMarker | undefined
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const top = stack[stack.length - 1]
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`).test(line)) fence = null
      top.lines.push(line)
      continue
    }
    const open = FENCE_OPEN_RE.exec(line)
    if (open) {
      fence = open[1]
      top.lines.push(line)
      continue
    }
    const mk = MARKER_RE.exec(line)
    if (mk) {
      const attrs: Record<string, string> = {}
      for (const [, k, v] of mk[2].matchAll(/([\w-]+)=([^\s>]+)/g)) attrs[k] = v
      pending = { type: mk[1], attrs }
      continue
    }
    const h = HEADING_RE.exec(line)
    if (h) {
      const level = h[1].length
      while (stack[stack.length - 1].level >= level) stack.pop()
      const node: MdNode = { level, title: h[2], marker: pending, lines: [], children: [] }
      pending = undefined
      stack[stack.length - 1].children.push(node)
      stack.push(node)
      continue
    }
    top.lines.push(line)
  }
  return root
}

/** Todo o texto de um título para baixo, com os subtítulos de volta no lugar. */
const allLines = (n: MdNode): string[] => [...n.lines, ...n.children.flatMap((c) => [`${'#'.repeat(c.level)} ${c.title}`, ...allLines(c)])]

const cleanTitle = (title: string): string => unescapeMarkdown(title).trim() || 'Sem título'
const hasText = (lines: string[]): boolean => lines.some((l) => l.trim())

/** Primeiro bloco de código (o conteúdo de um snippet), ou o texto todo. */
function codeOf(lines: string[]): string {
  const start = lines.findIndex((l) => FENCE_OPEN_RE.test(l))
  if (start < 0) return lines.join('\n').trim()
  const fence = FENCE_OPEN_RE.exec(lines[start])![1]
  const close = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`)
  const end = lines.findIndex((l, i) => i > start && close.test(l))
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n')
}

function parseMarkdownSheet(lines: string[], kind: Kind): TargetSheet {
  const sheet: TargetSheet = { vars: [], fields: {} }
  const items: { key?: string; label?: string; value: string }[] = []
  for (const line of lines) {
    const v = /^[-*]\s+`([^`]+)`:\s?(.*)$/.exec(line)
    const f = /^[-*]\s+\*\*(.+?)\*\*:\s?(.*)$/.exec(line)
    if (v) items.push({ key: v[1], value: v[2] })
    else if (f) items.push({ label: f[1], value: f[2] })
    else if (/^ {2}/.test(line) && items.length) items[items.length - 1].value += `\n${line.slice(2)}`
  }
  for (const it of items) {
    if (it.key) sheet.vars.push({ id: newId(), key: it.key, value: it.value })
    else if (it.label) applySheetValue(sheet, kind, it.label, it.value)
  }
  return sheet
}

export function parseMarkdownFile(text: string, fileTitle: string): ImportResult {
  const result = emptyResult()
  // Arquivo gerado pelo OpsiNote: os títulos das notas foram descidos 3 níveis e voltam ao lugar.
  const ours = /<!--\s*opsinote:/.test(text)
  const promote = ours ? MD_HEADING_OFFSET : 0
  const html = (lines: string[]): string => remoteImagesToLinks(markdownToHtml(lines.join('\n'), { promote }))

  const root = markdownTree(text)
  const h1s = root.children.filter((c) => c.level === 1)
  const loose = root.children.filter((c) => c.level > 1)
  // O que vem antes do primeiro # (ou um arquivo sem #) vira um espaço com o nome do arquivo.
  if (hasText(root.lines) || loose.length > 0) h1s.unshift({ level: 1, title: fileTitle, lines: root.lines, children: loose })

  for (const node of h1s) {
    if (node.marker?.type === 'templates') {
      for (const c of node.children) result.templates.push({ id: newId(), title: cleanTitle(c.title), content: html(allLines(c)) })
      continue
    }
    if (node.marker?.type === 'snippets') {
      result.snippetGroups.push({
        id: newId(),
        title: cleanTitle(node.title),
        items: node.children.map((c) => newEntry(cleanTitle(c.title), codeOf(allLines(c))))
      })
      continue
    }

    const kind = kindFrom(node.marker?.attrs.kind)
    const color = node.marker?.attrs.color
    const board = newBoard(cleanTitle(node.title), kind, isColor(color) ? color : undefined)
    let general: Section | null = null
    const generalSection = (): Section => {
      if (!general) {
        general = newSection('Geral')
        board.sections.unshift(general)
      }
      return general
    }

    /** Texto solto: as tarefas "- [ ] x" viram itens do checklist e o resto, uma nota. */
    const addLoose = (lines: string[], noteTitle: string, target: () => Section): void => {
      const rest: string[] = []
      const tasks: Entry[] = []
      for (const line of lines) {
        const t = TASK_LINE_RE.exec(line)
        if (t) tasks.push(newEntry(cleanTitle(t[2]), '', t[1] !== ' '))
        else rest.push(line)
      }
      if (tasks.length === 0 && !hasText(rest)) return
      const section = target()
      section.checklist.push(...tasks)
      if (hasText(rest)) section.notes.push(newEntry(noteTitle, html(rest)))
    }

    const addEntry = (section: Section, n: MdNode): void => {
      const task = TASK_TITLE_RE.exec(n.title)
      const content = html(allLines(n))
      if (task) section.checklist.push(newEntry(cleanTitle(task[2]), content, task[1] !== ' '))
      else section.notes.push(newEntry(cleanTitle(n.title), content))
    }

    addLoose(node.lines, board.title, generalSection)
    for (const child of node.children) {
      if (child.level === 3) {
        addEntry(generalSection(), child)
        continue
      }
      if (child.marker?.type === 'sheet') {
        const sheet = parseMarkdownSheet(allLines(child), kind)
        if (hasSheet(sheet)) board.sheet = sheet
        continue
      }
      const section = newSection(cleanTitle(child.title))
      board.sections.push(section)
      addLoose(child.lines, section.title, () => section)
      for (const g of child.children) addEntry(section, g)
    }

    if (node.marker?.type === 'library') result.libraries.push(board)
    else result.workspaces.push(board)
  }
  return result
}

/* ----- HTML ----- */

export function parseHtmlFile(text: string, fileTitle: string): ImportResult {
  // Página exportada pelo OpsiNote: os dados completos estão embutidos.
  const embedded = new RegExp(`<script[^>]*\\bid=["']${HTML_DATA_ID}["'][^>]*>([\\s\\S]*?)</script>`, 'i').exec(text)
  if (embedded) {
    // As imagens estão na página, marcadas com o nome do arquivo; os dados guardam só o endereço.
    const images = new Map<string, string>()
    for (const m of text.matchAll(/<img data-asset="([a-f0-9]{64}\.[a-z]+)" src="(data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+)"/g)) {
      images.set(m[1], m[2])
    }
    const json = embedded[1].replace(
      /opsinote\\u002dasset:\/\/files\/([a-f0-9]{64}\.[a-z]+)/g,
      (_, name: string) => images.get(name) ?? `opsinote-asset://files/${name}`
    )
    return parseImport(json)
  }

  // Outra página: vira uma nota, com o título da página.
  const nodes = parseHtml(text)
  const title = textContent(findElement(nodes, 'title')?.children ?? []).trim() || textContent(findElement(nodes, 'h1')?.children ?? []).trim() || fileTitle
  const body = findElement(nodes, 'body')
  const content = sanitizeHtml(serializeHtml(body ? body.children : nodes)).trim()
  const result = emptyResult()
  if (!content) return result
  const board = newBoard(title)
  const section = newSection('Notas')
  section.notes.push(newEntry(title, content))
  board.sections.push(section)
  result.workspaces.push(board)
  return result
}

/* ----- CSV ----- */

/** Lê CSV (aspas, quebras de linha dentro de células). O separador ; , ou tab é detectado pela 1ª linha. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '')
  const delimiter = [';', ',', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ';')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // Tira o apóstrofo que a exportação põe na frente de = + - @ (proteção contra fórmulas).
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => r.map((c) => (/^'+[=+\-@\t\r]/.test(c) ? c.slice(1) : c)))
}

const YES = /^(sim|s|x|yes|y|true|1|feito|feita|ok|conclu[ií]d[oa]|done|completed?|checked)$/i

export function parseCsvFile(text: string, fileTitle: string): ImportResult {
  const rows = parseCsv(text)
  const result = emptyResult()
  if (rows.length === 0) return result
  const header = rows[0].map((h) => fold(h.trim()))
  const ours = CSV_HEADER.every((h) => header.includes(fold(h)))
  return ours ? oursFromCsv(rows, header, result) : genericFromCsv(rows, fileTitle, result)
}

function oursFromCsv(rows: string[][], header: string[], result: ImportResult): ImportResult {
  const col = (row: string[], name: string): string => row[header.indexOf(fold(name))] ?? ''
  const boards = new Map<string, { board: Board; sections: Map<string, Section> }>()
  const groups = new Map<string, SnippetGroup>()
  const md = (text: string): string => remoteImagesToLinks(markdownToHtml(text))

  for (const row of rows.slice(1)) {
    const type = fold(col(row, 'Tipo').trim())
    const name = col(row, 'Nome').trim()
    const title = col(row, 'Título').trim()
    const content = col(row, 'Conteúdo')
    // Com a coluna Nº (exportada pelo app), espaços e seções de mesmo nome continuam separados.
    const number = col(row, CSV_NUMBER).trim()
    if (type === 'espaco' || type === 'biblioteca') {
      const key = number ? `${type}#${number.split('.')[0]}` : `${type}\u0000${name}`
      let b = boards.get(key)
      if (!b) {
        b = { board: newBoard(name, kindFrom(col(row, 'Categoria'))), sections: new Map() }
        boards.set(key, b)
        ;(type === 'biblioteca' ? result.libraries : result.workspaces).push(b.board)
      }
      const list = fold(col(row, 'Lista').trim())
      if (list === 'variavel') {
        b.board.sheet ??= { vars: [], fields: {} }
        if (title) b.board.sheet.vars.push({ id: newId(), key: title, value: content })
        continue
      }
      const sectionTitle = col(row, 'Seção').trim() || (list ? 'Geral' : '')
      if (!sectionTitle) continue
      const sectionKey = number.includes('.') ? number : sectionTitle
      let section = b.sections.get(sectionKey)
      if (!section) {
        section = newSection(sectionTitle)
        b.sections.set(sectionKey, section)
        b.board.sections.push(section)
      }
      if (list === 'checklist') section.checklist.push(newEntry(title, md(content), YES.test(col(row, 'Concluído').trim())))
      else if (list === 'nota') section.notes.push(newEntry(title, md(content)))
    } else if (type === 'modelo') {
      result.templates.push({ id: newId(), title: title || 'Modelo', content: md(content) } satisfies Template)
    } else if (type === 'snippet') {
      const key = number || name
      let g = groups.get(key)
      if (!g) {
        g = { id: newId(), title: name || 'Snippets', items: [] }
        groups.set(key, g)
        result.snippetGroups.push(g)
      }
      if (title || content) g.items.push(newEntry(title, content))
    }
  }
  return result
}

/** Planilha de outro lugar: cada linha vira um item do checklist, com as outras colunas no conteúdo. */
function genericFromCsv(rows: string[][], fileTitle: string, result: ImportResult): ImportResult {
  const header = rows[0].map((h) => h.trim())
  const folded = header.map(fold)
  const titleCol = Math.max(0, folded.findIndex((h) => /^(titulo|title|nome|name|tarefa|task|item|assunto|summary|descricao)$/.test(h)))
  const doneCol = folded.findIndex((h) => /conclu|^done$|^status$|feito|completed|checked/.test(h))
  const board = newBoard(fileTitle)
  const section = newSection('Importado')
  board.sections.push(section)
  for (const row of rows.slice(1)) {
    const title = (row[titleCol] ?? '').trim() || row.find((c) => c.trim())?.trim() || 'Sem título'
    const details = header
      .map((h, i) => (i === titleCol || i === doneCol || !row[i]?.trim() ? '' : `<p><strong>${escapeHtml(h || `Coluna ${i + 1}`)}</strong>: ${escapeHtml(row[i].trim())}</p>`))
      .join('')
    section.checklist.push(newEntry(title, details, doneCol >= 0 && YES.test((row[doneCol] ?? '').trim())))
  }
  if (section.checklist.length > 0) result.workspaces.push(board)
  return result
}

/* ----- Texto ----- */

const BOARD_HEADER_RE = /^(.*) \((Espaço|Biblioteca) · (.+)\)$/

export function parseTextFile(text: string, fileTitle: string): ImportResult {
  const result = emptyResult()
  type Mode = { type: 'board'; board: Board } | { type: 'templates' } | { type: 'snippets'; group: SnippetGroup }
  let mode: Mode | null = null
  let section: Section | null = null
  let sheetOpen = false
  let lastSheetLabel: string | null = null
  /** Item em andamento e as linhas recuadas do conteúdo dele. */
  let current: { lines: string[]; finish: (lines: string[]) => void } | null = null
  /** Texto solto de cada seção: vira uma nota no fim. */
  const loose = new Map<Section, string[]>()

  const finish = (): void => {
    current?.finish(current.lines)
    current = null
  }
  const ensureBoard = (): Board => {
    if (mode?.type === 'board') return mode.board
    const board = newBoard(fileTitle)
    result.workspaces.push(board)
    mode = { type: 'board', board }
    section = null
    return board
  }
  const ensureSection = (): Section => {
    const board = ensureBoard()
    if (!section) {
      section = newSection('Notas')
      board.sections.push(section)
    }
    return section
  }

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    const header = /^== (.+) ==$/.exec(line)
    if (header) {
      finish()
      sheetOpen = false
      section = null
      const t = header[1]
      const b = BOARD_HEADER_RE.exec(t)
      if (t === 'Modelos de nota') mode = { type: 'templates' }
      else if (t.startsWith('Snippets: ')) {
        const group: SnippetGroup = { id: newId(), title: t.slice(10), items: [] }
        result.snippetGroups.push(group)
        mode = { type: 'snippets', group }
      } else {
        const board = newBoard(b ? b[1] : t, kindFrom(b?.[3]))
        ;(b?.[2] === 'Biblioteca' ? result.libraries : result.workspaces).push(board)
        mode = { type: 'board', board }
      }
      continue
    }
    const sectionHead = /^-- (.+) --$/.exec(line)
    if (sectionHead && mode?.type !== 'templates' && mode?.type !== 'snippets') {
      finish()
      sheetOpen = false
      const board = ensureBoard()
      section = newSection(sectionHead[1])
      board.sections.push(section)
      continue
    }
    if (mode?.type === 'board' && !section && !current && line === SHEET_SPECS[mode.board.kind].title) {
      sheetOpen = true
      mode.board.sheet ??= { vars: [], fields: {} }
      continue
    }
    if (sheetOpen && mode?.type === 'board' && /^ {2}\S/.test(line)) {
      const board: Board = mode.board
      const sheet = board.sheet!
      const kv = /^ {2}([^:]+):\s?(.*)$/.exec(line)
      if (kv && applySheetValue(sheet, board.kind, kv[1], kv[2])) lastSheetLabel = kv[1]
      else if (kv) {
        sheet.vars.push({ id: newId(), key: kv[1].trim(), value: kv[2] })
        lastSheetLabel = null
      } else if (lastSheetLabel) applySheetValue(sheet, board.kind, lastSheetLabel, `${sheetValue(sheet, board.kind, lastSheetLabel)}\n${line.trim()}`)
      continue
    }
    sheetOpen = false

    const task = /^(?:[-*]\s+)?\[( |x|X)\]\s+(.*)$/.exec(line)
    const bullet = /^•\s+(.*)$/.exec(line)
    if (task || bullet) {
      finish()
      const title = (task ? task[2] : bullet![1]).trim()
      const m = mode as Mode | null
      if (m?.type === 'templates') {
        current = { lines: [], finish: (ls) => result.templates.push({ id: newId(), title, content: textToHtml(ls.join('\n')) }) }
      } else if (m?.type === 'snippets') {
        const group = m.group
        current = { lines: [], finish: (ls) => group.items.push(newEntry(title, ls.join('\n').replace(/^\n+|\s+$/g, ''))) }
      } else {
        const s = ensureSection()
        const done = task ? task[1] !== ' ' : undefined
        current = {
          lines: [],
          finish: (ls) => (done === undefined ? s.notes : s.checklist).push(newEntry(title, textToHtml(ls.join('\n')), done))
        }
      }
      continue
    }
    if (current && (/^( {4}|\t)/.test(raw) || !line)) {
      current.lines.push(raw.replace(/^( {4}|\t)/, ''))
      continue
    }
    finish()
    if (!line && !section) continue
    const s = ensureSection()
    const lines = loose.get(s)
    if (lines) lines.push(line)
    else loose.set(s, [line])
  }
  finish()

  for (const [s, lines] of loose) {
    if (hasText(lines)) s.notes.unshift(newEntry(s.title === 'Notas' ? fileTitle : s.title, textToHtml(lines.join('\n'))))
  }
  for (const b of [...result.workspaces, ...result.libraries]) if (b.sheet && !hasSheet(b.sheet)) delete b.sheet
  return result
}

/** Valor atual de um campo da ficha pelo rótulo (para juntar linhas de continuação). */
function sheetValue(sheet: TargetSheet, kind: Kind, label: string): string {
  const spec = SHEET_SPECS[kind]
  const l = fold(label.trim())
  if (l === fold(spec.startLabel)) return sheet.start ?? ''
  if (l === fold(spec.endLabel)) return sheet.end ?? ''
  const field = [spec, ...Object.values(SHEET_SPECS)].flatMap((s) => s.fields).find((f) => fold(f.label) === l)
  return field ? (sheet.fields[field.id] ?? '') : ''
}
