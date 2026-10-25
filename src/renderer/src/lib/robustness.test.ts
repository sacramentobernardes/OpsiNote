/**
 * Testes de robustez dos formatos: entradas aleatórias (com semente fixa, reproduzíveis),
 * ataques conhecidos de XSS, entradas patológicas (tempo) e idas e voltas com dados gerados.
 */
import { describe, expect, it } from 'vitest'
import type { AppData, Board, Entry, Kind, Section } from '../types'
import { htmlToMarkdown, htmlToPlainText, parseHtml, sanitizeHtml, serializeHtml } from './html'
import { markdownToHtml } from './markdown'
import { toCsv, toHtml, toMarkdown, toText } from './exportFormats'
import { parseCsv, parseImportFile } from './importFormats'
import { normalizeData } from './importData'
import { KINDS } from './util'
import { timeLimit } from './testing'

/** Gerador pseudoaleatório simples (mulberry32): mesma semente, mesmos casos. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PIECES = [
  '<', '>', '/', '"', "'", '=', '&', ';', '#', '*', '_', '`', '[', ']', '(', ')', '!', '|', '-', '+', '~', '\\', '\n', ' ', '\t',
  '<p>', '</p>', '<b>', '</b>', '<ul>', '<li>', '</li>', '</ul>', '<script>', '</script>', '<img src=x>', '<a href="',
  '<!--', '-->', '&amp;', '&#x41;', '&#9999999999;', '# ', '## ', '### ', '- [ ] ', '- [x] ', '1. ', '> ', '```', '~~~',
  '| a | b |', '|---|---|', '**', '__', '~~', 'texto', 'ção', '日本', '🙂', '<u>', '</u>', '<br>', 'javascript:', 'onerror=',
  '<!-- opsinote:workspace kind=pentest -->', '<!-- opsinote:sheet -->', '<!-- opsinote:snippets -->', '== X ==', '-- S --',
  '• ', '[ ] ', '    ', '"', '""', 'Tipo;Nome;Categoria;Seção;Lista;Título;Concluído;Conteúdo', "'=", '\r\n', '\u0000', '\uFEFF'
]

function randomText(next: () => number, maxParts = 60): string {
  const n = Math.floor(next() * maxParts)
  let s = ''
  for (let i = 0; i < n; i++) s += PIECES[Math.floor(next() * PIECES.length)]
  return s
}

const CASES = 400

describe('entradas aleatórias', () => {
  it('nenhuma função de HTML/Markdown quebra', () => {
    const next = rng(1)
    for (let i = 0; i < CASES; i++) {
      const input = randomText(next)
      expect(() => {
        serializeHtml(parseHtml(input))
        sanitizeHtml(input)
        htmlToMarkdown(input)
        htmlToMarkdown(input, { headingOffset: 3, images: false })
        htmlToPlainText(input)
        markdownToHtml(input)
        markdownToHtml(input, { promote: 3 })
        parseCsv(input)
      }, `entrada #${i}: ${JSON.stringify(input)}`).not.toThrow()
    }
  })

  it('importar qualquer arquivo dá certo ou explica o erro (nunca um erro interno)', () => {
    const next = rng(2)
    const known = /Nenhum dado reconhecido|não é um JSON válido|Formato de arquivo não reconhecido/
    for (const ext of ['md', 'html', 'csv', 'txt', 'json']) {
      for (let i = 0; i < CASES / 4; i++) {
        const input = randomText(next)
        try {
          const r = parseImportFile(`a.${ext}`, input)
          for (const b of [...r.workspaces, ...r.libraries]) {
            expect(b.title).toBeTruthy()
            expect(KINDS).toContain(b.kind)
            for (const s of b.sections) expect(s.title).toBeTruthy()
          }
        } catch (err) {
          expect((err as Error).message, `.${ext} #${i}: ${JSON.stringify(input)}`).toMatch(known)
        }
      }
    }
  })

  it('a limpeza é idempotente: limpar de novo não muda nada', () => {
    const next = rng(3)
    for (let i = 0; i < CASES; i++) {
      const once = sanitizeHtml(randomText(next))
      expect(sanitizeHtml(once), JSON.stringify(once)).toBe(once)
    }
  })

  it('o HTML gerado do Markdown já está limpo', () => {
    const next = rng(4)
    for (let i = 0; i < CASES; i++) {
      const html = markdownToHtml(randomText(next))
      // Só conta o que está dentro de uma tag de verdade; "javascript:" escapado é texto.
      const dangerous = /<(script|iframe|object|embed|style)\b|<[a-z][^>]*\son\w+\s*=|(href|src)="\s*javascript:/i
      expect(html, JSON.stringify(html)).not.toMatch(dangerous)
    }
  })
})

describe('ataques de XSS conhecidos', () => {
  const VECTORS = [
    '<script>alert(1)</script>',
    '<SCRIPT SRC=//e.com/x.js></SCRIPT>',
    '<img src=x onerror=alert(1)>',
    '<img src="javascript:alert(1)">',
    '<IMG SRC=JaVaScRiPt:alert(1)>',
    '<svg onload=alert(1)>',
    '<svg><script>alert(1)</script></svg>',
    '<body onload=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href=" javascript:alert(1)">x</a>',
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<div style="background:url(javascript:alert(1))">x</div>',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<p title="</p><script>alert(1)</script>">x</p>',
    '<object data="javascript:alert(1)"></object>',
    '<embed src="javascript:alert(1)">',
    '<form action="javascript:alert(1)"><button>x</button></form>',
    '<input onfocus=alert(1) autofocus>',
    '<details open ontoggle=alert(1)>',
    '<video><source onerror=alert(1)></video>',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    '<base href="javascript:/">',
    '<link rel=stylesheet href=//e.com/x.css>',
    '<style>@import "//e.com/x.css"</style>',
    '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
    '<!--<img src=x onerror=alert(1)>-->',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<textarea><img src=x onerror=alert(1)></textarea>',
    '<title><img src=x onerror=alert(1)></title>',
    '<a href="https://ok.com" onclick="alert(1)">x</a>',
    '<code class="x onmouseover=alert(1)">x</code>'
  ]
  const unsafe = (html: string): boolean => {
    // Lê o resultado como o navegador e procura qualquer coisa que execute código.
    const walk = (nodes: ReturnType<typeof parseHtml>): boolean =>
      nodes.some((n) => {
        if (n.type !== 'element') return false
        if (['script', 'iframe', 'object', 'embed', 'svg', 'math', 'style', 'link', 'meta', 'base', 'form', 'textarea', 'title'].includes(n.tag)) return true
        for (const [k, v] of Object.entries(n.attrs)) {
          if (k.startsWith('on') || k === 'style') return true
          if ((k === 'href' || k === 'src' || k === 'action') && !/^(https?:|mailto:|#|data:image\/(png|jpe?g|gif|webp|bmp|avif);|opsinote-asset:)/i.test(v.trim())) return true
        }
        return walk(n.children)
      })
    return walk(parseHtml(html))
  }

  it.each(VECTORS)('sanitizeHtml neutraliza %s', (vector) => {
    expect(unsafe(sanitizeHtml(vector)), sanitizeHtml(vector)).toBe(false)
  })

  it.each(VECTORS)('Markdown com %s não vira HTML ativo', (vector) => {
    const html = markdownToHtml(`texto ${vector}\n\n${vector}\n\n- ${vector}\n\n[x](${vector})`)
    expect(unsafe(html), html).toBe(false)
  })

  it.each(VECTORS)('página HTML importada com %s fica limpa', (vector) => {
    const r = parseImportFile('p.html', `<html><body><p>a</p>${vector}</body></html>`)
    const content = r.workspaces[0]?.sections[0].notes[0].content ?? ''
    expect(unsafe(content), content).toBe(false)
  })

  it('links e imagens perigosos em Markdown são descartados', () => {
    for (const url of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'vbscript:x', 'data:text/html,x', 'file:///C:/Windows/win.ini']) {
      expect(markdownToHtml(`[x](${url}) ![y](${url})`)).not.toMatch(/href|src/)
    }
  })
})

describe('desempenho com entradas patológicas', () => {
  /** Cada caso tem que terminar rápido: uma regex com backtracking exponencial travaria o app. */
  const CASES_SLOW: [string, string][] = [
    ['tag sem fechar com muitos atributos', `<a ${'b '.repeat(20000)}`],
    ['muitos "<"', '<'.repeat(50000)],
    ['atributos sem aspas', `<a ${'x=y '.repeat(20000)}`],
    ['muitos asteriscos', '*'.repeat(50000)],
    ['asteriscos alternados', '*a'.repeat(20000)],
    ['muitos sublinhados', '_a_'.repeat(20000)],
    ['colchetes sem fechar', '['.repeat(50000)],
    ['links quase completos', '[a]('.repeat(20000)],
    ['crases', '`'.repeat(50000)],
    ['crases alternadas', '`a'.repeat(20000)],
    ['til', '~'.repeat(50000)],
    ['listas aninhadas fundas', Array.from({ length: 2000 }, (_, i) => `${' '.repeat(i % 40)}- item`).join('\n')],
    ['tabela grande', `| a | b |\n|---|---|\n${'| 1 | 2 |\n'.repeat(20000)}`],
    ['citações aninhadas', `${'>'.repeat(5000)} x`],
    ['comentário sem fechar', `<!--${'x'.repeat(100000)}`],
    ['HTML aninhado fundo', '<div>'.repeat(5000) + 'x' + '</div>'.repeat(5000)],
    ['entidades', '&#x41;'.repeat(50000)],
    ['CSV com aspas sem fechar', `"${'a;'.repeat(50000)}`]
  ]

  it.each(CASES_SLOW)('%s', (_name, input) => {
    const start = performance.now()
    sanitizeHtml(input)
    htmlToMarkdown(input)
    markdownToHtml(input)
    parseCsv(input)
    try {
      parseImportFile('x.md', input)
      parseImportFile('x.txt', input)
    } catch {
      // Só o tempo importa aqui.
    }
    expect(performance.now() - start).toBeLessThan(timeLimit(3000))
  })

  it('exporta e importa 5.000 itens em tempo razoável', () => {
    const data = randomData(rng(9), 5, 10, 100)
    const start = performance.now()
    for (const [ext, render] of [['md', toMarkdown], ['html', toHtml], ['csv', toCsv], ['txt', toText]] as const) {
      const r = parseImportFile(`x.${ext}`, render(data))
      expect(r.workspaces.reduce((n, b) => n + b.sections.reduce((m, s) => m + s.checklist.length + s.notes.length, 0), 0)).toBe(5000)
    }
    expect(performance.now() - start).toBeLessThan(timeLimit(15000))
  })
})

/* ----- Dados gerados ----- */

const TITLE_PIECES = ['Recon', 'ção', 'svc_backup', '[x] falso', '# não', '*nota*', 'a|b', 'x;y', '"aspas"', "'=1+1", '日本語', '🙂', '\\caminho', '<b>', '1. item', '== x ==', '-- y --', '• z', '  espaço  ', '&amp;']
const CONTENT_PIECES = [
  '<p>Porta <strong>8080</strong> aberta</p>',
  '<h1>Título</h1>',
  '<h3>Sub</h3>',
  '<ul><li><p>a</p></li><li><p>b</p><ul><li><p>c</p></li></ul></li></ul>',
  '<ol><li><p>um</p></li></ol>',
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>feito</p></li></ul>',
  '<pre><code class="language-bash">nmap -sV {{ip}}\n# comentário</code></pre>',
  '<blockquote><p>citação</p></blockquote>',
  '<p><a href="https://e.com/a_b">link</a> e <code>x*y</code></p>',
  '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2|3</p></td></tr></tbody></table>',
  '<p>svc_backup, C:\\Users\\x, 1 &lt; 2 &amp; 3</p>',
  '<hr>',
  '<p><em>itálico</em> <s>riscado</s> <u>sub</u></p>'
]

function pick<T>(next: () => number, list: T[]): T {
  return list[Math.floor(next() * list.length)]
}

function randomTitle(next: () => number): string {
  const n = 1 + Math.floor(next() * 3)
  return Array.from({ length: n }, () => pick(next, TITLE_PIECES)).join(' ').trim()
}

let idn = 0
const id = (): string => `id-${++idn}`

function randomEntry(next: () => number, done?: boolean): Entry {
  const n = Math.floor(next() * 4)
  return { id: id(), title: randomTitle(next), content: Array.from({ length: n }, () => pick(next, CONTENT_PIECES)).join(''), ...(done === undefined ? {} : { done }) }
}

function randomData(next: () => number, boards: number, sections: number, entries: number): AppData {
  const board = (): Board => ({
    id: id(),
    title: randomTitle(next),
    kind: pick(next, KINDS) as Kind,
    sections: Array.from(
      { length: sections },
      (): Section => ({
        id: id(),
        title: randomTitle(next),
        checklist: Array.from({ length: Math.ceil(entries / 2) }, () => randomEntry(next, next() > 0.5)),
        notes: Array.from({ length: Math.floor(entries / 2) }, () => randomEntry(next))
      })
    ),
    createdAt: 1,
    updatedAt: 1
  })
  return {
    version: 1,
    workspaces: Array.from({ length: boards }, board),
    libraries: [],
    templates: [],
    snippetGroups: [],
    trash: [],
    settings: { theme: 'system' }
  }
}

/** Estrutura comparável: títulos e conclusão, sem ids. */
const outline = (boards: Board[]) =>
  boards.map((b) => ({
    title: b.title,
    kind: b.kind,
    sections: b.sections.map((s) => ({ title: s.title, checklist: s.checklist.map((e) => [e.title, !!e.done]), notes: s.notes.map((e) => e.title) }))
  }))

/** Títulos como o app guarda depois de importar (espaços nas pontas não sobrevivem a formatos de texto). */
const normalizeTitles = (boards: Board[]): Board[] =>
  boards.map((b) => ({
    ...b,
    title: b.title.trim(),
    sections: b.sections.map((s) => ({
      ...s,
      title: s.title.trim(),
      checklist: s.checklist.map((e) => ({ ...e, title: e.title.trim() })),
      notes: s.notes.map((e) => ({ ...e, title: e.title.trim() }))
    }))
  }))

describe('ida e volta com dados gerados', () => {
  const seeds = Array.from({ length: 25 }, (_, i) => i + 100)

  it.each(seeds)('Markdown, HTML e CSV mantêm a estrutura (semente %i)', (seed) => {
    const data = randomData(rng(seed), 2, 3, 4)
    const expected = outline(normalizeTitles(data.workspaces))
    for (const [ext, render] of [['md', toMarkdown], ['html', toHtml], ['csv', toCsv]] as const) {
      const back = parseImportFile(`x.${ext}`, render(data))
      expect(outline(back.workspaces), `.${ext}`).toEqual(expected)
    }
  })

  it.each(seeds)('o conteúdo das notas sobrevive ao Markdown (semente %i)', (seed) => {
    const data = randomData(rng(seed), 1, 2, 4)
    const back = parseImportFile('x.md', toMarkdown(data))
    const before = data.workspaces[0].sections.flatMap((s) => [...s.checklist, ...s.notes]).map((e) => htmlToPlainText(e.content))
    const after = back.workspaces[0].sections.flatMap((s) => [...s.checklist, ...s.notes]).map((e) => htmlToPlainText(e.content))
    expect(after).toEqual(before)
  })

  it.each(seeds)('HTML volta idêntico pelos dados embutidos (semente %i)', (seed) => {
    const data = randomData(rng(seed), 2, 2, 3)
    const back = parseImportFile('x.html', toHtml(data))
    expect(back.workspaces.map((b) => b.sections.map((s) => [...s.checklist, ...s.notes].map((e) => e.content)))).toEqual(
      data.workspaces.map((b) => b.sections.map((s) => [...s.checklist, ...s.notes].map((e) => e.content)))
    )
  })
})

describe('casos de borda', () => {
  it('CSV com Excel: quebras de linha, ; e aspas dentro das células', () => {
    const data = randomData(rng(7), 1, 1, 2)
    data.workspaces[0].sections[0].checklist[0].title = 'a;b "c"\nd'
    const back = parseImportFile('x.csv', toCsv(data))
    expect(back.workspaces[0].sections[0].checklist[0].title).toBe('a;b "c"\nd')
  })

  it('CSV salvo pelo Excel com vírgula e CRLF também é lido', () => {
    const csv = 'Tipo,Nome,Categoria,Seção,Lista,Título,Concluído,Conteúdo\r\nEspaço,Alvo,Pentest,Recon,Checklist,nmap,Sim,\r\n'
    const r = parseImportFile('x.csv', csv)
    expect(r.workspaces[0]).toMatchObject({ title: 'Alvo', kind: 'pentest' })
    expect(r.workspaces[0].sections[0].checklist[0]).toMatchObject({ title: 'nmap', done: true })
  })

  it('arquivo com BOM e quebras de linha do Windows', () => {
    const r = parseImportFile('x.md', '\uFEFF# Alvo\r\n\r\n## Recon\r\n\r\n### [x] nmap\r\n\r\nfeito\r\n')
    expect(r.workspaces[0].title).toBe('Alvo')
    expect(r.workspaces[0].sections[0].checklist[0]).toMatchObject({ title: 'nmap', done: true, content: '<p>feito</p>' })
  })

  it('extensão em maiúsculas e nomes com pontos', () => {
    expect(parseImportFile('Notas.v2.MD', '# A').workspaces[0].title).toBe('A')
    expect(parseImportFile('relatorio.final.TXT', 'oi').workspaces[0].title).toBe('relatorio.final')
  })

  it('JSON sem extensão é reconhecido pelo conteúdo', () => {
    const r = parseImportFile('backup', JSON.stringify({ version: 1, workspaces: [{ title: 'X', sections: [] }] }))
    expect(r.workspaces[0].title).toBe('X')
  })

  it('título com [x] de uma nota não vira item de checklist', () => {
    const data = randomData(rng(8), 1, 1, 0)
    data.workspaces[0].sections[0].notes = [{ id: 'n', title: '[x] parece tarefa', content: '' }]
    for (const [ext, render] of [['md', toMarkdown], ['csv', toCsv], ['html', toHtml]] as const) {
      const s = parseImportFile(`x.${ext}`, render(data)).workspaces[0].sections[0]
      expect(s.checklist, `.${ext}`).toHaveLength(0)
      expect(s.notes[0].title, `.${ext}`).toBe('[x] parece tarefa')
    }
  })

  it('espaço e seção vazios sobrevivem em todos os formatos', () => {
    const data: AppData = {
      version: 1,
      workspaces: [
        { id: 'a', title: 'Vazio', kind: 'task', sections: [], createdAt: 1, updatedAt: 1 },
        { id: 'b', title: 'Seção vazia', kind: 'study', sections: [{ id: 's', title: 'Nada', checklist: [], notes: [] }], createdAt: 1, updatedAt: 1 }
      ],
      libraries: [],
      templates: [],
      snippetGroups: [],
      trash: [],
      settings: { theme: 'system' }
    }
    for (const [ext, render] of [['md', toMarkdown], ['html', toHtml], ['csv', toCsv], ['txt', toText]] as const) {
      const back = parseImportFile(`x.${ext}`, render(data))
      expect(outline(back.workspaces), `.${ext}`).toEqual([
        { title: 'Vazio', kind: 'task', sections: [] },
        { title: 'Seção vazia', kind: 'study', sections: [{ title: 'Nada', checklist: [], notes: [] }] }
      ])
    }
  })

  it('snippet com crases e chaves continua igual no Markdown', () => {
    const data = randomData(rng(10), 0, 0, 0)
    const content = 'echo "```"\nawk \'{print $1}\' {{arquivo}}\n````'
    data.snippetGroups = [{ id: 'g', title: 'Shell', items: [{ id: 'i', title: 'awk', content }] }]
    expect(parseImportFile('x.md', toMarkdown(data)).snippetGroups[0].items[0].content).toBe(content)
    expect(parseImportFile('x.txt', toText(data)).snippetGroups[0].items[0].content).toBe(content)
  })

  it('cores inválidas de um Markdown editado à mão são ignoradas', () => {
    const r = parseImportFile('x.md', '<!-- opsinote:workspace kind=hacker color=red;x -->\n# A')
    expect(r.workspaces[0]).toMatchObject({ title: 'A', kind: 'other' })
    expect(r.workspaces[0].color).toBeUndefined()
  })

  it('normalizeData guarda atalhos válidos e descarta o resto', () => {
    const raw = { version: 1, workspaces: [], settings: { theme: 'dark', shortcuts: { palette: 'Ctrl+KeyJ', help: null, focus: 'Ctrl+KeyC', foo: 'F2' } } }
    expect(normalizeData(raw)?.settings).toEqual({ theme: 'dark', shortcuts: { palette: 'Ctrl+KeyJ', help: null } })
    expect(normalizeData({ version: 1, settings: { shortcuts: 'lixo' } })?.settings).toEqual({ theme: 'system' })
  })
})
