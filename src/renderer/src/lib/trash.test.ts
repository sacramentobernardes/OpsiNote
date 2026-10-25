import { describe, expect, it } from 'vitest'
import { deleteForever, moveToTrash, purgeExpired, restoreFromTrash, TRASH_DAYS } from './trash'
import { makeData } from './testing'

describe('lixeira', () => {
  it('exclui um item e restaura na mesma posição', () => {
    const data = makeData()
    const ws = data.workspaces[0]
    const recon = ws.sections[0]
    const target = recon.checklist[0]

    const item = moveToTrash(data, { kind: 'entry', boardType: 'workspace', boardId: ws.id, sectionId: recon.id, list: 'checklist', entryId: target.id })
    expect(item).not.toBeNull()
    expect(recon.checklist.map((e) => e.title)).toEqual(['Enumerar subdomínios'])
    expect(data.trash).toHaveLength(1)

    expect(restoreFromTrash(data, item!.id)).toBe('Pentest ACME › Recon')
    expect(recon.checklist.map((e) => e.title)).toEqual(['Rodar nmap', 'Enumerar subdomínios'])
    expect(recon.checklist[0].done).toBe(true)
    expect(data.trash).toHaveLength(0)
  })

  it('restaura espaço, seção, modelo, grupo e snippet', () => {
    const data = makeData()
    const ws = data.workspaces[1]
    const section = data.workspaces[0].sections[1]
    const template = data.templates[0]
    const group = data.snippetGroups[1]
    const snippet = data.snippetGroups[0].items[1]

    const ids = [
      moveToTrash(data, { kind: 'board', boardType: 'workspace', id: ws.id }),
      moveToTrash(data, { kind: 'section', boardType: 'workspace', boardId: data.workspaces[0].id, sectionId: section.id }),
      moveToTrash(data, { kind: 'template', id: template.id }),
      moveToTrash(data, { kind: 'snippetGroup', id: group.id }),
      moveToTrash(data, { kind: 'snippet', groupId: data.snippetGroups[0].id, id: snippet.id })
    ].map((t) => t!.id)

    expect(data.workspaces).toHaveLength(1)
    expect(data.trash).toHaveLength(5)
    for (const id of ids) restoreFromTrash(data, id)

    expect(data.workspaces.map((w) => w.title)).toEqual(['Pentest ACME', 'Estudos'])
    expect(data.workspaces[0].sections.map((s) => s.title)).toEqual(['Recon', 'Exploração'])
    expect(data.templates[0].id).toBe(template.id)
    expect(data.snippetGroups.map((g) => g.title)).toEqual(['Rede', 'Web'])
    expect(data.snippetGroups[0].items.map((i) => i.title)).toEqual(['nmap', 'curl'])
  })

  it('recria a seção quando ela também foi excluída', () => {
    const data = makeData()
    const ws = data.workspaces[0]
    const recon = ws.sections[0]
    const entry = moveToTrash(data, { kind: 'entry', boardType: 'workspace', boardId: ws.id, sectionId: recon.id, list: 'notes', entryId: recon.notes[0].id })!
    moveToTrash(data, { kind: 'section', boardType: 'workspace', boardId: ws.id, sectionId: recon.id })

    expect(restoreFromTrash(data, entry.id)).toBe('Pentest ACME › Recon (recriada)')
    const recreated = ws.sections.at(-1)!
    expect(recreated.title).toBe('Recon')
    expect(recreated.notes.map((n) => n.title)).toEqual(['Achados'])
  })

  it('recria o espaço quando a seção restaurada não tem mais onde voltar', () => {
    const data = makeData()
    const ws = data.workspaces[0]
    const sec = moveToTrash(data, { kind: 'section', boardType: 'workspace', boardId: ws.id, sectionId: ws.sections[1].id })!
    moveToTrash(data, { kind: 'board', boardType: 'workspace', id: ws.id })

    expect(restoreFromTrash(data, sec.id)).toBe('Pentest ACME (recriado)')
    expect(data.workspaces[0].title).toBe('Pentest ACME')
    expect(data.workspaces[0].sections.map((s) => s.title)).toEqual(['Exploração'])
  })

  it('o espaço recriado mantém a categoria e a cor do original', () => {
    const data = makeData()
    const ws = data.workspaces[0]
    ws.color = '#ef4444'
    const recon = ws.sections[0]
    const entry = moveToTrash(data, { kind: 'entry', boardType: 'workspace', boardId: ws.id, sectionId: recon.id, list: 'checklist', entryId: recon.checklist[0].id })!
    moveToTrash(data, { kind: 'board', boardType: 'workspace', id: ws.id })

    restoreFromTrash(data, entry.id)
    expect(data.workspaces[0]).toMatchObject({ title: 'Pentest ACME', kind: 'pentest', color: '#ef4444' })
  })

  it('apaga de vez e expira depois de 30 dias', () => {
    const data = makeData()
    const day = 24 * 60 * 60 * 1000
    const now = 100 * day
    const old = moveToTrash(data, { kind: 'template', id: data.templates[0].id }, now - (TRASH_DAYS + 1) * day)!
    const recent = moveToTrash(data, { kind: 'snippetGroup', id: data.snippetGroups[1].id }, now - day)!
    const other = moveToTrash(data, { kind: 'snippetGroup', id: data.snippetGroups[0].id }, now)!

    expect(purgeExpired(data, now)).toBe(1)
    expect(data.trash.map((t) => t.id)).toEqual([other.id, recent.id])
    expect(data.trash.some((t) => t.id === old.id)).toBe(false)

    deleteForever(data, recent.id)
    expect(data.trash.map((t) => t.id)).toEqual([other.id])
  })

  it('não faz nada com ids que não existem', () => {
    const data = makeData()
    expect(moveToTrash(data, { kind: 'template', id: 'nada' })).toBeNull()
    expect(restoreFromTrash(data, 'nada')).toBeNull()
    expect(data.trash).toHaveLength(0)
  })
})
