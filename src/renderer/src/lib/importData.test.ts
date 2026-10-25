import { describe, expect, it } from 'vitest'
import { normalizeData, parseImport } from './importData'
import { buildExport } from './exportData'
import { makeData } from './testing'

describe('parseImport', () => {
  it('lê o próprio formato, mantendo ficha e seção recolhida, com ids novos', () => {
    const data = makeData()
    data.workspaces[0].sheet = { vars: [{ id: 'v1', key: 'ip', value: '10.0.0.1' }], fields: { scope: 'interno' }, start: '2026-10-01' }
    data.workspaces[0].sections[0].collapsed = true
    const result = parseImport(JSON.stringify(data))

    expect(result.workspaces.map((w) => w.title)).toEqual(['Pentest ACME', 'Estudos'])
    const ws = result.workspaces[0]
    expect(ws.id).not.toBe(data.workspaces[0].id)
    expect(ws.sheet).toMatchObject({ vars: [{ key: 'ip', value: '10.0.0.1' }], fields: { scope: 'interno' }, start: '2026-10-01' })
    expect(ws.sections[0].collapsed).toBe(true)
    expect(ws.sections[0].checklist[0].done).toBe(true)
    expect(result.snippetGroups[0].items[0].content).toBe('nmap -sV {{ip}}')
  })

  it('lê o formato antigo do Swiftness (targets, folders, payloads)', () => {
    const legacy = {
      targets: [{ title: 'Alvo', folders: [{ title: 'Recon', checklist: [{ title: 'nmap', done: true }], notes: [] }] }],
      payloads: [{ title: 'XSS', data: [{ title: 'alert', content: '<script>' }] }]
    }
    const result = parseImport(JSON.stringify(legacy))
    expect(result.workspaces[0]).toMatchObject({ title: 'Alvo', kind: 'pentest' })
    expect(result.workspaces[0].sections[0].checklist[0]).toMatchObject({ title: 'nmap', done: true })
    expect(result.snippetGroups[0].items[0].content).toBe('<script>')
  })

  it('explica o erro em arquivo inválido ou vazio', () => {
    expect(() => parseImport('{nada')).toThrow('O arquivo não é um JSON válido.')
    expect(() => parseImport('[]')).toThrow('Formato de arquivo não reconhecido.')
    expect(() => parseImport('{"version":1}')).toThrow('Nenhum dado reconhecido no arquivo.')
  })
})

describe('normalizeData', () => {
  it('cria a lixeira em dados antigos e descarta o que expirou', () => {
    const old = { ...makeData(), trash: undefined }
    expect(normalizeData(old)?.trash).toEqual([])

    const data = makeData()
    data.trash = [
      { id: 't1', deletedAt: 0, index: 0, kind: 'template', template: { id: 'x', title: 'velho', content: '' } },
      { id: 't2', deletedAt: Date.now(), index: 0, kind: 'template', template: { id: 'y', title: 'novo', content: '' } }
    ]
    expect(normalizeData(data)?.trash.map((t) => t.id)).toEqual(['t2'])
  })

  it('move escopo e contatos de fichas antigas para os campos', () => {
    const data = JSON.parse(JSON.stringify(makeData()))
    data.workspaces[0].sheet = { vars: [], scope: 'rede interna', contacts: 'Ana', fields: { contacts: 'Bia' } }
    expect(normalizeData(data)?.workspaces[0].sheet?.fields).toEqual({ contacts: 'Bia', scope: 'rede interna' })
  })

  it('recusa o que não é um arquivo do app', () => {
    expect(normalizeData(null)).toBeNull()
    expect(normalizeData({ version: 2 })).toBeNull()
    expect(normalizeData([])).toBeNull()
  })

  it('completa campos ausentes sem trocar os ids existentes', () => {
    const data = normalizeData({
      version: 1,
      workspaces: [
        { id: 'w1', title: 'Sem seções' },
        { id: 'w2', kind: 'xpto', sections: [{ id: 's1', notes: [{ id: 'n1' }] }, 'lixo'] }
      ],
      snippetGroups: [{ id: 'g1', title: 'G' }],
      settings: { theme: 'neon' }
    })!
    expect(data.workspaces[0]).toMatchObject({ id: 'w1', title: 'Sem seções', kind: 'other', sections: [] })
    expect(data.workspaces[1]).toMatchObject({ id: 'w2', title: 'Sem título', kind: 'other' })
    expect(data.workspaces[1].sections).toEqual([{ id: 's1', title: 'Seção', checklist: [], notes: [{ id: 'n1', title: 'Sem título', content: '' }] }])
    expect(data.snippetGroups[0]).toEqual({ id: 'g1', title: 'G', items: [] })
    expect(data.templates).toEqual([])
    expect(data.settings.theme).toBe('system')
  })

  it('mantém datas, cor, ficha e recolhimento ao carregar', () => {
    const src = makeData()
    src.workspaces[0].color = '#ef4444'
    src.workspaces[0].sections[0].collapsed = true
    src.workspaces[0].sheet = { vars: [{ id: 'v1', key: 'ip', value: '1.2.3.4' }], fields: { scope: 'x', contacts: 'y' }, start: '2026-01-01' }
    src.snippetGroups[0].collapsed = true
    expect(normalizeData(JSON.parse(JSON.stringify(src)))).toEqual(src)
  })

  it('descarta itens da lixeira sem conteúdo e troca ids repetidos', () => {
    const src = makeData()
    const dup = src.workspaces[0].sections[0].checklist[0].id
    src.workspaces[1].sections[0].notes.push({ id: dup, title: 'cópia manual', content: '' })
    const now = Date.now()
    const data = normalizeData({
      ...src,
      trash: [
        { id: 't1', kind: 'entry', deletedAt: now, index: 0 },
        { id: 't2', kind: 'xpto', deletedAt: now },
        { id: 't3', kind: 'snippet', deletedAt: now, snippet: { id: 'z', title: 'ok' } }
      ]
    })!
    expect(data.trash.map((t) => t.id)).toEqual(['t3'])
    expect(data.workspaces[0].sections[0].checklist[0].id).toBe(dup)
    expect(data.workspaces[1].sections[0].notes[0].id).not.toBe(dup)
  })
})

describe('buildExport', () => {
  it('exporta só o selecionado, sem a lixeira, e zera checklists se pedido', () => {
    const data = makeData()
    data.trash = [{ id: 't', deletedAt: Date.now(), index: 0, kind: 'template', template: { id: 'x', title: 'x', content: '' } }]
    const file = buildExport(
      data,
      {
        workspaces: new Set([data.workspaces[0].id]),
        libraries: new Set(),
        templates: new Set(),
        snippetGroups: new Set([data.snippetGroups[0].id])
      },
      true
    )
    expect(file.workspaces.map((w) => w.title)).toEqual(['Pentest ACME'])
    expect(file.libraries).toEqual([])
    expect(file.snippetGroups.map((g) => g.title)).toEqual(['Rede'])
    expect(file.trash).toEqual([])
    expect(file.workspaces[0].sections.flatMap((s) => s.checklist).some((e) => e.done)).toBe(false)
    // O original não muda.
    expect(data.workspaces[0].sections[0].checklist[0].done).toBe(true)
    // E o arquivo exportado é importável.
    expect(parseImport(JSON.stringify(file)).workspaces).toHaveLength(1)
  })
})
