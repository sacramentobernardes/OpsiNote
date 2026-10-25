/**
 * Formatos de exportação além do backup .json. Todos recebem o resultado de buildExport
 * (já filtrado e, se pedido, com os checklists zerados).
 *
 * Markdown, HTML e texto marcam a estrutura (espaço, seção, item) de um jeito que
 * lib/importFormats.ts sabe ler de volta. O HTML leva também os dados completos embutidos.
 */
import type { AppData, Board, BoardType, Entry, TargetSheet } from '../types'
import { SHEET_SPECS } from './sheets'
import { KIND_LABELS } from './util'
import { escapeHtml } from './text'
import { escapeInline, htmlToMarkdown, htmlToPlainText, sanitizeHtml } from './html'

export type ExportFormat = 'json' | 'html' | 'md' | 'csv' | 'txt'

export interface ExportFormatInfo {
  id: ExportFormat
  label: string
  ext: string
  description: string
  /** Volta para o OpsiNote sem perder nada. */
  lossless: boolean
}

export const EXPORT_FORMATS: ExportFormatInfo[] = [
  {
    id: 'json',
    label: 'Backup do OpsiNote',
    ext: 'json',
    description: 'Completo: fichas, cores, imagens e progresso. Volta igual ao importar.',
    lossless: true
  },
  {
    id: 'html',
    label: 'Página HTML',
    ext: 'html',
    description: 'Para ler no navegador ou imprimir em PDF. Também pode ser importada de volta sem perdas.',
    lossless: true
  },
  {
    id: 'md',
    label: 'Markdown',
    ext: 'md',
    description: 'Texto formatado para Obsidian, Notion, GitHub ou qualquer editor. Mantém a estrutura ao importar.',
    lossless: false
  },
  {
    id: 'csv',
    label: 'Planilha CSV',
    ext: 'csv',
    description: 'Uma linha por item, para Excel ou Google Planilhas. Sem imagens.',
    lossless: false
  },
  {
    id: 'txt',
    label: 'Texto simples',
    ext: 'txt',
    description: 'Sem formatação nem imagens. Bom para colar em qualquer lugar.',
    lossless: false
  }
]

export function renderExport(format: ExportFormat, data: AppData): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2)
    case 'html':
      return toHtml(data)
    case 'md':
      return toMarkdown(data)
    case 'csv':
      return toCsv(data)
    case 'txt':
      return toText(data)
  }
}

const boardsOf = (data: AppData): { type: BoardType; board: Board }[] => [
  ...data.workspaces.map((board) => ({ type: 'workspace' as const, board })),
  ...data.libraries.map((board) => ({ type: 'library' as const, board }))
]

const TYPE_LABEL: Record<BoardType, string> = { workspace: 'Espaço', library: 'Biblioteca' }

/** Linhas legíveis da ficha: variáveis, período e campos da categoria. */
function sheetRows(board: Board): { vars: [string, string][]; info: [string, string][] } {
  const sheet: TargetSheet | undefined = board.sheet
  if (!sheet) return { vars: [], info: [] }
  const spec = SHEET_SPECS[board.kind]
  const info: [string, string][] = []
  if (sheet.start) info.push([spec.startLabel, sheet.start])
  if (sheet.end) info.push([spec.endLabel, sheet.end])
  for (const f of spec.fields) if (sheet.fields[f.id]?.trim()) info.push([f.label, sheet.fields[f.id]])
  return { vars: sheet.vars.filter((v) => v.key.trim()).map((v) => [v.key, v.value]), info }
}

/* ----- Markdown ----- */

/** Títulos das notas descem 3 níveis: #, ## e ### são a estrutura (espaço, seção, item). */
export const MD_HEADING_OFFSET = 3

const mdTitle = (title: string): string => escapeInline(title).trim() || 'Sem título'
const mdContent = (html: string): string => htmlToMarkdown(html, { headingOffset: MD_HEADING_OFFSET })

function codeFence(text: string): string {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}\n${text}\n${fence}`
}

const marker = (type: string, attrs: Record<string, string | undefined> = {}): string => {
  const parts = Object.entries(attrs)
    .filter(([, v]) => v)
    .map(([k, v]) => ` ${k}=${v}`)
  return `<!-- opsinote:${type}${parts.join('')} -->`
}

/** Valor de várias linhas numa lista: as linhas seguintes ficam recuadas. */
const indentRest = (value: string): string => value.replace(/\r?\n/g, '\n  ')

function boardMarkdown(type: BoardType, b: Board): string {
  const out = [marker(type, { kind: b.kind, color: b.color }), `# ${mdTitle(b.title)}`]
  const { vars, info } = sheetRows(b)
  if (vars.length + info.length > 0) {
    out.push(marker('sheet'), `## ${SHEET_SPECS[b.kind].title}`)
    out.push([...vars.map(([k, v]) => `- \`${k}\`: ${indentRest(v)}`), ...info.map(([k, v]) => `- **${k}**: ${indentRest(v)}`)].join('\n'))
  }
  for (const s of b.sections) {
    out.push(`## ${mdTitle(s.title)}`)
    const entry = (e: Entry, box: string): string => {
      const body = mdContent(e.content)
      return `### ${box}${mdTitle(e.title)}${body ? `\n\n${body}` : ''}`
    }
    for (const e of s.checklist) out.push(entry(e, e.done ? '[x] ' : '[ ] '))
    for (const e of s.notes) out.push(entry(e, ''))
  }
  return out.join('\n\n')
}

export function toMarkdown(data: AppData): string {
  const out: string[] = []
  for (const { type, board } of boardsOf(data)) out.push(boardMarkdown(type, board))
  if (data.templates.length > 0) {
    out.push(
      [
        marker('templates'),
        '# Modelos de nota',
        ...data.templates.map((t) => {
          const body = mdContent(t.content)
          return `## ${mdTitle(t.title)}${body ? `\n\n${body}` : ''}`
        })
      ].join('\n\n')
    )
  }
  for (const g of data.snippetGroups) {
    out.push(
      [marker('snippets'), `# ${mdTitle(g.title)}`, ...g.items.map((i) => `## ${mdTitle(i.title)}\n\n${codeFence(i.content)}`)].join('\n\n')
    )
  }
  return `${out.join('\n\n')}\n`
}

/* ----- Texto simples ----- */

const indent = (text: string, pad: string): string =>
  text
    .split('\n')
    .map((l) => (l ? pad + l : ''))
    .join('\n')

export function toText(data: AppData): string {
  const out: string[] = []
  for (const { type, board } of boardsOf(data)) {
    out.push(`== ${board.title} (${TYPE_LABEL[type]} · ${KIND_LABELS[board.kind]}) ==`)
    const { vars, info } = sheetRows(board)
    if (vars.length + info.length > 0) {
      out.push(`${SHEET_SPECS[board.kind].title}\n${[...vars, ...info].map(([k, v]) => indent(`${k}: ${v}`, '  ')).join('\n')}`)
    }
    for (const s of board.sections) {
      out.push(`-- ${s.title} --`)
      const lines: string[] = []
      const entry = (head: string, e: Entry): void => {
        const body = htmlToPlainText(e.content)
        lines.push(body ? `${head}${e.title}\n${indent(body, '    ')}` : `${head}${e.title}`)
      }
      for (const e of s.checklist) entry(e.done ? '[x] ' : '[ ] ', e)
      for (const e of s.notes) entry('• ', e)
      if (lines.length) out.push(lines.join('\n'))
    }
  }
  if (data.templates.length > 0) {
    out.push('== Modelos de nota ==')
    out.push(data.templates.map((t) => `• ${t.title}\n${indent(htmlToPlainText(t.content), '    ')}`.trimEnd()).join('\n'))
  }
  for (const g of data.snippetGroups) {
    out.push(`== Snippets: ${g.title} ==`)
    if (g.items.length) out.push(g.items.map((i) => `• ${i.title}\n${indent(i.content, '    ')}`.trimEnd()).join('\n'))
  }
  return `${out.join('\n\n')}\n`
}

/* ----- CSV ----- */

/** Colunas que identificam uma planilha do OpsiNote ao importar. */
export const CSV_HEADER = ['Tipo', 'Nome', 'Categoria', 'Seção', 'Lista', 'Título', 'Concluído', 'Conteúdo']
/**
 * Número de cada espaço (1, 2…) e seção (1.1, 1.2…). Separa espaços e seções com o mesmo nome
 * ("Novo espaço", "Nova seção"). Opcional: numa planilha sem ela, a importação agrupa pelo nome.
 */
export const CSV_NUMBER = 'Nº'

/**
 * Célula entre aspas quando precisa. Um valor que começa com = + - @ ganha um apóstrofo na frente:
 * o Excel executaria como fórmula (um payload nas notas viraria um ataque a quem abre a planilha).
 * Um valor que já começava com apóstrofos ganha mais um, para a importação tirar só o que foi posto.
 */
function csvCell(value: string): string {
  const safe = /^'*[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[;"\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Separado por ";" e com BOM: é o que o Excel em português abre direto, com acentos certos. */
export function toCsv(data: AppData): string {
  const rows: string[][] = [[...CSV_HEADER, CSV_NUMBER]]
  const content = (html: string): string => htmlToMarkdown(html, { images: false })
  boardsOf(data).forEach(({ type, board }, b) => {
    const base = [TYPE_LABEL[type], board.title, KIND_LABELS[board.kind]]
    const n = String(b + 1)
    const before = rows.length
    for (const v of board.sheet?.vars ?? []) if (v.key.trim()) rows.push([...base, '', 'Variável', v.key, '', v.value, n])
    board.sections.forEach((s, i) => {
      const sn = `${n}.${i + 1}`
      if (s.checklist.length + s.notes.length === 0) rows.push([...base, s.title, '', '', '', '', sn])
      for (const e of s.checklist) rows.push([...base, s.title, 'Checklist', e.title, e.done ? 'Sim' : 'Não', content(e.content), sn])
      for (const e of s.notes) rows.push([...base, s.title, 'Nota', e.title, '', content(e.content), sn])
    })
    // Espaço vazio: uma linha só com o nome, para ele não sumir.
    if (rows.length === before) rows.push([...base, '', '', '', '', '', n])
  })
  for (const t of data.templates) rows.push(['Modelo', '', '', '', '', t.title, '', content(t.content), ''])
  data.snippetGroups.forEach((g, i) => {
    const n = String(i + 1)
    if (g.items.length === 0) rows.push(['Snippet', g.title, '', '', '', '', '', '', n])
    for (const item of g.items) rows.push(['Snippet', g.title, '', '', '', item.title, '', item.content, n])
  })
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`
}

/* ----- HTML ----- */

/** Onde os dados completos vão dentro da página, para a importação ler de volta. */
export const HTML_DATA_ID = 'opsinote-data'

/**
 * Marca cada imagem do app com o nome do arquivo. Ao exportar, o processo principal troca o
 * endereço pela imagem embutida; ao importar, o nome liga a imagem de volta aos dados.
 */
const tagAssets = (html: string): string =>
  html.replace(/<img src="opsinote-asset:\/\/files\/([a-f0-9]{64}\.[a-z]+)"/g, '<img data-asset="$1" src="opsinote-asset://files/$1"')

/**
 * Dados para a tag <script>: "<" escapado não fecha a tag, e o endereço das imagens fica
 * escrito de outro jeito (o JSON.parse lê igual) para não serem embutidas duas vezes.
 */
const embedJson = (data: AppData): string =>
  JSON.stringify(data).replace(/</g, '\\u003c').replace(/opsinote-asset:/g, 'opsinote\\u002dasset:')

const PAGE_CSS = `
:root{--bg:#f7f6f3;--surface:#fff;--border:#e4ded5;--text:#221e19;--muted:#6b6257;--accent:#b45309;--soft:#fef6e7;--code:#f5f2ec;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#15130f;--surface:#1c1915;--border:#353026;--text:#f1ece4;--muted:#b3a895;--accent:#f59e0b;--soft:#33240d;--code:#12100d;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:40px 16px 80px}
header.top{margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid var(--border)}
header.top h1{margin:0;font-size:26px}
header.top p{margin:4px 0 0;color:var(--muted)}
nav.toc{margin:0 0 32px;padding:14px 18px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}
nav.toc ul{margin:6px 0 0;padding-left:18px}
nav.toc a{color:inherit}
.board{margin:0 0 40px;padding:24px;border:1px solid var(--border);border-top:4px solid var(--board,var(--accent));border-radius:10px;background:var(--surface)}
.board>h2{margin:0;font-size:22px}
.meta{margin:2px 0 16px;color:var(--muted);font-size:13px}
.sheet{width:100%;margin:0 0 16px;border-collapse:collapse;font-size:14px}
.sheet th,.sheet td{padding:6px 10px;border:1px solid var(--border);text-align:left;vertical-align:top;white-space:pre-wrap}
.sheet th{width:30%;background:var(--soft);font-weight:600}
h3.section{margin:28px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border);font-size:17px}
.entry{margin:12px 0;padding:0 0 0 12px;border-left:3px solid var(--entry,transparent)}
.entry h4{margin:0;font-size:15px}
.entry h4 .box{display:inline-block;width:1.4em;color:var(--accent)}
.entry.done h4{color:var(--muted);text-decoration:line-through}
.content{color:var(--text)}
.content :first-child{margin-top:4px}
.content img{max-width:100%;border-radius:6px}
.content pre,pre.snippet{padding:10px 12px;overflow:auto;border-radius:8px;background:var(--code);font:13px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap}
.content code{padding:1px 4px;border-radius:4px;background:var(--code);font-family:ui-monospace,Consolas,monospace;font-size:.92em}
.content pre code{padding:0;background:none}
.content table{border-collapse:collapse}
.content td,.content th{padding:4px 8px;border:1px solid var(--border)}
.content blockquote{margin:8px 0;padding-left:12px;border-left:3px solid var(--border);color:var(--muted)}
.content ul[data-type=taskList]{padding-left:4px;list-style:none}
.content ul[data-type=taskList] li{display:flex;gap:6px}
.content ul[data-type=taskList] label{flex:none}
a{color:var(--accent)}
@media print{body{background:#fff}main{padding:0}.board{break-inside:auto;border-color:#ccc}nav.toc{display:none}}
`

const htmlContent = (html: string): string => tagAssets(sanitizeHtml(html))

/** Só cores no formato #rgb/#rrggbb: o valor vai para um style e não pode carregar outro CSS. */
const colorStyle = (name: string, color: string | undefined): string =>
  color && /^#[0-9a-f]{3,8}$/i.test(color) ? ` style="--${name}:${color}"` : ''

function entryHtml(e: Entry, checklist: boolean): string {
  const box = checklist ? `<span class="box">${e.done ? '☑' : '☐'}</span>` : ''
  const style = colorStyle('entry', e.color)
  const body = e.content.trim() ? `<div class="content">${htmlContent(e.content)}</div>` : ''
  return `<article class="entry${checklist && e.done ? ' done' : ''}"${style}><h4>${box}${escapeHtml(e.title)}</h4>${body}</article>`
}

function boardHtml(type: BoardType, b: Board, anchor: string): string {
  const { vars, info } = sheetRows(b)
  const rows = [...vars.map(([k, v]) => [`{{${k}}}`, v]), ...info]
  const sheet = rows.length
    ? `<table class="sheet"><caption hidden>${escapeHtml(SHEET_SPECS[b.kind].title)}</caption>${rows
        .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
        .join('')}</table>`
    : ''
  const sections = b.sections
    .map(
      (s) =>
        `<section><h3 class="section">${escapeHtml(s.title)}</h3>${s.checklist.map((e) => entryHtml(e, true)).join('')}${s.notes
          .map((e) => entryHtml(e, false))
          .join('')}</section>`
    )
    .join('')
  const style = colorStyle('board', b.color)
  const done = b.sections.reduce((n, s) => n + s.checklist.filter((e) => e.done).length, 0)
  const total = b.sections.reduce((n, s) => n + s.checklist.length, 0)
  const progress = type === 'workspace' && total > 0 ? ` · ${done} de ${total} concluídos` : ''
  return `<section class="board" id="${anchor}"${style}><h2>${escapeHtml(b.title)}</h2><p class="meta">${TYPE_LABEL[type]} · ${
    KIND_LABELS[b.kind]
  }${progress}</p>${sheet}${sections}</section>`
}

export function toHtml(data: AppData, now = new Date()): string {
  const boards = boardsOf(data)
  const toc: string[] = boards.map(({ board }, i) => `<li><a href="#b${i}">${escapeHtml(board.title)}</a></li>`)
  if (data.templates.length) toc.push('<li><a href="#modelos">Modelos de nota</a></li>')
  data.snippetGroups.forEach((g, i) => toc.push(`<li><a href="#g${i}">Snippets: ${escapeHtml(g.title)}</a></li>`))

  const templates = data.templates.length
    ? `<section class="board" id="modelos"><h2>Modelos de nota</h2>${data.templates
        .map((t) => `<article class="entry"><h4>${escapeHtml(t.title)}</h4><div class="content">${htmlContent(t.content)}</div></article>`)
        .join('')}</section>`
    : ''
  const snippets = data.snippetGroups
    .map(
      (g, i) =>
        `<section class="board" id="g${i}"><h2>${escapeHtml(g.title)}</h2><p class="meta">Snippets</p>${g.items
          .map((s) => `<article class="entry"><h4>${escapeHtml(s.title)}</h4><pre class="snippet">${escapeHtml(s.content)}</pre></article>`)
          .join('')}</section>`
    )
    .join('')

  const date = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="OpsiNote">
<title>OpsiNote · Exportação de ${escapeHtml(date)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
<header class="top"><h1>OpsiNote</h1><p>Exportado em ${escapeHtml(date)}</p></header>
${toc.length > 1 ? `<nav class="toc"><strong>Conteúdo</strong><ul>${toc.join('')}</ul></nav>` : ''}
${boards.map(({ type, board }, i) => boardHtml(type, board, `b${i}`)).join('\n')}
${templates}
${snippets}
</main>
<script type="application/json" id="${HTML_DATA_ID}">${embedJson(data)}</script>
</body>
</html>
`
}
