import { describe, expect, it } from 'vitest'
import { buildExport } from './exportData'
import { renderExport, toCsv, toHtml, toMarkdown, toText } from './exportFormats'
import { parseCsv, parseImportFile } from './importFormats'
import { makeData } from './testing'
import type { AppData } from '../types'

/** Dados de teste com ficha, cor, biblioteca, modelo e snippets. */
function richData(): AppData {
  const data = makeData()
  const ws = data.workspaces[0]
  ws.color = '#ef4444'
  ws.sheet = { vars: [{ id: 'v1', key: 'ip', value: '10.0.0.1' }], fields: { scope: 'Rede interna\nSem DoS' }, start: '2026-10-01' }
  data.libraries[0].kind = 'study'
  return buildExport(
    data,
    {
      workspaces: new Set(data.workspaces.map((b) => b.id)),
      libraries: new Set(data.libraries.map((b) => b.id)),
      templates: new Set(data.templates.map((t) => t.id)),
      snippetGroups: new Set(data.snippetGroups.map((g) => g.id))
    },
    false
  )
}

/** O que importa comparar numa ida e volta (sem ids nem datas). */
const shape = (r: ReturnType<typeof parseImportFile>) => ({
  workspaces: r.workspaces.map((b) => ({
    title: b.title,
    kind: b.kind,
    sections: b.sections.map((s) => ({
      title: s.title,
      checklist: s.checklist.map((e) => [e.title, e.done]),
      notes: s.notes.map((e) => e.title)
    }))
  })),
  libraries: r.libraries.map((b) => [b.title, b.kind]),
  templates: r.templates.map((t) => t.title),
  snippets: r.snippetGroups.map((g) => [g.title, g.items.map((i) => [i.title, i.content])])
})

const expected = {
  workspaces: [
    {
      title: 'Pentest ACME',
      kind: 'pentest',
      sections: [
        { title: 'Recon', checklist: [['Rodar nmap', true], ['Enumerar subdomínios', false]], notes: ['Achados'] },
        { title: 'Exploração', checklist: [['Testar SQLi', false]], notes: [] }
      ]
    },
    { title: 'Estudos', kind: 'pentest', sections: [{ title: 'Redes', checklist: [], notes: [] }] }
  ],
  libraries: [['Roteiro web', 'study']],
  templates: ['Relatório'],
  snippets: [
    ['Rede', [['nmap', 'nmap -sV {{ip}}'], ['curl', 'curl {{url}}']]],
    ['Web', []]
  ]
}

describe('ida e volta', () => {
  it('Markdown mantém estrutura, ficha, cor e conteúdo', () => {
    const md = toMarkdown(richData())
    expect(md).toContain('# Pentest ACME')
    expect(md).toContain('### [x] Rodar nmap')
    expect(md).toContain('Porta **8080** aberta com Jenkins')
    const back = parseImportFile('export.md', md)
    expect(shape(back)).toEqual(expected)
    const ws = back.workspaces[0]
    expect(ws.color).toBe('#ef4444')
    expect(ws.sheet).toMatchObject({ vars: [{ key: 'ip', value: '10.0.0.1' }], fields: { scope: 'Rede interna\nSem DoS' }, start: '2026-10-01' })
    expect(ws.sections[0].notes[0].content).toBe('<p>Porta <strong>8080</strong> aberta com Jenkins</p>')
    expect(back.templates[0].content).toBe('<h2>Resumo</h2>')
  })

  it('HTML volta sem perdas pelos dados embutidos', () => {
    const data = richData()
    const back = parseImportFile('export.html', toHtml(data))
    expect(shape(back)).toEqual(expected)
    expect(back.workspaces[0].sheet?.fields.scope).toBe('Rede interna\nSem DoS')
  })

  it('HTML religa as imagens embutidas aos dados', () => {
    const data = richData()
    const asset = `opsinote-asset://files/${'a'.repeat(64)}.png`
    data.workspaces[0].sections[0].notes[0].content = `<p><img src="${asset}"></p>`
    // O processo principal troca o endereço pela imagem ao gravar; aqui simulamos isso.
    const page = toHtml(data).replaceAll(asset, 'data:image/png;base64,AAAA')
    expect(page.match(/data:image\/png;base64,AAAA/g)).toHaveLength(1)
    const back = parseImportFile('export.html', page)
    expect(back.workspaces[0].sections[0].notes[0].content).toContain('data:image/png;base64,AAAA')
  })

  it('CSV mantém itens, conclusão e snippets', () => {
    const back = parseImportFile('export.csv', toCsv(richData()))
    expect(shape(back)).toEqual(expected)
    expect(back.workspaces[0].sheet?.vars).toMatchObject([{ key: 'ip', value: '10.0.0.1' }])
  })

  it('texto simples mantém a estrutura', () => {
    const txt = toText(richData())
    expect(txt).toContain('== Pentest ACME (Espaço · Pentest) ==')
    expect(txt).toContain('[x] Rodar nmap')
    const back = parseImportFile('export.txt', txt)
    expect(shape(back)).toEqual(expected)
    expect(back.workspaces[0].sheet).toMatchObject({ vars: [{ key: 'ip', value: '10.0.0.1' }], start: '2026-10-01', fields: { scope: 'Rede interna\nSem DoS' } })
  })

  it('JSON continua igual ao backup de sempre', () => {
    const data = richData()
    expect(JSON.parse(renderExport('json', data))).toEqual(data)
  })
})

describe('HTML exportado', () => {
  it('não deixa o conteúdo das notas fechar o script de dados nem rodar código', () => {
    const data = richData()
    data.workspaces[0].sections[0].notes[0].content = '<p>x</p><script>alert(1)</script></script><img src=x onerror=alert(1)>'
    data.workspaces[0].color = 'red;background:url(https://e.com)'
    const page = toHtml(data)
    // A parte visível vem limpa; nos dados embutidos o HTML é só texto (com "<" escapado).
    const [visible, embedded] = page.split('<script type="application/json"')
    expect(visible).not.toContain('<script')
    expect(visible).not.toContain('onerror')
    expect(visible).not.toContain('url(https://e.com)')
    const json = embedded.slice(embedded.indexOf('>') + 1, embedded.indexOf('</script>'))
    expect(json).not.toContain('<')
    expect(page.match(/<\/script>/g)).toHaveLength(1)
  })
})

describe('CSV', () => {
  it('protege contra fórmulas e lê de volta sem o apóstrofo', () => {
    const data = richData()
    data.snippetGroups[0].items[0].content = '=cmd|\' /C calc\'!A0'
    const csv = toCsv(data)
    expect(csv).toContain("'=cmd")
    expect(parseImportFile('x.csv', csv).snippetGroups[0].items[0].content).toBe('=cmd|\' /C calc\'!A0')
  })

  it('lê aspas, quebras de linha e detecta o separador', () => {
    expect(parseCsv('a,b\n"x, y","linha 1\nlinha 2"\n')).toEqual([['a', 'b'], ['x, y', 'linha 1\nlinha 2']])
    expect(parseCsv('a;b\r\n1;"com ""aspas"""')).toEqual([['a', 'b'], ['1', 'com "aspas"']])
  })

  it('planilha de outro app vira um checklist com as colunas no conteúdo', () => {
    const r = parseImportFile('Tarefas.csv', 'Tarefa,Status,Responsável\nRevisar escopo,feito,Ana\nRodar scan,,Bruno\n')
    const s = r.workspaces[0]
    expect(s.title).toBe('Tarefas')
    expect(s.sections[0].checklist.map((e) => [e.title, e.done])).toEqual([
      ['Revisar escopo', true],
      ['Rodar scan', false]
    ])
    expect(s.sections[0].checklist[0].content).toBe('<p><strong>Responsável</strong>: Ana</p>')
  })
})

describe('arquivos de outros apps', () => {
  it('Markdown comum: # vira espaço, ## seção, ### nota e "- [ ]" itens do checklist', () => {
    const md = '# Recon do alvo\n\nAnotações gerais.\n\n## Portas\n\n- [x] Scan TCP\n- [ ] Scan UDP\n\n### 8080\n\nJenkins **antigo**.\n'
    const r = parseImportFile('notas.md', md)
    const ws = r.workspaces[0]
    expect(ws.title).toBe('Recon do alvo')
    expect(ws.sections.map((s) => s.title)).toEqual(['Geral', 'Portas'])
    expect(ws.sections[0].notes[0].content).toBe('<p>Anotações gerais.</p>')
    expect(ws.sections[1].checklist.map((e) => [e.title, e.done])).toEqual([
      ['Scan TCP', true],
      ['Scan UDP', false]
    ])
    expect(ws.sections[1].notes[0]).toMatchObject({ title: '8080', content: '<p>Jenkins <strong>antigo</strong>.</p>' })
  })

  it('Markdown sem títulos vira uma nota com o nome do arquivo', () => {
    const r = parseImportFile('C:\\notas\\ideias.md', 'só um texto\ncom duas linhas')
    expect(r.workspaces[0].title).toBe('ideias')
    expect(r.workspaces[0].sections[0].notes[0]).toMatchObject({ title: 'ideias', content: '<p>só um texto<br>com duas linhas</p>' })
  })

  it('título dentro de bloco de código não vira estrutura', () => {
    const r = parseImportFile('a.md', '# A\n\n## S\n\n### Nota\n\n```bash\n# comentário\n```\n')
    expect(r.workspaces[0].sections.map((s) => s.title)).toEqual(['S'])
    expect(r.workspaces[0].sections[0].notes[0].content).toBe('<pre><code class="language-bash"># comentário</code></pre>')
  })

  it('texto comum: [ ] viram itens e o resto uma nota', () => {
    const r = parseImportFile('lista.txt', 'Compras da semana\n\n[ ] pão\n[x] café\n')
    const s = r.workspaces[0].sections[0]
    expect(s.checklist.map((e) => [e.title, e.done])).toEqual([
      ['pão', false],
      ['café', true]
    ])
    expect(s.notes[0]).toMatchObject({ title: 'lista', content: '<p>Compras da semana</p>' })
  })

  it('página HTML comum vira uma nota limpa', () => {
    const page = '<html><head><title>Writeup</title><script>x()</script></head><body><h1>Writeup</h1><p onclick="x()">texto</p></body></html>'
    const note = parseImportFile('pagina.html', page).workspaces[0].sections[0].notes[0]
    expect(note).toMatchObject({ title: 'Writeup', content: '<h1>Writeup</h1><p>texto</p>' })
  })

  it('explica arquivos vazios ou de tipo desconhecido', () => {
    expect(() => parseImportFile('vazio.md', '\n\n')).toThrow('Nenhum dado reconhecido no arquivo.')
    expect(() => parseImportFile('foto.png', 'xx')).toThrow(/Formato não suportado \(\.png\)/)
  })
})
