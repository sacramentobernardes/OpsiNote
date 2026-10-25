import { describe, expect, it } from 'vitest'
import { buildIndex, search } from './search'
import { makeData } from './testing'

describe('busca global', () => {
  const data = makeData()
  data.workspaces[0].sheet = { vars: [{ id: 'v', key: 'ip', value: '10.20.30.40' }], fields: { scope: 'Somente a rede interna', goal: 'só aparece em estudo' } }
  const index = buildIndex(data)
  const titles = (q: string): string[] => search(index, q).map((r) => r.doc.title)

  it('encontra pelo conteúdo da nota, sem acento e sem maiúsculas', () => {
    const [first] = search(index, 'JENKINS')
    expect(first.doc.title).toBe('Achados')
    expect(first.doc.path).toBe('Pentest ACME › Recon › Notas')
    expect(first.excerpt).toContain('Jenkins')
  })

  it('exige todos os termos', () => {
    expect(titles('porta jenkins')).toEqual(['Achados'])
    expect(titles('porta python')).toEqual([])
  })

  it('título vale mais que conteúdo', () => {
    data.templates.push({ id: 'x', title: 'Notas de recon', content: '' })
    const results = search(buildIndex(data), 'recon')
    expect(results[0].doc.title).toBe('Recon')
    data.templates.pop()
  })

  it('ignora acentos nos títulos', () => {
    expect(titles('subdominios')).toContain('Enumerar subdomínios')
  })

  it('encontra a ficha do alvo pelo IP e leva até ela', () => {
    const [r] = search(index, '10.20.30')
    expect(r.doc.kind).toBe('sheet')
    expect(r.doc.target).toMatchObject({ view: { type: 'workspace', id: data.workspaces[0].id }, sheet: true })
  })

  it('busca só nos campos da categoria atual', () => {
    expect(titles('rede interna')).toContain('Ficha do alvo')
    expect(titles('aparece em estudo')).toEqual([])
  })

  it('encontra snippets pelo comando e leva ao snippet', () => {
    const [r] = search(index, 'curl')
    expect(r.doc.kind).toBe('snippet')
    expect(r.doc.target.view).toEqual({ type: 'snippets' })
    expect(r.doc.target.entryId).toBe(data.snippetGroups[0].items[1].id)
  })

  it('não busca na lixeira e ignora busca vazia', () => {
    expect(search(index, '   ')).toEqual([])
    expect(index.some((d) => d.path.includes('Lixeira'))).toBe(false)
  })

  it('reaproveita o índice de espaços que não mudaram e reindexa os editados', () => {
    const d = makeData()
    const first = buildIndex(d)
    const again = buildIndex({ ...d })
    expect(again.find((x) => x.key === d.workspaces[1].id)).toBe(first.find((x) => x.key === d.workspaces[1].id))
    // Edição imutável (como o Immer faz): o espaço vira outro objeto.
    const ws = d.workspaces[0]
    const edited = { ...ws, sections: [{ ...ws.sections[0], notes: [{ id: 'novo', title: 'Hashcat', content: '' }] }] }
    const index = buildIndex({ ...d, workspaces: [edited, d.workspaces[1]] })
    expect(search(index, 'hashcat').map((r) => r.doc.title)).toEqual(['Hashcat'])
  })
})
