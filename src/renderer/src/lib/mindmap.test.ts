import { describe, expect, it } from 'vitest'
import type { MindMap, MindNode } from '../types'
import {
  adoptTopics,
  addChild,
  addSibling,
  countNodes,
  createTopic,
  findNode,
  generateMindMap,
  keepContent,
  moveBy,
  moveTopic,
  removeTopic,
  renameTopic,
  reparentTopic,
  resetMoved,
  setTopicDone,
  moveNode,
  nodeUrl,
  normalizeUrl,
  parentOf,
  removeNode,
  reparent,
  setAllCollapsed,
  syncMindMap,
  updateNode
} from './mindmap'
import { bounds, edgePath, layoutMindMap, nearest, type Box } from './mindmapLayout'
import { normalizeData, parseImport } from './importData'
import { duplicateBoard } from './ops'
import { cloneSections, progress } from './util'
import { board, entry, makeData, section } from './testing'

const node = (id: string, text: string, children: MindNode[] = []): MindNode => ({ id, text, children })
const tree = (): MindMap => ({
  root: node('r', 'TecInv', [node('a', 'Exemplo de um ataque', [node('a1', 'subfinder'), node('a2', 'gobuster')]), node('b', 'Diretórios')])
})

describe('gerar a partir do espaço', () => {
  it('põe o espaço na raiz, as seções nos ramos e tarefas e notas nas folhas', () => {
    const b = makeData().workspaces[0]
    const map = generateMindMap(b)
    expect(map.root.text).toBe('Pentest ACME')
    expect(map.root.children.map((c) => c.text)).toEqual(['Recon', 'Exploração'])
    expect(map.root.children[0].children.map((c) => c.text)).toEqual(['Rodar nmap', 'Enumerar subdomínios', 'Achados'])
    expect(map.root.children[0].children[2].ref).toEqual({ sectionId: b.sections[0].id, list: 'notes', entryId: b.sections[0].notes[0].id })
  })

  it('gera os mesmos ids de novo (a seleção não se perde quando o espaço muda)', () => {
    const b = makeData().workspaces[0]
    expect(generateMindMap(b)).toEqual(generateMindMap(b))
  })

  it('recolhe seções com muitos itens', () => {
    const many = board('Grande', [section('Lista', Array.from({ length: 20 }, (_, i) => entry(`Item ${i}`)))])
    expect(generateMindMap(many).root.children[0].collapsed).toBe(true)
  })
})

describe('atualizar do espaço', () => {
  it('acrescenta só o que falta, embaixo da seção certa, mesmo que ela tenha sido movida', () => {
    const b = makeData().workspaces[0]
    let map = generateMindMap(b)
    // A pessoa levou "Exploração" para dentro de "Recon" e apagou uma tarefa do mapa.
    map = reparent(map, `s:${b.sections[1].id}`, `s:${b.sections[0].id}`)
    map = removeNode(map, `e:${b.sections[0].checklist[0].id}`)
    b.sections[1].notes.push(entry('Payloads'))
    b.sections.push(section('Relatório', [entry('Escrever')]))

    const r = syncMindMap(map, b)
    expect(r.added).toBe(4) // a tarefa apagada, a nota nova, a seção nova e o item dela
    const explo = findNode(r.map.root, `s:${b.sections[1].id}`)!
    expect(explo.children.map((c) => c.text)).toEqual(['Testar SQLi', 'Payloads'])
    expect(r.map.root.children.at(-1)!.text).toBe('Relatório')
    expect(r.map.root.children.at(-1)!.children.map((c) => c.text)).toEqual(['Escrever'])
    expect(syncMindMap(r.map, b)).toEqual({ map: r.map, added: 0 })
  })
})

describe('edição', () => {
  it('cria filhos e irmãos e abre o pai recolhido', () => {
    const collapsed = updateNode(tree(), 'a', { collapsed: true })
    const c = addChild(collapsed, 'a', 'httpx')
    expect(findNode(c.map.root, 'a')!.collapsed).toBeUndefined()
    expect(findNode(c.map.root, 'a')!.children.map((n) => n.text)).toEqual(['subfinder', 'gobuster', 'httpx'])
    const s = addSibling(tree(), 'a1', 'aquatone')
    expect(findNode(s.map.root, 'a')!.children.map((n) => n.text)).toEqual(['subfinder', 'aquatone', 'gobuster'])
    // Irmão da raiz vira filho.
    expect(addSibling(tree(), 'r').map.root.children).toHaveLength(3)
  })

  it('apaga o ramo inteiro, mas nunca a raiz', () => {
    expect(countNodes(removeNode(tree(), 'a').root)).toBe(2)
    expect(removeNode(tree(), 'r')).toEqual(tree())
  })

  it('reordena entre irmãos sem passar das pontas', () => {
    expect(moveNode(tree(), 'b', -1).root.children.map((n) => n.id)).toEqual(['b', 'a'])
    const t = tree()
    expect(moveNode(t, 'a', -1)).toBe(t)
  })

  it('muda de pai, mas não para dentro do próprio ramo', () => {
    const moved = reparent(tree(), 'a2', 'b')
    expect(parentOf(moved.root, 'a2')!.id).toBe('b')
    const t = tree()
    expect(reparent(t, 'a', 'a1')).toBe(t)
    expect(reparent(t, 'r', 'b')).toBe(t)
  })

  it('apaga campos vazios em vez de guardar "" ou false', () => {
    let m = updateNode(tree(), 'a1', { note: 'texto', url: 'https://x.dev', filled: true, color: '#ef4444' })
    m = updateNode(m, 'a1', { note: '', url: undefined, filled: false })
    expect(findNode(m.root, 'a1')).toEqual({ id: 'a1', text: 'subfinder', children: [], color: '#ef4444' })
  })

  it('recolhe tudo (menos a raiz) e expande tudo', () => {
    const closed = setAllCollapsed(tree(), true)
    expect(closed.root.collapsed).toBeUndefined()
    expect(findNode(closed.root, 'a')!.collapsed).toBe(true)
    expect(findNode(closed.root, 'b')!.collapsed).toBeUndefined() // sem filhos
    expect(setAllCollapsed(closed, false)).toEqual(tree())
  })
})

describe('links', () => {
  it('completa o endereço e recusa o que não é http', () => {
    expect(normalizeUrl('github.com/projectdiscovery/subfinder')).toBe('https://github.com/projectdiscovery/subfinder')
    expect(normalizeUrl(' https://developer.mozilla.org/pt-BR/ ')).toBe('https://developer.mozilla.org/pt-BR/')
    expect(normalizeUrl('javascript:alert(1)')).toBeUndefined()
    expect(normalizeUrl('file:///C:/x')).toBeUndefined()
    expect(normalizeUrl('não é link')).toBeUndefined()
  })

  it('um tópico que é só um endereço vira link', () => {
    expect(nodeUrl(node('x', 'https://github.com/OJ/gobuster'))).toBe('https://github.com/OJ/gobuster')
    expect(nodeUrl(node('x', 'veja https://github.com'))).toBeUndefined()
    expect(nodeUrl({ ...node('x', 'gobuster'), url: 'javascript:alert(1)' })).toBeUndefined()
  })
})

describe('salvar, importar e duplicar', () => {
  it('o mapa sobrevive ao carregar os dados', () => {
    const data = makeData()
    const b = data.workspaces[0]
    b.mindmap = { ...updateNode(generateMindMap(b), `s:${b.sections[0].id}`, { note: 'nota', color: '#3b82f6', filled: true }), layout: 'radial', lineWidth: 3 }
    const loaded = normalizeData(JSON.parse(JSON.stringify(data)))!
    expect(loaded.workspaces[0].mindmap).toEqual(b.mindmap)
  })

  it('na importação os ids mudam, e o mapa continua ligado às seções e itens novos', () => {
    const data = makeData()
    const b = data.workspaces[0]
    b.mindmap = generateMindMap(b)
    const imported = parseImport(JSON.stringify(data)).workspaces[0]
    expect(imported.sections[0].id).not.toBe(b.sections[0].id)
    const leaf = imported.mindmap!.root.children[0].children[2]
    expect(leaf.ref).toEqual({ sectionId: imported.sections[0].id, list: 'notes', entryId: imported.sections[0].notes[0].id })
  })

  it('descarta o que não presta num arquivo editado à mão', () => {
    const data = makeData() as unknown as Record<string, unknown>
    const ws = (data.workspaces as Record<string, unknown>[])[0]
    ws.mindmap = {
      layout: 'espiral',
      lineWidth: 99,
      root: { id: 'r', text: 'Raiz', children: [{ id: 'r', text: 'id repetido', children: 'x' }, 'lixo', { text: 3, ref: { sectionId: 'nao-existe' } }] }
    }
    const map = normalizeData(data)!.workspaces[0].mindmap!
    expect(map.layout).toBeUndefined()
    expect(map.lineWidth).toBeUndefined()
    expect(map.root.children).toHaveLength(2)
    expect(map.root.children[0].id).not.toBe('r')
    expect(map.root.children[0].children).toEqual([])
    expect(map.root.children[1].ref).toBeUndefined()
  })

  it('duplicar o espaço leva o mapa, ligado à cópia', () => {
    const data = makeData()
    const b = data.workspaces[0]
    b.mindmap = generateMindMap(b)
    const copyId = duplicateBoard(data, 'workspace', b.id)!
    const copy = data.workspaces.find((w) => w.id === copyId)!
    expect(copy.mindmap!.root.children[1].ref).toEqual({ sectionId: copy.sections[1].id })
    expect(copy.mindmap!.root.children[0].children[0].ref!.entryId).toBe(copy.sections[0].checklist[0].id)
  })
})

describe('layout', () => {
  const big: MindMap = {
    root: node('r', 'TecInv', [
      node('a', 'Exemplo de um ataque', [node('a1', 'subfinder | httpx'), node('a2', 'gau'), node('a3', 'aquatone')]),
      node('b', 'Descobrindo diretórios', [node('b1', 'Conhecendo a aplicação', [node('b11', 'No braço'), node('b12', 'Automatização')]), node('b2', 'Parâmetros')]),
      node('c', 'Comandos Linux'),
      node('d', 'Ferramentas', [node('d1', 'seclist'), node('d2', 'dirb')]),
      node('e', 'Envio via SSH')
    ])
  }
  const sizeOf = (n: MindNode): { w: number; h: number } => ({ w: 40 + n.text.length * 6, h: n.id === 'r' ? 40 : 30 })
  const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

  for (const layout of ['map', 'right', 'down', 'radial'] as const) {
    it(`${layout}: nenhum tópico encosta em outro`, () => {
      const placed = [...layoutMindMap(big.root, sizeOf, layout).values()]
      expect(placed).toHaveLength(countNodes(big.root))
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(overlap(placed[i].box, placed[j].box)).toBe(false)
    })
  }

  it('map: ramos dos dois lados da raiz, filhos depois da borda do pai', () => {
    const p = layoutMindMap(big.root, sizeOf, 'map')
    const root = p.get('r')!.box
    const sides = big.root.children.map((c) => p.get(c.id)!.side)
    expect(sides).toContain('right')
    expect(sides).toContain('left')
    for (const c of big.root.children) {
      const b = p.get(c.id)!
      if (b.side === 'right') expect(b.box.x).toBeGreaterThan(root.x + root.w)
      else expect(b.box.x + b.box.w).toBeLessThan(root.x)
    }
  })

  it('tópicos recolhidos não entram', () => {
    const p = layoutMindMap(updateNode(big, 'b', { collapsed: true }).root, sizeOf, 'right')
    expect(p.has('b')).toBe(true)
    expect(p.has('b1')).toBe(false)
    expect(p.has('b11')).toBe(false)
  })

  it('a linha sai da borda do pai e chega na borda do filho', () => {
    const p = layoutMindMap(big.root, sizeOf, 'right')
    const a = p.get('a')!
    const a1 = p.get('a1')!
    const d = edgePath(a.box, a1)
    expect(d.startsWith(`M${(a.box.x + a.box.w).toFixed(1)} `)).toBe(true)
    expect(d.endsWith(`${a1.box.x.toFixed(1)} ${(a1.box.y + a1.box.h / 2).toFixed(1)}`)).toBe(true)
  })

  it('setas: direita vai ao filho, baixo ao próximo irmão', () => {
    const p = layoutMindMap(big.root, sizeOf, 'right')
    expect(['a1', 'a2', 'a3']).toContain(nearest(p, 'a', 'right'))
    expect(nearest(p, 'a1', 'down')).toBe('a2')
    expect(nearest(p, 'a1', 'left')).toBe('a')
    expect(bounds(p)!.w).toBeGreaterThan(0)
  })
})

describe('ligação com o espaço', () => {
  /** Recon: nmap (com o subitem "Portas altas"), subdomínios; nota Achados. */
  const setup = () => {
    const b = makeData().workspaces[0]
    const recon = b.sections[0]
    recon.checklist.push(entry('Portas altas', { done: false, parentId: recon.checklist[0].id }))
    return { b, recon, map: generateMindMap(b) }
  }

  it('subitens ficam embaixo do item pai, também quando o pai vem depois na lista', () => {
    const { b, recon, map } = setup()
    expect(findNode(map.root, `e:${recon.checklist[0].id}`)!.children.map((c) => c.text)).toEqual(['Portas altas'])
    // Filho antes do pai na lista guardada.
    recon.checklist.unshift(recon.checklist.pop()!)
    expect(findNode(generateMindMap(b).root, `e:${recon.checklist[1].id}`)!.children.map((c) => c.text)).toEqual(['Portas altas'])
  })

  it('o mapa acompanha o espaço: títulos novos, itens excluídos saem e os filhos deles sobem', () => {
    const { b, recon, map } = setup()
    const withFree = addChild(map, `e:${recon.checklist[0].id}`, 'ideia solta').map
    recon.checklist[1].title = 'Subdomínios (amass)'
    b.title = 'ACME 2'
    recon.checklist.splice(0, 1) // nmap excluído no espaço; "Portas altas" fica sem pai
    const next = syncMindMap(withFree, b).map
    expect(next.root.text).toBe('ACME 2')
    const reconNode = findNode(next.root, `s:${recon.id}`)!
    expect(reconNode.children.map((c) => c.text)).toEqual(['Portas altas', 'ideia solta', 'Subdomínios (amass)', 'Achados'])
    expect(syncMindMap(next, b).map).toBe(next)
  })

  it('um item movido para outra seção no espaço continua com o mesmo tópico', () => {
    const { b, recon, map } = setup()
    const moved = recon.checklist.splice(1, 1)[0]
    b.sections[1].checklist.push(moved)
    const next = syncMindMap(map, b).map
    const n = findNode(next.root, `e:${moved.id}`)!
    expect(n.ref).toEqual({ sectionId: b.sections[1].id, list: 'checklist', entryId: moved.id })
    expect(parentOf(next.root, n.id)!.id).toBe(`s:${recon.id}`) // fica onde a pessoa deixou no mapa
  })

  it('criar embaixo da raiz faz uma seção; embaixo da seção, uma tarefa; embaixo de uma tarefa, um subitem', () => {
    const { b, recon, map } = setup()
    const s1 = createTopic(map, b.sections, 'child', 'root')
    expect(s1.sections.length).toBe(3)
    expect(findNode(s1.map.root, s1.id!)!.ref).toEqual({ sectionId: s1.sections[2].id })

    const t = createTopic(map, b.sections, 'child', `s:${recon.id}`)
    const task = t.sections[0].checklist.at(-1)!
    expect(task).toMatchObject({ title: 'Novo tópico', done: false })
    expect(task.parentId).toBeUndefined()

    const sub = createTopic(map, b.sections, 'child', `e:${recon.checklist[1].id}`)
    const child = sub.sections[0].checklist.at(-1)!
    expect(child.parentId).toBe(recon.checklist[1].id)
    expect(parentOf(sub.map.root, sub.id!)!.id).toBe(`e:${recon.checklist[1].id}`)

    const note = createTopic(map, b.sections, 'child', `s:${recon.id}`, 'notes')
    expect(note.sections[0].notes.map((e) => e.title)).toEqual(['Achados', 'Novo tópico'])
    // Os dados originais não mudam (servem para desfazer).
    expect(recon.checklist.length).toBe(3)
  })

  it('irmão de uma tarefa entra logo depois dela, no mapa e na lista', () => {
    const { b, recon, map } = setup()
    const r = createTopic(map, b.sections, 'sibling', `e:${recon.checklist[0].id}`)
    expect(r.sections[0].checklist.map((e) => e.title)).toEqual(['Rodar nmap', 'Novo tópico', 'Enumerar subdomínios', 'Portas altas'])
    expect(findNode(r.map.root, `s:${recon.id}`)!.children[1].id).toBe(r.id)
  })

  it('embaixo de um tópico solto, o novo também é solto', () => {
    const { b, map } = setup()
    const free = addChild(map, 'root', 'Ideias').map
    const freeId = free.root.children.at(-1)!.id
    const r = createTopic(free, b.sections, 'child', freeId)
    expect(r.sections).toBe(b.sections)
    expect(findNode(r.map.root, r.id!)!.ref).toBeUndefined()
  })

  it('renomear e marcar mudam o item do espaço', () => {
    const { b, recon, map } = setup()
    const id = `e:${recon.checklist[1].id}`
    const r = renameTopic(map, b.sections, id, 'Subdomínios')
    expect(r.sections[0].checklist[1].title).toBe('Subdomínios')
    expect(findNode(r.map.root, id)!.text).toBe('Subdomínios')
    const sec = renameTopic(map, b.sections, `s:${recon.id}`, 'Reconhecimento')
    expect(sec.sections[0].title).toBe('Reconhecimento')

    const done = setTopicDone(b.sections, findNode(map.root, id)!, true)
    expect(done[0].checklist[1].done).toBe(true)
    expect(setTopicDone(b.sections, findNode(map.root, `e:${recon.notes[0].id}`)!, true)).toBe(b.sections)
  })

  it('excluir manda os itens do ramo para a lixeira e sobe os subitens que estavam fora dele', () => {
    const { b, recon, map } = setup()
    const nmap = recon.checklist[0]
    // "Portas altas" foi levado para "Achados" no mapa (o pai continua sendo nmap no espaço).
    const moved = reparent(map, `e:${recon.checklist[2].id}`, `e:${recon.notes[0].id}`)
    const r = removeTopic(moved, b.sections, `e:${nmap.id}`)
    expect(r.trashed).toEqual([{ kind: 'entry', sectionId: recon.id, list: 'checklist', entryId: nmap.id }])
    expect(r.sections[0].checklist.map((e) => [e.title, e.parentId])).toEqual([
      ['Enumerar subdomínios', undefined],
      ['Portas altas', undefined]
    ])

    const all = removeTopic(map, b.sections, `s:${recon.id}`)
    expect(all.trashed).toEqual([{ kind: 'section', sectionId: recon.id }])
    expect(all.sections.map((s) => s.title)).toEqual(['Exploração'])
    expect(findNode(all.map.root, `e:${nmap.id}`)).toBeUndefined()
  })

  it('arrastar um item para outro vira subitem e leva os subitens junto para a outra seção', () => {
    const { b, recon, map } = setup()
    const nmap = recon.checklist[0]
    const sqli = b.sections[1].checklist[0]
    const r = reparentTopic(map, b.sections, `e:${nmap.id}`, `e:${sqli.id}`)
    expect(r.sections[0].checklist.map((e) => e.title)).toEqual(['Enumerar subdomínios'])
    expect(r.sections[1].checklist.map((e) => [e.title, e.parentId])).toEqual([
      ['Testar SQLi', undefined],
      ['Rodar nmap', sqli.id],
      ['Portas altas', nmap.id]
    ])
    expect(findNode(r.map.root, `e:${recon.checklist[2].id}`)!.ref!.sectionId).toBe(b.sections[1].id)

    // De volta para baixo de uma seção: deixa de ser subitem.
    const back = reparentTopic(r.map, r.sections, `e:${nmap.id}`, `s:${recon.id}`)
    expect(back.sections[0].checklist.find((e) => e.id === nmap.id)!.parentId).toBeUndefined()
  })

  it('Ctrl+↑/↓ reordena também a lista do espaço', () => {
    const { b, recon, map } = setup()
    const r = moveTopic(map, b.sections, `e:${recon.checklist[1].id}`, -1)
    expect(r.sections[0].checklist.map((e) => e.title)).toEqual(['Enumerar subdomínios', 'Rodar nmap', 'Portas altas'])
    const s = moveTopic(map, b.sections, `s:${recon.id}`, 1)
    expect(s.sections.map((x) => x.title)).toEqual(['Exploração', 'Recon'])
  })

  it('desfazer volta as seções, mas guarda o texto escrito depois nas notas', () => {
    const { b } = setup()
    const past = b.sections
    const now = createTopic(generateMindMap(b), past, 'child', `s:${past[0].id}`).sections
    const edited = now.map((s, i) => (i === 0 ? { ...s, notes: [{ ...s.notes[0], content: '<p>novo</p>' }] } : s))
    expect(keepContent(past, edited)[0].notes[0].content).toBe('<p>novo</p>')
    expect(keepContent(past, past)).toBe(past)
  })

  it('copiar seções aponta os subitens para as cópias dos pais', () => {
    const { b } = setup()
    const [copy] = cloneSections(b.sections)
    expect(copy.checklist[2].parentId).toBe(copy.checklist[0].id)
  })

  it('a importação troca o parentId pelo id novo do pai', () => {
    const { b } = setup()
    const text = JSON.stringify({ version: 1, workspaces: [b], libraries: [], templates: [], snippetGroups: [] })
    const imported = parseImport(text).workspaces[0].sections[0].checklist
    expect(imported[2].parentId).toBe(imported[0].id)
    expect(imported[0].id).not.toBe(b.sections[0].checklist[0].id)
  })
})

describe('tópicos arrastados', () => {
  const size = () => ({ w: 80, h: 30 })

  it('o tópico vai com o ramo inteiro, e só no arranjo em que foi arrastado', () => {
    const m = moveBy(tree(), 'map', 'a', 100, -40)
    const base = layoutMindMap(m.root, size, 'map')
    const shifted = layoutMindMap(m.root, size, 'map', m.moved?.map)
    for (const id of ['a', 'a1', 'a2']) {
      expect(shifted.get(id)!.box.x - base.get(id)!.box.x).toBe(100)
      expect(shifted.get(id)!.box.y - base.get(id)!.box.y).toBe(-40)
    }
    expect(shifted.get('b')!.box).toEqual(base.get('b')!.box)
    expect(m.moved?.right).toBeUndefined()
    expect(moveBy(m, 'map', 'a', 5, 5).moved!.map!.a).toEqual([105, -35])
  })

  it('voltar ao lugar automático limpa o que sobrou', () => {
    const m = moveBy(moveBy(tree(), 'map', 'a', 10, 0), 'map', 'b', 0, 10)
    expect(resetMoved(m, 'map', 'a').moved).toEqual({ map: { b: [0, 10] } })
    expect(resetMoved(resetMoved(m, 'map', 'a'), 'map', 'b').moved).toBeUndefined()
    expect(resetMoved(m, 'map').moved).toBeUndefined()
    expect(resetMoved(tree(), 'map')).toEqual(tree())
  })

  it('arrastado para o outro lado do pai, a linha sai do outro lado', () => {
    const from: Box = { x: 0, y: 0, w: 80, h: 30 }
    const path = edgePath(from, { box: { x: -200, y: 0, w: 80, h: 30 }, depth: 1, side: 'right', parent: 'r' })
    expect(path.startsWith('M0.0 15.0')).toBe(true)
    expect(path.endsWith('-120.0 15.0')).toBe(true)
  })

  it('a importação guarda as posições válidas e descarta o resto', () => {
    const b = board('X', [], {
      mindmap: { ...tree(), moved: { map: { a: [10, 20], zz: [1, 1], b: ['x', 1] }, foo: { a: [1, 1] } } } as never
    })
    const data = normalizeData({ ...makeData(), workspaces: [b] })
    expect(data!.workspaces[0].mindmap!.moved).toEqual({ map: { a: [10, 20] } })
  })
})

describe('subitens', () => {
  it('subitem não é tarefa: sem "concluído" e fora do progresso', () => {
    const b = makeData().workspaces[0]
    const map = generateMindMap(b)
    const before = progress(b.sections)
    const r = createTopic(map, b.sections, 'child', `e:${b.sections[0].checklist[1].id}`)
    const sub = r.sections[0].checklist.at(-1)!
    expect(sub.parentId).toBe(b.sections[0].checklist[1].id)
    expect('done' in sub).toBe(false)
    expect(progress(r.sections)).toEqual(before)
  })

  it('um subitem fica na lista do pai: tarefa solta sobre uma nota vai para as notas', () => {
    const b = makeData().workspaces[0]
    const recon = b.sections[0]
    const task = recon.checklist[1]
    const r = reparentTopic(generateMindMap(b), b.sections, `e:${task.id}`, `e:${recon.notes[0].id}`)
    expect(r.sections[0].checklist.map((e) => e.id)).not.toContain(task.id)
    const moved = r.sections[0].notes.find((e) => e.id === task.id)!
    expect(moved.parentId).toBe(recon.notes[0].id)
    expect('done' in moved).toBe(false)
    expect(findNode(r.map.root, `e:${task.id}`)!.ref!.list).toBe('notes')
    // De volta para a seção: volta a ser tarefa (pendente), mas continua nas notas até alguém mover.
    const back = reparentTopic(r.map, r.sections, `e:${task.id}`, `s:${recon.id}`)
    expect(back.sections[0].notes.find((e) => e.id === task.id)!.parentId).toBeUndefined()
  })

  it('tópicos soltos embaixo de seções e tarefas (mapas antigos) viram itens; os da raiz ficam no mapa', () => {
    const b = makeData().workspaces[0]
    const recon = b.sections[0]
    let map = generateMindMap(b)
    map = addChild(map, `e:${recon.checklist[0].id}`, 'porta 22').map
    const portId = findNode(map.root, `e:${recon.checklist[0].id}`)!.children[0].id
    map = addChild(map, portId, 'ssh fraco').map
    map = addChild(map, `s:${recon.id}`, 'Whois').map
    map = addChild(map, 'root', 'Ideias').map

    const r = adoptTopics(map, b.sections)!
    const list = r.sections[0].checklist
    const port = list.find((e) => e.title === 'porta 22')!
    expect(port.parentId).toBe(recon.checklist[0].id)
    expect(list.find((e) => e.title === 'ssh fraco')!.parentId).toBe(port.id)
    expect(list.find((e) => e.title === 'Whois')).toMatchObject({ done: false })
    expect(findNode(r.map.root, portId)!.ref).toEqual({ sectionId: recon.id, list: 'checklist', entryId: port.id })
    expect(r.map.root.children.at(-1)!.ref).toBeUndefined()
    expect(adoptTopics(r.map, r.sections)).toBeNull()
  })
})
