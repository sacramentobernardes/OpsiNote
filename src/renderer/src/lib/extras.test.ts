import { describe, expect, it } from 'vitest'
import { cleanAppearance, textOn, DEFAULT_ACCENT } from './appearance'
import { formatClock, pinnedFirst } from './util'
import { normalizeData, parseImport } from './importData'
import { matchSnippets } from './snippets'
import { makeData } from './testing'

describe('pinnedFirst', () => {
  it('põe os fixados primeiro sem mudar a ordem de cada grupo', () => {
    const list = [{ id: 'a' }, { id: 'b', pinned: true }, { id: 'c' }, { id: 'd', pinned: true }]
    expect(pinnedFirst(list).map((x) => x.id)).toEqual(['b', 'd', 'a', 'c'])
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('sem fixados devolve a mesma lista', () => {
    const list: { id: string; pinned?: boolean }[] = [{ id: 'a' }]
    expect(pinnedFirst(list)).toBe(list)
  })
})

describe('fixados nos dados', () => {
  it('sobrevivem ao salvar, ao backup e à importação', () => {
    const data = makeData()
    data.workspaces[1].pinned = true
    data.workspaces[0].sections[0].notes[0].pinned = true
    data.snippetGroups[0].items[1].pinned = true
    const loaded = normalizeData(JSON.parse(JSON.stringify(data)))!
    expect(loaded.workspaces[1].pinned).toBe(true)
    expect(loaded.workspaces[0].sections[0].notes[0].pinned).toBe(true)
    expect(loaded.workspaces[0].pinned).toBeUndefined()
    const imported = parseImport(JSON.stringify(data))
    expect(imported.snippetGroups[0].items[1].pinned).toBe(true)
  })

  it('snippets fixados vêm primeiro no menu s/ sem busca', () => {
    const data = makeData()
    data.snippetGroups[0].items[1].pinned = true
    expect(matchSnippets(data.snippetGroups, '').map((m) => m.item.title)).toEqual(['curl', 'nmap'])
    // Com busca, vale a relevância.
    expect(matchSnippets(data.snippetGroups, 'nmap').map((m) => m.item.title)).toEqual(['nmap'])
  })
})

describe('aparência', () => {
  it('guarda só valores conhecidos e não grava os padrões', () => {
    expect(cleanAppearance({ accent: '#2563EB', density: 'compact', cards: 'flat', radius: 'round' })).toEqual({
      accent: '#2563eb',
      density: 'compact',
      cards: 'flat',
      radius: 'round'
    })
    expect(cleanAppearance({ accent: DEFAULT_ACCENT, density: 'comfortable', cards: 'bordered', radius: 'medium' })).toEqual({})
    expect(cleanAppearance({ accent: 'red;background:url(x)', density: 'gigante', cards: 1 })).toEqual({})
    expect(cleanAppearance('lixo')).toEqual({})
  })

  it('sobrevive ao carregar os dados', () => {
    const data = { ...makeData(), settings: { theme: 'dark', appearance: { accent: '#16a34a', radius: 'square', foo: 1 } } }
    expect(normalizeData(data)?.settings).toEqual({ theme: 'dark', appearance: { accent: '#16a34a', radius: 'square' } })
  })

  it('escolhe texto branco ou escuro pelo contraste', () => {
    expect(textOn('#2563eb')).toBe('#ffffff')
    expect(textOn('#1a1a1a')).toBe('#ffffff')
    expect(textOn('#facc15')).toBe('#1a1204')
    expect(textOn('#ffffff')).toBe('#1a1204')
  })
})

describe('formatClock', () => {
  it('mostra minutos e segundos, e horas quando passa de uma', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00')
    expect(formatClock(24 * 60_000 + 59_001)).toBe('25:00')
    expect(formatClock(59_000)).toBe('0:59')
    expect(formatClock(90 * 60_000)).toBe('1:30:00')
    expect(formatClock(-5)).toBe('0:00')
  })
})
