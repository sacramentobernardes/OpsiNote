/**
 * HTML sem DOM: um leitor pequeno, a limpeza do que vem de fora e a conversão das
 * notas para Markdown e texto. Sem DOM para funcionar nos testes (Node) como o resto de lib/.
 */
import { decodeEntities, escapeHtml, remoteImagesToLinks } from './text'

export interface HtmlText {
  type: 'text'
  text: string
}

export interface HtmlElement {
  type: 'element'
  tag: string
  attrs: Record<string, string>
  children: HtmlNode[]
}

export type HtmlNode = HtmlText | HtmlElement

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
/** Conteúdo lido como texto até a tag de fechamento (um "<" dentro não abre tag). */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title'])
/** Blocos que fecham um <p> aberto, como no navegador. */
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul'
])

/** Nenhuma nota real chega perto; um arquivo malicioso com milhares de níveis, sim. */
const MAX_DEPTH = 128

const TAG_RE =
  /<!--[\s\S]*?-->|<![^>]*>|<\?[\s\S]*?\?>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

const element = (tag: string, attrs: Record<string, string> = {}): HtmlElement => ({ type: 'element', tag, attrs, children: [] })

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const m of source.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase()
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

/** Lê HTML (inclusive malformado) numa árvore. Tags sem fechamento fecham sozinhas no fim. */
export function parseHtml(html: string): HtmlNode[] {
  const root = element('#root')
  const stack: HtmlElement[] = [root]
  const top = (): HtmlElement => stack[stack.length - 1]
  const addText = (text: string): void => {
    if (text) top().children.push({ type: 'text', text: decodeEntities(text) })
  }
  const closeTo = (tag: string): void => {
    for (let i = stack.length - 1; i > 0; i--) {
      if (stack[i].tag === tag) {
        stack.length = i
        return
      }
    }
  }
  /** Fecha um `tag` aberto, sem passar de um dos `scopes` (um <li> novo fecha o anterior da mesma lista). */
  const closeOpen = (tag: string, scopes: string[]): void => {
    for (let i = stack.length - 1; i > 0; i--) {
      if (stack[i].tag === tag) {
        stack.length = i
        return
      }
      if (scopes.includes(stack[i].tag)) return
    }
  }

  const re = new RegExp(TAG_RE.source, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    addText(html.slice(last, m.index))
    last = re.lastIndex
    const [, closing, opening, attrs, selfClosing] = m
    if (closing) {
      closeTo(closing.toLowerCase())
      continue
    }
    if (!opening) continue // comentário, doctype
    const tag = opening.toLowerCase()
    if (CLOSES_P.has(tag) && top().tag === 'p') stack.pop()
    if (tag === 'li') closeOpen('li', ['ul', 'ol'])
    if (tag === 'tr') closeOpen('tr', ['table', 'thead', 'tbody', 'tfoot'])
    if (tag === 'td' || tag === 'th') {
      closeOpen('td', ['tr'])
      closeOpen('th', ['tr'])
    }
    const node = element(tag, parseAttrs(attrs ?? ''))
    top().children.push(node)
    if (RAW_TEXT.has(tag)) {
      const end = html.toLowerCase().indexOf(`</${tag}`, last)
      const raw = html.slice(last, end < 0 ? html.length : end)
      if (raw) node.children.push({ type: 'text', text: tag === 'script' || tag === 'style' ? raw : decodeEntities(raw) })
      last = re.lastIndex = end < 0 ? html.length : html.indexOf('>', end) + 1 || html.length
      continue
    }
    // Além do limite, as tags seguintes ficam lado a lado em vez de uma dentro da outra:
    // o texto continua, e as funções que percorrem a árvore não estouram a pilha.
    if (!VOID.has(tag) && !selfClosing && stack.length <= MAX_DEPTH) stack.push(node)
  }
  addText(html.slice(last))
  return root.children
}

const escapeText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function serializeHtml(nodes: HtmlNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') return escapeText(n.text)
      const attrs = Object.entries(n.attrs)
        .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
        .join('')
      return VOID.has(n.tag) ? `<${n.tag}${attrs}>` : `<${n.tag}${attrs}>${serializeHtml(n.children)}</${n.tag}>`
    })
    .join('')
}

export function textContent(nodes: HtmlNode[]): string {
  return nodes.map((n) => (n.type === 'text' ? n.text : n.tag === 'br' ? '\n' : textContent(n.children))).join('')
}

/** Primeiro elemento com essa tag, em qualquer profundidade. */
export function findElement(nodes: HtmlNode[], tag: string): HtmlElement | undefined {
  for (const n of nodes) {
    if (n.type !== 'element') continue
    if (n.tag === tag) return n
    const inner = findElement(n.children, tag)
    if (inner) return inner
  }
  return undefined
}

/* ----- Limpeza ----- */

/** Somem com todo o conteúdo. */
const DROP = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'head', 'title', 'noscript', 'template', 'svg', 'math', 'link', 'meta',
  'base', 'frame', 'frameset', 'applet', 'textarea', 'select', 'button', 'canvas', 'audio', 'video', 'source', 'track',
  'map', 'area', 'dialog'
])

/** Ficam como estão (só com os atributos abaixo). As outras tags somem, mas o texto delas fica. */
const ALLOWED = new Set([
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'pre',
  'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'hr', 'span', 'div',
  'label', 'input', 'mark', 'sub', 'sup'
])

const ATTRS: Record<string, string[]> = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'title'],
  td: ['colspan', 'rowspan', 'colwidth'],
  th: ['colspan', 'rowspan', 'colwidth'],
  ul: ['data-type'],
  li: ['data-type', 'data-checked'],
  ol: ['start'],
  input: ['type', 'checked'],
  code: ['class'],
  // Variável da ficha dentro do texto (components/SheetVarNode.ts).
  span: ['data-var']
}

export const isSafeHref = (url: string): boolean => /^(https?:|mailto:|#)/i.test(url.trim())
/** Imagens embutidas, do próprio app ou da internet (essas viram link depois). Sem SVG, que pode ter script. */
export const isSafeImageSrc = (url: string): boolean =>
  /^(data:image\/(png|jpe?g|gif|webp|bmp|avif);base64,|opsinote-asset:\/\/files\/|https?:\/\/|\/\/)/i.test(url.trim())

function cleanAttrs(tag: string, attrs: Record<string, string>): Record<string, string> | null {
  const out: Record<string, string> = {}
  for (const name of ATTRS[tag] ?? []) if (name in attrs) out[name] = attrs[name]
  if (tag === 'a' && out.href !== undefined && !isSafeHref(out.href)) delete out.href
  if (tag === 'img' && !(out.src && isSafeImageSrc(out.src))) return null
  if (tag === 'input' && out.type !== 'checkbox') return null
  if (tag === 'code' && out.class !== undefined && !/^language-[\w+#.-]+$/.test(out.class)) delete out.class
  if (tag === 'span' && out['data-var'] !== undefined && !/^[\p{L}\p{N}_.-]+$/u.test(out['data-var'])) delete out['data-var']
  return out
}

function clean(nodes: HtmlNode[]): HtmlNode[] {
  return nodes.flatMap((n): HtmlNode[] => {
    if (n.type === 'text') return [n]
    if (DROP.has(n.tag)) return []
    if (!ALLOWED.has(n.tag)) return clean(n.children)
    const attrs = cleanAttrs(n.tag, n.attrs)
    return attrs ? [{ ...n, attrs, children: clean(n.children) }] : []
  })
}

/**
 * HTML de fora (página salva, arquivo importado) só com o que o editor entende: sem scripts,
 * estilos, eventos (onclick…) nem links javascript:. Imagens da internet viram link, como ao colar.
 */
export function sanitizeHtml(html: string): string {
  return remoteImagesToLinks(serializeHtml(clean(parseHtml(html))))
}

/* ----- HTML → Markdown / texto ----- */

export interface MarkdownOptions {
  /** Desce os títulos das notas (h1 → h4 com 3), para não se confundirem com a estrutura do arquivo. */
  headingOffset?: number
  /** false troca as imagens por "[imagem]" (planilhas, onde uma imagem embutida não cabe). */
  images?: boolean
  /** Texto simples: sem marcações de Markdown nem escapes. */
  plain?: boolean
}

const INLINE = new Set([
  'a', 'abbr', 'b', 'br', 'cite', 'code', 'del', 'em', 'font', 'i', 'img', 'input', 'kbd', 'label', 'mark', 's',
  'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'u', 'q'
])

const isWordChar = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}]/u.test(c)

/** Escapa o que o Markdown leria como formatação, sem poluir o texto comum (svc_backup continua igual). */
export function escapeInline(text: string): string {
  return text
    .replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\')
    .replace(/[*`[\]]/g, '\\$&')
    .replace(/~~/g, '\\~\\~')
    .replace(/<(?=[a-zA-Z/!])/g, '\\<')
    .replace(/_/g, (m, i: number, s: string) => (isWordChar(s[i - 1]) && isWordChar(s[i + 1]) ? m : '\\_'))
}

/** Um parágrafo que começa como um bloco de Markdown (# título, - lista, 1. lista, > citação). */
function escapeLineStart(text: string): string {
  if (/^\d+[.)](\s|$)/.test(text)) return text.replace(/^(\d+)([.)])/, '$1\\$2')
  if (/^(#{1,6}(\s|$)|[-+](\s|$)|>|```|~~~|=+\s*$)/.test(text)) return `\\${text}`
  return text
}

function wrap(inner: string, mark: string, o: MarkdownOptions): string {
  if (o.plain || !inner.trim()) return inner
  // Espaços nas pontas ficam de fora da marcação: "** x**" não é negrito.
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!
  return `${lead}${mark}${core}${mark.startsWith('<') ? mark.replace('<', '</') : mark}${trail}`
}

/** Parênteses e espaços quebrariam o (endereço) do link em Markdown. */
const URL_ESCAPES: Record<string, string> = { '(': '%28', ')': '%29' }

function inline(nodes: HtmlNode[], o: MarkdownOptions): string {
  return nodes.map((n) => inlineNode(n, o)).join('')
}

function inlineNode(n: HtmlNode, o: MarkdownOptions): string {
  if (n.type === 'text') {
    const text = n.text.replace(/\s+/g, ' ')
    return o.plain ? text : escapeInline(text)
  }
  switch (n.tag) {
    case 'strong':
    case 'b':
      return wrap(inline(n.children, o), '**', o)
    case 'em':
    case 'i':
      return wrap(inline(n.children, o), '*', o)
    case 's':
    case 'del':
    case 'strike':
      return wrap(inline(n.children, o), '~~', o)
    case 'u':
    case 'mark':
    case 'sub':
    case 'sup':
      return wrap(inline(n.children, o), `<${n.tag}>`, o)
    case 'code': {
      const code = textContent(n.children)
      if (o.plain) return code
      const fence = code.includes('`') ? '``' : '`'
      return fence.length > 1 ? `${fence} ${code} ${fence}` : `${fence}${code}${fence}`
    }
    case 'a': {
      const text = inline(n.children, o)
      const href = n.attrs.href
      if (!href) return text
      if (o.plain) return text.trim() === href ? href : `${text} (${href})`
      return text.trim() === href ? `<${href}>` : `[${text}](${href.replace(/[()\s]/g, (c) => URL_ESCAPES[c] ?? '%20')})`
    }
    case 'img': {
      const alt = n.attrs.alt ?? ''
      if (o.plain || o.images === false) return alt ? `[imagem: ${alt}]` : '[imagem]'
      return n.attrs.src ? `![${escapeInline(alt)}](${n.attrs.src})` : ''
    }
    case 'br':
      return o.plain ? '\n' : '\\\n'
    case 'input':
      return ''
    default:
      return inline(n.children, o)
  }
}

/** Blocos separados por linha em branco (ou por quebra simples, dentro de um item de lista). */
function blocks(nodes: HtmlNode[], o: MarkdownOptions, tight = false): string {
  const parts: string[] = []
  let pending: HtmlNode[] = []
  const flush = (): void => {
    const text = inline(pending, o).trim()
    if (text) parts.push(o.plain ? text : escapeLineStart(text))
    pending = []
  }
  for (const n of nodes) {
    if (n.type === 'text' || INLINE.has(n.tag)) {
      pending.push(n)
      continue
    }
    flush()
    const b = block(n, o)
    if (b) parts.push(b)
  }
  flush()
  return parts.join(tight ? '\n' : '\n\n')
}

function block(n: HtmlElement, o: MarkdownOptions): string {
  const heading = /^h([1-6])$/.exec(n.tag)
  if (heading) {
    const text = inline(n.children, o).trim()
    if (!text) return ''
    if (o.plain) return text
    const level = Number(heading[1]) + (o.headingOffset ?? 0)
    return level <= 6 ? `${'#'.repeat(level)} ${text}` : `**${text}**`
  }
  switch (n.tag) {
    case 'p': {
      const text = inline(n.children, o).trim()
      return o.plain ? text : escapeLineStart(text)
    }
    case 'ul':
    case 'ol':
      return list(n, o)
    case 'pre': {
      const code = textContent(n.children).replace(/\n$/, '')
      if (o.plain) return code
      const lang = (findElement(n.children, 'code')?.attrs.class ?? '').replace(/^language-/, '')
      const fence = code.includes('```') ? '````' : '```'
      return `${fence}${/^[\w+#.-]+$/.test(lang) ? lang : ''}\n${code}\n${fence}`
    }
    case 'blockquote':
      return blocks(n.children, o)
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n')
    case 'hr':
      return o.plain ? '----------' : '---'
    case 'table':
      return table(n, o)
    case 'script':
    case 'style':
    case 'head':
    case 'title':
      return ''
    default:
      return blocks(n.children, o)
  }
}

function list(n: HtmlElement, o: MarkdownOptions): string {
  const ordered = n.tag === 'ol'
  let index = Number(n.attrs.start) || 1
  const taskList = n.attrs['data-type'] === 'taskList'
  return n.children
    .filter((c): c is HtmlElement => c.type === 'element' && c.tag === 'li')
    .map((li) => {
      const isTask = taskList || li.attrs['data-type'] === 'taskItem'
      const marker = ordered ? `${index++}.` : '-'
      const box = isTask ? (li.attrs['data-checked'] === 'true' ? '[x] ' : '[ ] ') : ''
      const [first, ...rest] = blocks(li.children, o, true).split('\n')
      const pad = ' '.repeat(marker.length + 1)
      return `${marker} ${box}${first}${rest.map((l) => (l ? `\n${pad}${l}` : '\n')).join('')}`
    })
    .join('\n')
}

function rowsOf(nodes: HtmlNode[]): HtmlElement[] {
  return nodes.flatMap((n): HtmlElement[] => {
    if (n.type !== 'element') return []
    if (n.tag === 'tr') return [n]
    return ['thead', 'tbody', 'tfoot'].includes(n.tag) ? rowsOf(n.children) : []
  })
}

function table(n: HtmlElement, o: MarkdownOptions): string {
  const rows = rowsOf(n.children).map((tr) =>
    tr.children
      .filter((c): c is HtmlElement => c.type === 'element' && (c.tag === 'td' || c.tag === 'th'))
      .map((cell) => {
        const text = blocks(cell.children, o).replace(/\s*\n+\s*/g, ' ')
        return o.plain ? text : text.replace(/\|/g, '\\|')
      })
  )
  if (rows.length === 0) return ''
  const cols = Math.max(...rows.map((r) => r.length))
  const line = (cells: string[]): string => {
    const full = [...cells, ...Array(cols - cells.length).fill('')]
    return o.plain ? full.join(' | ') : `| ${full.join(' | ')} |`
  }
  if (o.plain) return rows.map(line).join('\n')
  return [line(rows[0]), line(Array(cols).fill('---')), ...rows.slice(1).map(line)].join('\n')
}

/** Markdown (estilo GitHub) a partir do HTML do editor. */
export function htmlToMarkdown(html: string, options: MarkdownOptions = {}): string {
  return blocks(parseHtml(html), options).replace(/\n{3,}/g, '\n\n').trim()
}

/** Texto puro mantendo parágrafos, listas e quebras de linha (diferente de htmlToText, que junta tudo). */
export function htmlToPlainText(html: string): string {
  return htmlToMarkdown(html, { plain: true })
}
