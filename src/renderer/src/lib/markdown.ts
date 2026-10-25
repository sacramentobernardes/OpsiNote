/**
 * Markdown → HTML do editor. Cobre o que as notas usam (títulos, listas, tarefas, código,
 * citações, tabelas, links, imagens, negrito, itálico, riscado) no estilo do GitHub.
 * Todo texto é escapado: nada do arquivo vira HTML ativo.
 */
import { escapeHtml } from './text'
import { isSafeHref, isSafeImageSrc } from './html'

export interface MarkdownToHtmlOptions {
  /** Sobe os títulos (h4 → h1 com 3): o contrário do headingOffset da exportação. */
  promote?: number
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/
const ATX_RE = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/
const HR_RE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/
const QUOTE_RE = /^ {0,3}>/
const LIST_RE = /^( {0,3})([-+*]|\d{1,9}[.)])(\s+|$)(.*)$/
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const SETEXT_RE = /^ {0,3}(=+|-+)\s*$/
const TASK_RE = /^\[( |x|X)\](?:\s+|$)/

const isTableStart = (lines: string[], i: number): boolean =>
  lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]) && lines[i + 1].includes('-') && (lines[i + 1].includes('|') || lines[i].trim().startsWith('|'))

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i]
  return FENCE_RE.test(line) || ATX_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line) || LIST_RE.test(line) || isTableStart(lines, i)
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
}

export function markdownToHtml(md: string, options: MarkdownToHtmlOptions = {}): string {
  return renderBlocks(md.replace(/\r\n?/g, '\n').split('\n'), options)
}

/** Citações e listas dentro de citações e listas: além disso, o resto vira texto (sem estourar a pilha). */
const MAX_NESTING = 64

function renderBlocks(lines: string[], o: MarkdownToHtmlOptions, depth = 0): string {
  if (depth > MAX_NESTING) {
    const text = lines.filter((l) => l.trim()).map((l) => inline(l.trim()))
    return text.length ? `<p>${text.join('<br>')}</p>` : ''
  }
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    const fence = FENCE_RE.exec(line)
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence[1][0] === '`' ? '`' : '~'}{${fence[1].length},}\\s*$`)
      const body: string[] = []
      i++
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++])
      i++
      const lang = /^[\w+#.-]+$/.test(fence[2]) ? ` class="language-${fence[2]}"` : ''
      out.push(`<pre><code${lang}>${escapeHtml(body.join('\n'))}</code></pre>`)
      continue
    }

    const atx = ATX_RE.exec(line)
    if (atx) {
      const level = Math.max(1, Math.min(6, atx[1].length - (o.promote ?? 0)))
      if (atx[2]) out.push(`<h${level}>${inline(atx[2])}</h${level}>`)
      i++
      continue
    }

    if (HR_RE.test(line)) {
      out.push('<hr>')
      i++
      continue
    }

    if (QUOTE_RE.test(line)) {
      const body: string[] = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) body.push(lines[i++].replace(/^ {0,3}> ?/, ''))
      out.push(`<blockquote>${renderBlocks(body, o, depth + 1) || '<p></p>'}</blockquote>`)
      continue
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(lines[i])
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]))
      const cell = (tag: string, text: string | undefined): string => `<${tag}><p>${inline(text ?? '')}</p></${tag}>`
      out.push(
        `<table><tbody><tr>${header.map((c) => cell('th', c)).join('')}</tr>${rows
          .map((r) => `<tr>${header.map((_, k) => cell('td', r[k])).join('')}</tr>`)
          .join('')}</tbody></table>`
      )
      continue
    }

    if (LIST_RE.test(line)) {
      const [html, next] = renderList(lines, i, o, depth)
      out.push(html)
      i = next
      continue
    }

    // Parágrafo. Cada quebra de linha vira <br>, como nos apps de notas (não um espaço, como no GitHub).
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines, i))) {
      if (para.length > 0 && SETEXT_RE.test(lines[i])) break
      para.push(lines[i++])
    }
    if (i < lines.length && para.length > 0 && SETEXT_RE.test(lines[i])) {
      const tag = lines[i].trim()[0] === '=' ? 'h1' : 'h2'
      out.push(`<${tag}>${inline(para.join(' ').trim())}</${tag}>`)
      i++
      continue
    }
    out.push(`<p>${para.map((l) => inline(l.trim().replace(/(?<!\\)\\$/, ''))).join('<br>')}</p>`)
  }
  return out.join('')
}

interface ListItem {
  lines: string[]
  checked?: boolean
}

/** Uma lista e seus itens (com sublistas pela indentação). Devolve o HTML e a linha seguinte. */
function renderList(lines: string[], start: number, o: MarkdownToHtmlOptions, depth: number): [string, number] {
  const first = LIST_RE.exec(lines[start])!
  const ordered = /\d/.test(first[2])
  const task = TASK_RE.test(first[4])
  const indent = first[1].length
  const items: ListItem[] = []
  let contentIndent = 0
  let i = start
  /**
   * Item irmão do mesmo tipo de lista. Lista comum e lista de tarefas ficam separadas
   * (o editor não mistura as duas), mesmo que o Markdown as juntasse numa só.
   */
  const sameList = (m: RegExpExecArray): boolean => /\d/.test(m[2]) === ordered && TASK_RE.test(m[4]) === task

  while (i < lines.length) {
    const line = lines[i]
    const m = LIST_RE.exec(line)
    if (m && m[1].length <= indent + 1 && !HR_RE.test(line)) {
      if (!sameList(m)) break // outro tipo de lista começa aqui
      contentIndent = m[1].length + m[2].length + Math.max(1, Math.min(m[3].length, 4))
      items.push({ lines: [m[4]] })
      i++
      continue
    }
    const current = items[items.length - 1]
    const lead = line.length - line.trimStart().length
    // Sublistas com 2 espaços também valem, mesmo depois de "1. " (que pediria 3).
    const needed = Math.min(contentIndent, indent + 2)
    if (!line.trim()) {
      let k = i + 1
      while (k < lines.length && !lines[k].trim()) k++
      const next = lines[k]
      if (next === undefined) break
      const nextLead = next.length - next.trimStart().length
      const sibling = LIST_RE.exec(next)
      if (nextLead >= needed && !(sibling && sibling[1].length <= indent + 1)) current.lines.push('')
      else if (!(sibling && sibling[1].length <= indent + 1 && sameList(sibling))) break
      i = k
      continue
    }
    if (lead >= needed) {
      current.lines.push(line.slice(Math.min(lead, contentIndent)))
      i++
      continue
    }
    // Continuação "preguiçosa" do parágrafo do item.
    const prev = current.lines[current.lines.length - 1]
    if (prev && prev.trim() && !startsBlock(lines, i)) {
      current.lines.push(line.trim())
      i++
      continue
    }
    break
  }

  for (const item of items) {
    const task = TASK_RE.exec(item.lines[0])
    if (task) {
      item.checked = task[1] !== ' '
      item.lines[0] = item.lines[0].slice(task[0].length)
    }
  }
  const isTaskList = items.every((it) => it.checked !== undefined)
  const body = (it: ListItem): string => renderBlocks(it.lines, o, depth + 1) || '<p></p>'

  if (isTaskList) {
    const lis = items.map((it) => `<li data-type="taskItem" data-checked="${it.checked}">${body(it)}</li>`).join('')
    return [`<ul data-type="taskList">${lis}</ul>`, i]
  }
  // Numa lista mista, a caixinha volta a ser texto.
  const lis = items
    .map((it) => {
      if (it.checked !== undefined) it.lines[0] = `\\[${it.checked ? 'x' : ' '}] ${it.lines[0]}`
      return `<li>${body(it)}</li>`
    })
    .join('')
  const startNum = ordered ? parseInt(first[2], 10) : 1
  return [ordered ? `<ol${startNum !== 1 ? ` start="${startNum}"` : ''}>${lis}</ol>` : `<ul>${lis}</ul>`, i]
}

/**
 * [texto](endereço) e ![alt](endereço). O texto não contém colchetes e o endereço aceita só um
 * nível de parênteses (como em links da Wikipédia): sem isso, uma linha com milhares de "[" ou
 * "[a](" faria a busca voltar atrás em cada posição e levar segundos.
 */
const LINK_RE = (prefix: string): RegExp =>
  new RegExp(`${prefix === '!' ? '!' : ''}\\[([^\\[\\]]*)\\]\\(\\s*<?((?:[^\\s()<>]|\\([^\\s()<>]*\\))+)>?(?:\\s+(?:"[^"]*"|'[^']*'))?\\s*\\)`, 'g')

/** Formatação dentro de uma linha. */
export function inline(text: string): string {
  const slots: string[] = []
  const hold = (html: string): string => `\u0000${slots.push(html) - 1}\u0000`
  let t = text.replace(/\u0000/g, '')

  t = t.replace(/(`+)(.+?)\1(?!`)/g, (_, _f: string, code: string) => hold(`<code>${escapeHtml(code.replace(/^ (.+) $/, '$1'))}</code>`))
  t = t.replace(/\\([!-/:-@[-`{-~])/g, (_, c: string) => hold(escapeHtml(c)))
  // Poucas tags de HTML são aceitas no meio do texto (as que o Markdown não tem como escrever).
  t = t.replace(/<(\/?)(u|mark|sub|sup|br)\s*\/?>/gi, (_, slash: string, tag: string) => hold(`<${slash}${tag.toLowerCase()}>`))
  t = t.replace(/<((?:https?:\/\/|mailto:)[^\s<>]+)>/gi, (_, url: string) => hold(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`))
  t = t.replace(LINK_RE('!'), (_, alt: string, src: string) =>
    isSafeImageSrc(src) ? hold(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`) : escapeHtml(alt)
  )
  t = t.replace(LINK_RE(''), (_, label: string, href: string) =>
    isSafeHref(href) ? `${hold(`<a href="${escapeHtml(href)}">`)}${label}${hold('</a>')}` : label
  )

  t = escapeHtml(t)
  t = t.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>')
  t = t.replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>')
  t = t.replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^_]*?\S)_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>')
  t = t.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>')
  // {{chave}} fora de código volta a ser a variável viva da ficha (como sai na exportação).
  t = t.replace(/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu, '<span data-var="$1">{{$1}}</span>')

  return t.replace(/\u0000(\d+)\u0000/g, (_, n: string) => slots[Number(n)])
}

/** Tira os escapes de Markdown de um título ("\[x\] item" → "[x] item"). */
export const unescapeMarkdown = (text: string): string => text.replace(/\\([!-/:-@[-`{-~])/g, '$1')
