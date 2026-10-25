/** Casos-limite do grafo: dados vazios, títulos difíceis, volume e simulação degenerada. */
import { describe, expect, it } from 'vitest'
import { areLinked, buildGraph, mostConnected, neighborhood, neighbors, orphans, subgraph, whyNotLinkable, withMention, type Graph } from './graph'
import { createSimulation } from './graphLayout'
import { board, entry, section, timeLimit } from './testing'
import type { AppData, Board } from '../types'

function dataWith(workspaces: Board[], extra: Partial<AppData> = {}): AppData {
  return { version: 1, workspaces, libraries: [], templates: [], snippetGroups: [], trash: [], settings: { theme: 'system' }, ...extra }
}

const mentionPairs = (g: Graph): string[] => {
  const title = (id: string): string => g.nodes.find((n) => n.id === id)!.title
  return g.links
    .filter((l) => l.kind === 'mentions')
    .map((l) => `${title(l.source)} → ${title(l.target)}`)
    .sort()
}

describe('buildGraph: casos-limite', () => {
  it('dados vazios dão um grafo vazio', () => {
    const g = buildGraph(dataWith([]))
    expect(g).toEqual({ nodes: [], links: [], linkable: new Set() })
    expect(orphans(g)).toEqual([])
  })

  it('espaço sem seções e seção sem itens', () => {
    const g = buildGraph(dataWith([board('Vazio'), board('Só seção', [section('Nada')])]))
    expect(g.nodes.map((n) => n.title)).toEqual(['Vazio', 'Só seção'])
    expect(g.links).toEqual([])
  })

  it('títulos com caracteres especiais de regex não quebram nem casam errado', () => {
    const g = buildGraph(
      dataWith([
        board('Linguagens', [
          section('S', [], [
            entry('C++ (avançado)'),
            entry('a.b*c?'),
            entry('[colchetes] e {chaves}'),
            entry('Leitura', { content: '<p>Estudar C++ (avançado) e a.b*c? e [colchetes] e {chaves}; mas não aXbYc.</p>' })
          ])
        ])
      ])
    )
    expect(mentionPairs(g)).toEqual(['Leitura → C++ (avançado)', 'Leitura → [colchetes] e {chaves}', 'Leitura → a.b*c?'])
  })

  it('acentos e maiúsculas não importam; bordas de palavra sim', () => {
    const g = buildGraph(
      dataWith([
        board('B', [
          section('S', [], [
            entry('Exploração'),
            entry('Recon'),
            entry('Nota', { content: '<p>EXPLORACAO feita. Reconhecimento não é Recon? É sim: recon.</p>' })
          ])
        ])
      ])
    )
    expect(mentionPairs(g)).toEqual(['Nota → Exploração', 'Nota → Recon'])
    // "Reconhecimento" sozinho não conta.
    const g2 = buildGraph(dataWith([board('B', [section('S', [], [entry('Recon'), entry('Nota', { content: '<p>Reconhecimento</p>' })])])]))
    expect(mentionPairs(g2)).toEqual([])
  })

  it('o título mais longo ganha quando um contém o outro', () => {
    const g = buildGraph(
      dataWith([board('B', [section('S', [], [entry('Portas'), entry('Portas abertas'), entry('Nota', { content: '<p>Ver Portas abertas.</p>' })])])])
    )
    expect(mentionPairs(g)).toEqual(['Nota → Portas abertas'])
  })

  it('menção repetida e em mão dupla vira uma ligação só', () => {
    const g = buildGraph(
      dataWith([
        board('B', [
          section('S', [], [
            entry('Alfa nota', { content: '<p>Beta nota, Beta nota, [[Beta nota]]</p>' }),
            entry('Beta nota', { content: '<p>Alfa nota</p>' })
          ])
        ])
      ])
    )
    expect(g.links.filter((l) => l.kind === 'mentions')).toHaveLength(1)
    expect(g.nodes.find((n) => n.title === 'Alfa nota')!.mentions).toBe(1)
    expect(g.nodes.find((n) => n.title === 'Beta nota')!.mentions).toBe(1)
  })

  it('liga espaços diferentes e a ficha também menciona', () => {
    const a = board('Cliente Zeta', [section('S', [], [entry('Contrato')])])
    const b = board('Pentest Zeta', [section('S', [entry('Escopo do Cliente Zeta')])])
    b.sheet = { vars: [], fields: { scope: 'Conforme o Contrato assinado.' } }
    const g = buildGraph(dataWith([a, b]))
    expect(mentionPairs(g)).toEqual(['Pentest Zeta → Contrato'])
    // O título "Escopo do Cliente Zeta" contém "Cliente Zeta", mas título não é texto: não liga.
  })

  it('títulos só com espaços, emoji ou vazios não quebram', () => {
    const g = buildGraph(
      dataWith([board('🙂🙂🙂🙂', [section('S', [], [entry('   '), entry('')])]), board('Outro', [section('S', [], [entry('Nota', { content: '<p>🙂🙂🙂🙂</p>' })])])])
    )
    expect(g.nodes).toHaveLength(5)
    expect(mentionPairs(g)).toEqual(['Nota → 🙂🙂🙂🙂'])
  })

  it('não liga a nós que o filtro tirou', () => {
    const g = buildGraph(dataWith([board('B', [section('S', [entry('Tarefa importante')], [entry('Nota', { content: '<p>Tarefa importante</p>' })])])]), {
      tasks: false
    })
    expect(g.nodes.some((n) => n.kind === 'task')).toBe(false)
    expect(g.links.filter((l) => l.kind === 'mentions')).toEqual([])
  })

  it('snippets mencionados e que mencionam', () => {
    const d = dataWith([board('B', [section('S', [], [entry('Nota', { content: '<p>Rodei o Scan completo.</p>' })])])], {
      snippetGroups: [{ id: 'g', title: 'Rede', items: [{ id: 's1', title: 'Scan completo', content: 'nmap -p- {{ip}}  # ver Nota' }] }]
    })
    const g = buildGraph(d, { snippets: true })
    // "Nota" tem 4 letras: casa no comentário do snippet; as duas pontas viram uma ligação só.
    expect(mentionPairs(g)).toEqual(['Nota → Scan completo'])
  })

  it('cada link aponta para nós que existem e não há laços', () => {
    const g = buildGraph(
      dataWith([board('Um espaço', [section('S', [entry('Item um', { content: '<p>Um espaço e Item dois</p>' }), entry('Item dois', { content: '<p>Item um</p>' })])])])
    )
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const l of g.links) {
      expect(ids.has(l.source) && ids.has(l.target)).toBe(true)
      expect(l.source).not.toBe(l.target)
    }
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length)
    expect(neighbors(g).size).toBe(g.nodes.length)
  })

  it('aguenta milhares de nós e títulos únicos', () => {
    const boards = Array.from({ length: 40 }, (_, b) =>
      board(`Espaço número ${b}`, [
        section('S', Array.from({ length: 50 }, (_, i) => entry(`Tarefa ${b}-${i} única`, { content: `<p>Depende de Tarefa ${(b + 1) % 40}-${i} única e do Espaço número ${(b + 3) % 40}</p>` })))
      ])
    )
    const start = performance.now()
    const g = buildGraph(dataWith(boards))
    expect(performance.now() - start).toBeLessThan(timeLimit(4000))
    expect(g.nodes).toHaveLength(40 + 2000)
    expect(g.links.filter((l) => l.kind === 'mentions').length).toBeGreaterThan(2000)
  })
})

describe('createSimulation: casos degenerados', () => {
  it('sem nós', () => {
    const sim = createSimulation(0, [])
    expect(sim.step()).toBe(true)
    expect(sim.pos.length).toBe(0)
  })

  it('um nó só fica no lugar e assenta', () => {
    const sim = createSimulation(1, [])
    let n = 0
    while (sim.step() && n < 2000) n++
    expect(n).toBeLessThan(2000)
    expect([...sim.pos].every(Number.isFinite)).toBe(true)
  })

  it('todos no mesmo ponto se separam sem NaN', () => {
    const sim = createSimulation(50, [], new Float64Array(100))
    for (let i = 0; i < 200; i++) sim.step()
    expect([...sim.pos].every(Number.isFinite)).toBe(true)
    const xs = new Set(Array.from({ length: 50 }, (_, i) => `${sim.pos[i * 2].toFixed(1)},${sim.pos[i * 2 + 1].toFixed(1)}`))
    expect(xs.size).toBe(50)
  })

  it('posição inicial curta demais é completada', () => {
    const sim = createSimulation(5, [], new Float64Array(4))
    sim.step()
    expect([...sim.pos].every(Number.isFinite)).toBe(true)
  })

  it('cargas altas e muitos nós desconectados não explodem', () => {
    const n = 800
    const sim = createSimulation(n, [], undefined, Float64Array.from({ length: n }, (_, i) => (i % 10 === 0 ? 6 : 1)))
    for (let i = 0; i < 300; i++) sim.step()
    const max = Math.max(...Array.from(sim.pos, Math.abs))
    expect(Number.isFinite(max)).toBe(true)
    expect(max).toBeLessThan(1e5)
  })

  it('reheat volta a mexer depois de assentar', () => {
    const sim = createSimulation(3, [{ source: 0, target: 1, length: 40, strength: 0.1 }])
    while (sim.step()) {
      /* assenta */
    }
    expect(sim.step()).toBe(false)
    sim.reheat(0.5)
    expect(sim.step()).toBe(true)
  })
})

describe('funções novas do grafo', () => {
  const d = (): AppData =>
    dataWith([
      board('Pentest ACME', [
        section('Recon', [entry('Varredura', { content: '<p>[[Portas abertas]]</p>' }), entry('Feita', { done: true })], [
          entry('Portas abertas'),
          entry('Isolada')
        ])
      ]),
      board('Projeto Atlas', [section('S', [], [entry('Arquitetura', { content: '<p>Varredura</p>' })])])
    ])

  it('um título repetido em qualquer lugar não vira ligação, mesmo com o outro oculto', () => {
    const data = d()
    data.workspaces[1].sections[0].checklist.push(entry('Portas abertas'))
    const semTarefas = buildGraph(data, { tasks: false })
    expect(semTarefas.links.filter((l) => l.kind === 'mentions')).toEqual([])
    const nota = semTarefas.nodes.find((n) => n.title === 'Portas abertas')!
    expect(whyNotLinkable(nota.title, semTarefas, nota.id)).toMatch(/mais de um/)
  })

  it('explica por que um título não pode ser citado', () => {
    const g = buildGraph(dataWith([board('B', [section('S', [], [entry('ssh'), entry('Sem título'), entry('Boa nota')])])]))
    const by = (t: string): string => g.nodes.find((n) => n.title === t)!.id
    expect(whyNotLinkable('ssh', g, by('ssh'))).toMatch(/curto/)
    expect(whyNotLinkable('Sem título', g, by('Sem título'))).toMatch(/genérico/)
    expect(whyNotLinkable('Boa nota', g, by('Boa nota'))).toBeNull()
  })

  it('oculta as tarefas concluídas', () => {
    const g = buildGraph(d(), { hideDone: true })
    expect(g.nodes.some((n) => n.title === 'Feita')).toBe(false)
    expect(g.nodes.some((n) => n.title === 'Varredura')).toBe(true)
  })

  it('vizinhança por profundidade', () => {
    const g = buildGraph(d())
    const id = (t: string): string => g.nodes.find((n) => n.title === t)!.id
    const titles = (s: Set<string>): string[] => [...s].map((x) => g.nodes.find((n) => n.id === x)!.title).sort()
    expect(titles(neighborhood(g, id('Portas abertas'), 1))).toEqual(['Pentest ACME', 'Portas abertas', 'Varredura'])
    // 2 passos: os outros itens do espaço e quem cita a Varredura.
    expect(titles(neighborhood(g, id('Portas abertas'), 2))).toEqual(['Arquitetura', 'Feita', 'Isolada', 'Pentest ACME', 'Portas abertas', 'Varredura'])
    const sub = subgraph(g, neighborhood(g, id('Isolada'), 1))
    expect(sub.nodes.map((n) => n.title).sort()).toEqual(['Isolada', 'Pentest ACME'])
    expect(sub.links).toHaveLength(1)
  })

  it('mais conectados e ligação existente', () => {
    const g = buildGraph(d())
    expect(mostConnected(g).map((n) => n.title)).toEqual(['Varredura', 'Arquitetura', 'Portas abertas'])
    const id = (t: string): string => g.nodes.find((n) => n.title === t)!.id
    expect(areLinked(g, id('Portas abertas'), id('Varredura'))).toBe(true)
    expect(areLinked(g, id('Isolada'), id('Varredura'))).toBe(false)
  })

  it('a menção nova entra como [[Título]] escapado, e vira ligação', () => {
    expect(withMention('<p>Texto</p>', 'A <b> & c')).toBe('<p>Texto</p><p>[[A &lt;b&gt; &amp; c]]</p>')
    expect(withMention('<p></p>', 'Nota')).toBe('<p>[[Nota]]</p>')
    const data = d()
    const iso = data.workspaces[0].sections[0].notes[1]
    iso.content = withMention(iso.content, 'Arquitetura')
    const g = buildGraph(data)
    const id = (t: string): string => g.nodes.find((n) => n.title === t)!.id
    expect(areLinked(g, id('Isolada'), id('Arquitetura'))).toBe(true)
  })
})
