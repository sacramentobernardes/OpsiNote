import { describe, expect, it } from 'vitest'
import { buildGraph, neighbors, orphans } from './graph'
import { createSimulation } from './graphLayout'
import { board, entry, makeData, section } from './testing'
import type { AppData } from '../types'

function data(): AppData {
  const d = makeData()
  d.workspaces = [
    board('Pentest ACME', [
      section(
        'Recon',
        [entry('Rodar nmap', { content: '<p>Veja a nota [[Portas abertas]] e o relatório do Projeto Atlas.</p>' })],
        [entry('Portas abertas', { content: '<p>8080 Jenkins</p>' }), entry('Rascunho', { content: '<p>nada aqui</p>' })]
      )
    ]),
    board('Projeto Atlas', [section('Geral', [], [entry('Arquitetura', { content: '<p>Usa o mesmo Jenkins de pentest acme.</p>' })])], { kind: 'project' }),
    board('Novo espaço', [section('Nova seção', [], [entry('Sem título')])])
  ]
  return d
}

describe('buildGraph', () => {
  it('liga cada espaço às tarefas e notas dele', () => {
    const g = buildGraph(data())
    const contains = g.links.filter((l) => l.kind === 'contains')
    expect(contains).toHaveLength(5)
    const acme = g.nodes.find((n) => n.title === 'Pentest ACME')!
    expect(contains.filter((l) => l.source === acme.id)).toHaveLength(3)
  })

  it('liga textos que citam o título de outro nó (com ou sem [[ ]], sem acento e maiúsculas)', () => {
    const g = buildGraph(data())
    const title = (id: string): string => g.nodes.find((n) => n.id === id)!.title
    const mentions = g.links.filter((l) => l.kind === 'mentions').map((l) => `${title(l.source)} → ${title(l.target)}`)
    expect(mentions.sort()).toEqual(['Arquitetura → Pentest ACME', 'Rodar nmap → Portas abertas', 'Rodar nmap → Projeto Atlas'].sort())
  })

  it('aponta as tarefas e notas sem nenhuma conexão', () => {
    const g = buildGraph(data())
    expect(orphans(g).map((n) => n.title).sort()).toEqual(['Rascunho', 'Sem título'])
  })

  it('ignora títulos genéricos, curtos e repetidos', () => {
    const d = data()
    d.workspaces[0].sections[0].notes.push(entry('Portas abertas', { content: '' }), entry('ssh'))
    d.workspaces[2].sections[0].notes[0].content = '<p>Novo espaço, ssh e Portas abertas</p>'
    const g = buildGraph(d)
    const sem = g.nodes.find((n) => n.title === 'Sem título')!
    expect(sem.mentions).toBe(0)
  })

  it('não liga um item ao próprio espaço nem a si mesmo', () => {
    const d = data()
    d.workspaces[0].sections[0].notes[1].content = '<p>Rascunho do Pentest ACME</p>'
    const g = buildGraph(d)
    expect(g.nodes.find((n) => n.title === 'Rascunho')!.mentions).toBe(0)
  })

  it('bibliotecas e snippets entram só quando pedidos', () => {
    const d = data()
    expect(buildGraph(d).nodes.some((n) => n.kind === 'library' || n.kind === 'snippet')).toBe(false)
    const g = buildGraph(d, { libraries: true, snippets: true })
    expect(g.nodes.some((n) => n.kind === 'library')).toBe(true)
    expect(g.nodes.filter((n) => n.kind === 'snippet')).toHaveLength(2)
    expect(buildGraph(d, { tasks: false }).nodes.some((n) => n.kind === 'task')).toBe(false)
  })

  it('cada nó sabe abrir o próprio conteúdo', () => {
    const g = buildGraph(data())
    const note = g.nodes.find((n) => n.title === 'Portas abertas')!
    expect(note.target).toMatchObject({ list: 'notes', entryId: expect.any(String), sectionId: expect.any(String) })
    expect(note.target.view.type).toBe('workspace')
  })

  it('lista os vizinhos pelas duas pontas', () => {
    const g = buildGraph(data())
    const n = neighbors(g)
    const portas = g.nodes.find((x) => x.title === 'Portas abertas')!
    expect([...n.get(portas.id)!].map((id) => g.nodes.find((x) => x.id === id)!.title).sort()).toEqual(['Pentest ACME', 'Rodar nmap'])
  })
})

describe('createSimulation', () => {
  it('assenta sem valores inválidos e deixa ligados mais perto que soltos', () => {
    // 0-1-2 ligados em cadeia; 3 solto.
    const sim = createSimulation(4, [
      { source: 0, target: 1, length: 60, strength: 0.08 },
      { source: 1, target: 2, length: 60, strength: 0.08 }
    ])
    let steps = 0
    while (sim.step() && steps < 2000) steps++
    expect(steps).toBeLessThan(2000)
    expect([...sim.pos].every(Number.isFinite)).toBe(true)
    const dist = (a: number, b: number): number => Math.hypot(sim.pos[a * 2] - sim.pos[b * 2], sim.pos[a * 2 + 1] - sim.pos[b * 2 + 1])
    expect(dist(0, 1)).toBeLessThan(dist(0, 3))
  })

  it('segura um nó preso onde foi largado', () => {
    const sim = createSimulation(3, [{ source: 0, target: 1, length: 50, strength: 0.1 }])
    sim.fix(0, 500, -200)
    for (let i = 0; i < 50; i++) sim.step()
    expect([sim.pos[0], sim.pos[1]]).toEqual([500, -200])
  })

  it('dá conta de muitos nós rápido (repulsão em grade)', () => {
    const n = 3000
    const links = Array.from({ length: n - 1 }, (_, i) => ({ source: Math.floor(i / 10), target: i + 1, length: 60, strength: 0.05 }))
    const sim = createSimulation(n, links)
    const start = performance.now()
    for (let i = 0; i < 30; i++) sim.step()
    expect(performance.now() - start).toBeLessThan(3000)
    expect([...sim.pos].every(Number.isFinite)).toBe(true)
  })
})
