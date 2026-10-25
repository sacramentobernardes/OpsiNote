import { describe, expect, it } from 'vitest'
import * as ops from './ops'
import { makeData } from './testing'

describe('entradas', () => {
  it('duplica logo abaixo, com id novo e "(cópia)" no título', () => {
    const data = makeData()
    const ws = data.workspaces[0]
    const recon = ws.sections[0]
    const original = recon.checklist[0]
    const copyId = ops.duplicateEntry(data, { boardType: 'workspace', boardId: ws.id, sectionId: recon.id, list: 'checklist', entryId: original.id })

    expect(recon.checklist.map((e) => e.title)).toEqual(['Rodar nmap', 'Rodar nmap (cópia)', 'Enumerar subdomínios'])
    expect(copyId).toBe(recon.checklist[1].id)
    expect(copyId).not.toBe(original.id)
    expect(recon.checklist[1].done).toBe(true)
  })

  it('move do checklist para notas de outro espaço e tira o "concluído"', () => {
    const data = makeData()
    const [acme, estudos] = data.workspaces
    const item = acme.sections[0].checklist[0]
    const ok = ops.moveEntryTo(
      data,
      { boardType: 'workspace', boardId: acme.id, sectionId: acme.sections[0].id, list: 'checklist', entryId: item.id },
      { boardType: 'workspace', boardId: estudos.id, sectionId: estudos.sections[0].id, list: 'notes' }
    )
    expect(ok).toBe(true)
    expect(acme.sections[0].checklist).toHaveLength(1)
    expect(estudos.sections[0].notes[0]).toEqual({ id: item.id, title: 'Rodar nmap', content: '' })
  })

  it('nota que vira item de checklist começa pendente', () => {
    const data = makeData()
    const acme = data.workspaces[0]
    const note = acme.sections[0].notes[0]
    ops.moveEntryTo(
      data,
      { boardType: 'workspace', boardId: acme.id, sectionId: acme.sections[0].id, list: 'notes', entryId: note.id },
      { boardType: 'workspace', boardId: acme.id, sectionId: acme.sections[1].id, list: 'checklist' }
    )
    expect(acme.sections[1].checklist.at(-1)).toMatchObject({ title: 'Achados', done: false })
  })

  it('item concluído movido para uma biblioteca fica pendente', () => {
    const data = makeData()
    const acme = data.workspaces[0]
    const lib = data.libraries[0]
    const item = acme.sections[0].checklist[0]
    ops.moveEntryTo(
      data,
      { boardType: 'workspace', boardId: acme.id, sectionId: acme.sections[0].id, list: 'checklist', entryId: item.id },
      { boardType: 'library', boardId: lib.id, sectionId: lib.sections[0].id, list: 'checklist' }
    )
    expect(lib.sections[0].checklist.at(-1)).toMatchObject({ id: item.id, done: false })
  })

  it('recusa mover para o mesmo lugar', () => {
    const data = makeData()
    const acme = data.workspaces[0]
    const ref = { boardType: 'workspace' as const, boardId: acme.id, sectionId: acme.sections[0].id, list: 'checklist' as const, entryId: acme.sections[0].checklist[0].id }
    expect(ops.moveEntryTo(data, ref, { boardType: 'workspace', boardId: acme.id, sectionId: acme.sections[0].id, list: 'checklist' })).toBe(false)
  })
})

describe('seções', () => {
  it('duplica a seção com todos os itens e ids novos', () => {
    const data = makeData()
    const acme = data.workspaces[0]
    ops.duplicateSection(data, 'workspace', acme.id, acme.sections[0].id)
    const [orig, copy] = acme.sections
    expect(copy.title).toBe('Recon (cópia)')
    expect(copy.checklist.map((e) => e.title)).toEqual(orig.checklist.map((e) => e.title))
    expect(copy.checklist[0].id).not.toBe(orig.checklist[0].id)
    expect(copy.id).not.toBe(orig.id)
  })

  it('move para uma biblioteca e zera o progresso', () => {
    const data = makeData()
    const acme = data.workspaces[0]
    const recon = acme.sections[0]
    expect(ops.moveSectionTo(data, { boardType: 'workspace', boardId: acme.id, sectionId: recon.id }, { boardType: 'library', boardId: data.libraries[0].id })).toBe(true)
    expect(acme.sections.map((s) => s.title)).toEqual(['Exploração'])
    const moved = data.libraries[0].sections.at(-1)!
    expect(moved.title).toBe('Recon')
    expect(moved.checklist.every((e) => !e.done)).toBe(true)
  })

  it('reordena sem passar dos limites', () => {
    const data = makeData()
    const acme = data.workspaces[0]
    ops.reorderSection(data, 'workspace', acme.id, acme.sections[0].id, 1)
    expect(acme.sections.map((s) => s.title)).toEqual(['Exploração', 'Recon'])
    ops.reorderSection(data, 'workspace', acme.id, acme.sections[1].id, 5)
    expect(acme.sections.map((s) => s.title)).toEqual(['Exploração', 'Recon'])
  })
})

describe('espaços, snippets e modelos', () => {
  it('duplica o espaço inteiro sem repetir nenhum id', () => {
    const data = makeData()
    const acme = data.workspaces[0]
    acme.sheet = { vars: [{ id: 'v1', key: 'ip', value: '10.0.0.1' }], fields: {} }
    const copyId = ops.duplicateBoard(data, 'workspace', acme.id)!
    const copy = data.workspaces[1]
    expect(copy.id).toBe(copyId)
    expect(copy.title).toBe('Pentest ACME (cópia)')
    expect(copy.sheet?.vars[0]).toMatchObject({ key: 'ip', value: '10.0.0.1' })
    expect(copy.sheet?.vars[0].id).not.toBe('v1')

    const ids = (b: typeof acme): string[] => [b.id, ...b.sections.flatMap((s) => [s.id, ...s.checklist.map((e) => e.id), ...s.notes.map((e) => e.id)])]
    const all = [...ids(acme), ...ids(copy)]
    expect(new Set(all).size).toBe(all.length)
  })

  it('reordena espaços', () => {
    const data = makeData()
    ops.reorderBoards(data, 'workspace', 1, 0)
    expect(data.workspaces.map((w) => w.title)).toEqual(['Estudos', 'Pentest ACME'])
  })

  it('duplica e move snippets entre grupos', () => {
    const data = makeData()
    const [rede, web] = data.snippetGroups
    ops.duplicateSnippet(data, rede.id, rede.items[0].id)
    expect(rede.items.map((i) => i.title)).toEqual(['nmap', 'nmap (cópia)', 'curl'])
    expect(ops.moveSnippetTo(data, rede.id, rede.items[2].id, web.id)).toBe(true)
    expect(web.items.map((i) => i.title)).toEqual(['curl'])
    expect(ops.moveSnippetTo(data, web.id, web.items[0].id, web.id)).toBe(false)
  })

  it('duplica grupo e modelo', () => {
    const data = makeData()
    ops.duplicateSnippetGroup(data, data.snippetGroups[0].id)
    expect(data.snippetGroups.map((g) => g.title)).toEqual(['Rede', 'Rede (cópia)', 'Web'])
    expect(data.snippetGroups[1].items[0].id).not.toBe(data.snippetGroups[0].items[0].id)
    ops.duplicateTemplate(data, data.templates[0].id)
    expect(data.templates.map((t) => t.title)).toEqual(['Relatório', 'Relatório (cópia)'])
  })
})
