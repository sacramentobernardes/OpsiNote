import { describe, expect, it } from 'vitest'
import { createSeedData, createWelcomeBoard } from './seed'
import { sanitizeHtml } from './html'
import { normalizeData } from './importData'
import { extractVars, sheetValues, varKey } from './variables'

describe('dados iniciais', () => {
  it('passam pela validação do arquivo de dados sem perder nada', () => {
    const data = createSeedData()
    expect(normalizeData(JSON.parse(JSON.stringify(data)))).toEqual(data)
  })

  it('o tour usa só variáveis que a ficha dele preenche', () => {
    const board = createWelcomeBoard()
    const values = sheetValues(board.sheet)
    const used = board.sections
      .flatMap((s) => [...s.checklist, ...s.notes])
      .flatMap((e) => [...e.content.matchAll(/data-var="([^"]+)"/g)].map((m) => m[1]))
    expect(used.length).toBeGreaterThan(0)
    for (const key of used) expect(values[varKey(key)], key).toBeTruthy()
  })

  it('os snippets de exemplo têm valor na ficha do tour', () => {
    const values = sheetValues(createWelcomeBoard().sheet)
    for (const item of createSeedData().snippetGroups.flatMap((g) => g.items)) {
      for (const key of extractVars(item.content)) expect(values[varKey(key)], `${item.title}: ${key}`).toBeTruthy()
    }
  })

  it('o conteúdo do tour é HTML que o editor aceita como está', () => {
    for (const e of createWelcomeBoard().sections.flatMap((s) => [...s.checklist, ...s.notes])) {
      // A limpeza só tira o que o editor não usa; o tour não pode depender de nada disso.
      expect(sanitizeHtml(e.content).replace(/ class="[^"]*"/g, ''), e.title).toBe(e.content)
    }
  })

  it('cada tour novo tem ids novos', () => {
    const a = createWelcomeBoard()
    const b = createWelcomeBoard()
    expect(a.id).not.toBe(b.id)
    expect(a.sections[0].checklist[0].id).not.toBe(b.sections[0].checklist[0].id)
  })
})
