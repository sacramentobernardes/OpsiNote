/**
 * Mapa mental de um espaço ou biblioteca: uma árvore com o espaço na raiz.
 *
 * O mapa e o espaço andam juntos. As seções viram ramos, as tarefas e notas viram tópicos, e
 * os subitens (`parentId`) ficam embaixo do item pai. Criar, renomear, marcar, mover ou excluir
 * um tópico ligado muda o item do espaço (ver "Ligação com o espaço"), e o que muda no espaço
 * aparece no mapa (syncMindMap). Tópicos soltos, sem item, existem só no mapa.
 *
 * Enquanto ninguém o edita, o mapa é só gerado; na primeira edição ele é salvo no espaço, com a
 * aparência, os tópicos soltos e as posições arrastadas.
 *
 * Todas as funções devolvem dados novos (os anteriores servem para desfazer).
 */
import { produce } from 'immer'
import type { Board, Entry, ListType, MindLayout, MindMap, MindNode, MindRef, Section } from '../types'
import { newId } from './util'

export const NEW_TOPIC = 'Novo tópico'
/** Seções com mais itens que isto começam recolhidas. */
const COLLAPSE_OVER = 12
const LISTS: ListType[] = ['checklist', 'notes']

/* ---------- Gerar e atualizar a partir do espaço ---------- */

const refKey = (r: MindRef): string => (r.entryId ? `e:${r.entryId}` : `s:${r.sectionId}`)

interface Located {
  section: Section
  list: ListType
  entry: Entry
}

/** Onde está cada item do espaço, pelo id (um item movido de seção continua achável). */
function indexSections(sections: Section[]): { sections: Map<string, Section>; entries: Map<string, Located> } {
  const bySection = new Map<string, Section>()
  const entries = new Map<string, Located>()
  for (const section of sections) {
    bySection.set(section.id, section)
    for (const list of LISTS) for (const entry of section[list]) entries.set(entry.id, { section, list, entry })
  }
  return { sections: bySection, entries }
}

/** O mapa de um espaço que ainda não tem um. Os ids vêm das seções e itens (`s:…`, `e:…`). */
export function generateMindMap(board: Board): MindMap {
  return syncMindMap({ root: { id: 'root', text: board.title, children: [] } }, board).map
}

/**
 * Deixa o mapa igual ao espaço: os títulos são os dos itens, os tópicos de itens excluídos saem
 * (os filhos deles sobem um nível, para tópicos soltos não sumirem junto) e os itens sem tópico
 * entram embaixo do item pai ou da seção. Sem nada a mudar, devolve o mesmo mapa.
 */
export function syncMindMap(map: MindMap, board: Board): { map: MindMap; added: number } {
  const at = indexSections(board.sections)
  let added = 0
  const next = produce(map, (d) => {
    if (d.root.text !== board.title) d.root.text = board.title
    // Atualiza ou tira os tópicos ligados (de baixo para cima: filhos que sobem já estão prontos).
    const refresh = (n: MindNode): boolean => {
      const ref = n.ref
      if (!ref) return true
      if (ref.entryId) {
        const found = at.entries.get(ref.entryId)
        if (!found) return false
        if (ref.sectionId !== found.section.id) ref.sectionId = found.section.id
        if (ref.list !== found.list) ref.list = found.list
        if (n.text !== found.entry.title) n.text = found.entry.title
        return true
      }
      const section = at.sections.get(ref.sectionId)
      if (!section) return false
      if (n.text !== section.title) n.text = section.title
      return true
    }
    const prune = (n: MindNode): void => {
      for (let i = 0; i < n.children.length; i++) {
        const c = n.children[i]
        prune(c)
        if (!refresh(c)) {
          n.children.splice(i, 1, ...c.children)
          i += c.children.length - 1
        }
      }
    }
    prune(d.root)

    const have = new Map<string, MindNode>()
    const ids = new Set<string>()
    walk(d.root, (n) => {
      ids.add(n.id)
      if (n.ref && !have.has(refKey(n.ref))) have.set(refKey(n.ref), n)
    })
    const idFor = (key: string): string => {
      if (ids.has(key)) return newId()
      ids.add(key)
      return key
    }
    for (const s of board.sections) {
      let sectionNode = have.get(`s:${s.id}`)
      const isNew = !sectionNode
      if (!sectionNode) {
        sectionNode = { id: idFor(`s:${s.id}`), text: s.title, children: [], ref: { sectionId: s.id } }
        d.root.children.push(sectionNode)
        have.set(`s:${s.id}`, sectionNode)
        added++
      }
      // Os pais antes dos filhos; um pai que ainda falta entra numa volta seguinte.
      const pending = LISTS.flatMap((list) => s[list].map((e) => ({ list, e }))).filter((x) => !have.has(`e:${x.e.id}`))
      const put = (list: ListType, e: Entry, under: MindNode): void => {
        const node: MindNode = { id: idFor(`e:${e.id}`), text: e.title, children: [], ref: { sectionId: s.id, list, entryId: e.id } }
        under.children.push(node)
        have.set(`e:${e.id}`, node)
        added++
      }
      for (let progress = true; pending.length && progress; ) {
        progress = false
        for (let i = 0; i < pending.length; i++) {
          const { list, e } = pending[i]
          const under = e.parentId && at.entries.has(e.parentId) ? have.get(`e:${e.parentId}`) : sectionNode
          if (!under) continue
          put(list, e, under)
          pending.splice(i--, 1)
          progress = true
        }
      }
      // Sobra só o que tem pai em ciclo (arquivo editado à mão): vai para a seção.
      for (const { list, e } of pending) put(list, e, sectionNode)
      if (isNew && sectionNode.children.length > COLLAPSE_OVER) sectionNode.collapsed = true
    }
  })
  return { map: next, added }
}

/**
 * Cópia do mapa para uma cópia do espaço, ligada às seções e itens dela (`ids`: antigo → novo).
 * Cópia simples (sem Immer), para servir também quando o original é um rascunho do store.
 */
export function copyMindMap(map: MindMap, ids: Map<string, string>): MindMap {
  const copy = (n: MindNode): MindNode => {
    const { ref, children, ...rest } = n
    const sectionId = ref && ids.get(ref.sectionId)
    const entryId = ref?.entryId && ids.get(ref.entryId)
    const linked = ref && sectionId && (!ref.entryId || entryId)
    return { ...rest, children: children.map(copy), ...(linked ? { ref: { ...ref, sectionId, ...(entryId ? { entryId } : {}) } } : {}) }
  }
  return { ...map, root: copy(map.root) }
}

/** Ids das seções e itens de um espaço e da cópia dele, na mesma ordem. */
export function copiedIds(from: Section[], to: Section[]): Map<string, string> {
  const ids = new Map<string, string>()
  from.forEach((s, i) => {
    const c = to[i]
    if (!c) return
    ids.set(s.id, c.id)
    for (const list of ['checklist', 'notes'] as const) s[list].forEach((e, j) => c[list][j] && ids.set(e.id, c[list][j].id))
  })
  return ids
}

/* ---------- Consultas ---------- */

export function walk(n: MindNode, visit: (n: MindNode, depth: number, parent: MindNode | null) => void, depth = 0, parent: MindNode | null = null): void {
  visit(n, depth, parent)
  for (const c of n.children) walk(c, visit, depth + 1, n)
}

export function findNode(root: MindNode, id: string): MindNode | undefined {
  if (root.id === id) return root
  for (const c of root.children) {
    const found = findNode(c, id)
    if (found) return found
  }
  return undefined
}

/** Pai do nó: null para a raiz, undefined se o nó não existe. */
export function parentOf(root: MindNode, id: string): MindNode | null | undefined {
  if (root.id === id) return null
  for (const c of root.children) {
    if (c.id === id) return root
    const found = parentOf(c, id)
    if (found !== undefined) return found
  }
  return undefined
}

export function countNodes(n: MindNode): number {
  return n.children.reduce((t, c) => t + countNodes(c), 1)
}

/** O endereço do nó: o link dele, ou o próprio texto quando é só um endereço. */
export function nodeUrl(n: MindNode): string | undefined {
  const url = n.url ? normalizeUrl(n.url) : undefined
  if (url) return url
  const t = n.text.trim()
  return /^https?:\/\/\S+$/i.test(t) ? t : undefined
}

/** "github.com/x" → "https://github.com/x". Só http e https; o resto vira undefined. */
export function normalizeUrl(input: string): string | undefined {
  const t = input.trim()
  if (!t || /\s/.test(t)) return undefined
  if (/^https?:\/\/[^/]/i.test(t)) return t
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return undefined
  return /^[^/]+\.[a-z]{2,}(\/|$)/i.test(t) ? `https://${t}` : undefined
}

/* ---------- Edição ---------- */

type Patch = Partial<Omit<MindNode, 'id' | 'children'>>

/** Muda campos do nó; `undefined` apaga o campo. */
export function updateNode(map: MindMap, id: string, patch: Patch): MindMap {
  return produce(map, (d) => {
    const n = findNode(d.root, id)
    if (!n) return
    for (const [k, v] of Object.entries(patch) as [keyof Patch, unknown][]) {
      if (k !== 'text' && (v === undefined || v === false || v === '')) delete n[k]
      else (n as unknown as Record<string, unknown>)[k] = v
    }
  })
}

export function updateMap(map: MindMap, patch: Partial<Omit<MindMap, 'root'>>): MindMap {
  return produce(map, (d) => {
    for (const [k, v] of Object.entries(patch) as [keyof typeof patch, unknown][]) {
      if (v === undefined) delete d[k]
      else (d as unknown as Record<string, unknown>)[k] = v
    }
  })
}

/** Novo filho no fim (ou em `index`); o pai se abre para mostrá-lo. */
export function addChild(map: MindMap, parentId: string, text = NEW_TOPIC, index?: number): { map: MindMap; id: string | null } {
  const id = newId()
  let ok = false
  const next = produce(map, (d) => {
    const p = findNode(d.root, parentId)
    if (!p) return
    delete p.collapsed
    p.children.splice(index ?? p.children.length, 0, { id, text, children: [] })
    ok = true
  })
  return ok ? { map: next, id } : { map, id: null }
}

/** Novo irmão logo depois do nó (na raiz, um filho). */
export function addSibling(map: MindMap, id: string, text = NEW_TOPIC): { map: MindMap; id: string | null } {
  const parent = parentOf(map.root, id)
  if (parent === undefined) return { map, id: null }
  if (parent === null) return addChild(map, id, text)
  return addChild(map, parent.id, text, parent.children.findIndex((c) => c.id === id) + 1)
}

/** Apaga o nó e tudo embaixo dele (a raiz fica). */
export function removeNode(map: MindMap, id: string): MindMap {
  if (map.root.id === id) return map
  return produce(map, (d) => {
    const p = parentOf(d.root, id)
    if (p) p.children = p.children.filter((c) => c.id !== id)
  })
}

/** Sobe (-1) ou desce (+1) entre os irmãos. */
export function moveNode(map: MindMap, id: string, delta: number): MindMap {
  const p = parentOf(map.root, id)
  if (!p) return map
  const from = p.children.findIndex((c) => c.id === id)
  const to = from + delta
  if (to < 0 || to >= p.children.length) return map
  return produce(map, (d) => {
    const list = findNode(d.root, p.id)!.children
    const [n] = list.splice(from, 1)
    list.splice(to, 0, n)
  })
}

/** Leva o nó para baixo de outro. Não vale para a raiz nem para dentro do próprio ramo. */
export function reparent(map: MindMap, id: string, parentId: string, index?: number): MindMap {
  const node = findNode(map.root, id)
  if (!node || id === map.root.id || findNode(node, parentId)) return map
  if (parentOf(map.root, id)?.id === parentId && index === undefined) return map
  return produce(map, (d) => {
    const from = parentOf(d.root, id)!
    const moving = from.children.find((c) => c.id === id)!
    from.children = from.children.filter((c) => c.id !== id)
    const to = findNode(d.root, parentId)!
    delete to.collapsed
    to.children.splice(index ?? to.children.length, 0, moving)
  })
}

/** Recolhe todos os ramos (a raiz continua aberta) ou abre todos. */
export function setAllCollapsed(map: MindMap, collapsed: boolean): MindMap {
  return produce(map, (d) => {
    walk(d.root, (n, depth) => {
      if (collapsed && depth > 0 && n.children.length) n.collapsed = true
      else delete n.collapsed
    })
  })
}

/* ---------- Posições arrastadas ---------- */

/** Soma (dx, dy) ao deslocamento do tópico no arranjo; o ramo dele vai junto. */
export function moveBy(map: MindMap, layout: MindLayout, id: string, dx: number, dy: number): MindMap {
  if (!dx && !dy) return map
  return produce(map, (d) => {
    const moved = (d.moved ??= {})
    const byId = (moved[layout] ??= {})
    const [x, y] = byId[id] ?? [0, 0]
    byId[id] = [Math.round(x + dx), Math.round(y + dy)]
  })
}

/** Volta o tópico (ou, sem `id`, todos) para o lugar automático do arranjo. */
export function resetMoved(map: MindMap, layout: MindLayout, id?: string): MindMap {
  const byId = map.moved?.[layout]
  if (!byId || (id && !byId[id])) return map
  return produce(map, (d) => {
    const moved = d.moved!
    if (id) delete moved[layout]![id]
    if (!id || !Object.keys(moved[layout]!).length) delete moved[layout]
    if (!Object.keys(moved).length) delete d.moved
  })
}

/* ---------- Ligação com o espaço ---------- */

/**
 * Resultado de uma edição que também muda o espaço: o mapa novo, as seções novas e o que foi
 * excluído (o store manda para a lixeira antes de gravar as seções).
 */
export interface Change {
  map: MindMap
  sections: Section[]
  trashed?: Trashed[]
  /** Tópico criado. */
  id?: string
}

export type Trashed = { kind: 'section'; sectionId: string } | { kind: 'entry'; sectionId: string; list: ListType; entryId: string }

/** A seção e o item ligados ao tópico, se ainda existem. */
export function linkedItem(sections: Section[], n: MindNode): { section?: Section; list?: ListType; entry?: Entry } {
  if (!n.ref) return {}
  if (n.ref.entryId) {
    const found = indexSections(sections).entries.get(n.ref.entryId)
    return found ? { section: found.section, list: found.list, entry: found.entry } : {}
  }
  return { section: sections.find((s) => s.id === n.ref!.sectionId) }
}

/** O que um tópico novo embaixo de `parent` vira no espaço. */
type Place = { kind: 'section' } | { kind: 'entry'; sectionId: string; list: ListType; parentId?: string } | { kind: 'free' }

function placeUnder(map: MindMap, sections: Section[], parent: MindNode, list?: ListType): Place {
  if (parent.id === map.root.id) return { kind: 'section' }
  const { section, list: parentList, entry } = linkedItem(sections, parent)
  if (!section) return { kind: 'free' }
  if (!entry) return { kind: 'entry', sectionId: section.id, list: list ?? 'checklist' }
  return { kind: 'entry', sectionId: section.id, list: parentList!, parentId: entry.id }
}

/**
 * Cria um tópico. Embaixo da raiz ele vira uma seção; embaixo de uma seção, uma tarefa (ou nota,
 * com `list`); embaixo de um item, um subitem dele. Embaixo de um tópico solto, fica solto.
 */
export function createTopic(map: MindMap, sections: Section[], how: 'child' | 'sibling', fromId: string, list?: ListType): Change {
  const from = findNode(map.root, fromId)
  if (!from) return { map, sections }
  const asChild = how === 'child' || fromId === map.root.id
  const parent = asChild ? from : parentOf(map.root, fromId)
  if (!parent) return { map, sections }
  const index = asChild ? undefined : parent.children.findIndex((c) => c.id === fromId) + 1
  const place = placeUnder(map, sections, parent, list)
  const after = asChild ? {} : linkedItem(sections, from)

  let ref: MindRef | undefined
  let nextSections = sections
  if (place.kind === 'section') {
    const section: Section = { id: newId(), title: NEW_TOPIC, checklist: [], notes: [] }
    const at = after.section && !after.entry ? sections.indexOf(after.section) + 1 : sections.length
    nextSections = [...sections.slice(0, at), section, ...sections.slice(at)]
    ref = { sectionId: section.id }
  } else if (place.kind === 'entry') {
    const entry: Entry = {
      id: newId(),
      title: NEW_TOPIC,
      content: '',
      // Subitem não é tarefa: fica embaixo do pai, sem "concluído".
      ...(place.parentId ? { parentId: place.parentId } : place.list === 'checklist' ? { done: false } : {})
    }
    nextSections = produce(sections, (d) => {
      const items = d.find((s) => s.id === place.sectionId)![place.list]
      // Irmão de um item da mesma lista: logo depois dele, como no mapa.
      const sameList = after.entry && after.section?.id === place.sectionId && after.list === place.list
      const at = sameList ? items.findIndex((e) => e.id === after.entry!.id) + 1 : items.length
      items.splice(at, 0, entry)
    })
    ref = { sectionId: place.sectionId, list: place.list, entryId: entry.id }
  }

  const id = newId()
  const nextMap = produce(map, (d) => {
    const p = findNode(d.root, parent.id)!
    delete p.collapsed
    p.children.splice(index ?? p.children.length, 0, { id, text: NEW_TOPIC, children: [], ...(ref ? { ref } : {}) })
  })
  return { map: nextMap, sections: nextSections, id }
}

/** Troca o texto do tópico e o título da seção ou item ligado. */
export function renameTopic(map: MindMap, sections: Section[], id: string, text: string): Change {
  const n = findNode(map.root, id)
  if (!n) return { map, sections }
  const { section, list, entry } = linkedItem(sections, n)
  const nextSections =
    section && (entry ? entry.title : section.title) !== text
      ? produce(sections, (d) => {
          const s = d.find((x) => x.id === section.id)!
          if (entry) s[list!].find((e) => e.id === entry.id)!.title = text
          else s.title = text
        })
      : sections
  return { map: n.text === text ? map : updateNode(map, id, { text }), sections: nextSections }
}

/** Marca ou desmarca a tarefa ligada ao tópico. */
export function setTopicDone(sections: Section[], n: MindNode, done: boolean): Section[] {
  const { section, list, entry } = linkedItem(sections, n)
  if (!entry || list !== 'checklist' || !!entry.done === done) return sections
  return produce(sections, (d) => {
    d.find((s) => s.id === section!.id)!.checklist.find((e) => e.id === entry.id)!.done = done
  })
}

/**
 * Exclui o tópico e o ramo dele, com as seções e itens ligados. Subitens que ficavam em outro
 * lugar do mapa sobem para o pai do item excluído.
 */
export function removeTopic(map: MindMap, sections: Section[], id: string): Change {
  const node = findNode(map.root, id)
  if (!node || id === map.root.id) return { map, sections }
  const at = indexSections(sections)
  const goneSections = new Set<string>()
  const goneEntries: Located[] = []
  walk(node, (n) => {
    if (!n.ref) return
    if (n.ref.entryId) {
      const found = at.entries.get(n.ref.entryId)
      if (found) goneEntries.push(found)
    } else if (at.sections.has(n.ref.sectionId)) goneSections.add(n.ref.sectionId)
  })
  const entries = goneEntries.filter((x) => !goneSections.has(x.section.id))
  const gone = new Map(entries.map((x) => [x.entry.id, x.entry.parentId]))
  /** Primeiro pai que continua no espaço. */
  const survivor = (pid: string | undefined): string | undefined => {
    const seen = new Set<string>()
    while (pid && gone.has(pid) && !seen.has(pid)) {
      seen.add(pid)
      pid = gone.get(pid)
    }
    return pid && !gone.has(pid) ? pid : undefined
  }
  const nextSections =
    goneSections.size || entries.length
      ? produce(sections, (d) => {
          for (let i = d.length - 1; i >= 0; i--) if (goneSections.has(d[i].id)) d.splice(i, 1)
          for (const s of d) {
            for (const list of LISTS) {
              s[list] = s[list].filter((e) => !gone.has(e.id))
              for (const e of s[list]) {
                if (!e.parentId || !gone.has(e.parentId)) continue
                const pid = survivor(e.parentId)
                if (pid) e.parentId = pid
                else delete e.parentId
              }
            }
          }
        })
      : sections
  const trashed: Trashed[] = [
    ...[...goneSections].map((sectionId): Trashed => ({ kind: 'section', sectionId })),
    ...entries.map((x): Trashed => ({ kind: 'entry', sectionId: x.section.id, list: x.list, entryId: x.entry.id }))
  ]
  return { map: removeNode(map, id), sections: nextSections, trashed }
}

/**
 * Leva o tópico para baixo de outro. Um item que vai para baixo de uma seção ou de outro item
 * muda junto no espaço (vira subitem, ou volta ao primeiro nível), levando os subitens dele.
 */
export function reparentTopic(map: MindMap, sections: Section[], id: string, toId: string): Change {
  const next = reparent(map, id, toId)
  if (next === map) return { map, sections }
  const node = findNode(map.root, id)!
  const target = findNode(map.root, toId)!
  const { section: from, list, entry } = linkedItem(sections, node)
  if (!from || !entry) return { map: next, sections }
  const place = placeUnder(map, sections, target, list)
  if (place.kind !== 'entry') return { map: next, sections }

  // Vão junto os itens do ramo que estavam na mesma seção.
  const going = new Set<string>()
  walk(node, (n) => {
    if (n.ref?.entryId && n.ref.sectionId === from.id) going.add(n.ref.entryId)
  })
  const changesSection = place.sectionId !== from.id
  // Subitem fica na lista do pai; o ramo vai junto para ela.
  const changesList = place.list !== list
  const nextSections = produce(sections, (d) => {
    const src = d.find((s) => s.id === from.id)!
    const dst = d.find((s) => s.id === place.sectionId)!
    if (changesSection || changesList) {
      // Tira tudo antes de pôr: na mesma seção, a origem e o destino são a mesma lista de seções.
      const moving = LISTS.map((l) => {
        const out = src[l].filter((e) => going.has(e.id))
        src[l] = src[l].filter((e) => !going.has(e.id))
        return [l, out] as const
      })
      for (const [l, out] of moving) dst[changesList ? place.list : l].push(...out)
    }
    const items = dst[place.list]
    const e = items.find((x) => x.id === entry.id)!
    if (place.parentId && place.parentId !== e.id) {
      e.parentId = place.parentId
      delete e.done
      // Na lista, depois dos outros subitens do pai (no mapa ele também entra por último).
      items.splice(items.indexOf(e), 1)
      let at = items.findIndex((x) => x.id === place.parentId)
      items.forEach((x, i) => {
        if (x.parentId === place.parentId) at = Math.max(at, i)
      })
      items.splice(at < 0 ? items.length : at + 1, 0, e)
    } else {
      delete e.parentId
      // Volta a ser tarefa.
      if (place.list === 'checklist') e.done ??= false
    }
  })
  const nextMap =
    changesSection || changesList
      ? produce(next, (d) => {
          walk(findNode(d.root, id)!, (n) => {
            if (!n.ref?.entryId || !going.has(n.ref.entryId)) return
            n.ref.sectionId = place.sectionId
            if (changesList) n.ref.list = place.list
          })
        })
      : next
  return { map: nextMap, sections: nextSections }
}

/** Sobe ou desce entre os irmãos; seções e itens trocam de lugar no espaço também. */
export function moveTopic(map: MindMap, sections: Section[], id: string, delta: number): Change {
  const next = moveNode(map, id, delta)
  if (next === map) return { map, sections }
  const p = parentOf(map.root, id)!
  const node = findNode(map.root, id)!
  const other = p.children[p.children.findIndex((c) => c.id === id) + delta]
  const a = linkedItem(sections, node)
  const b = linkedItem(sections, other)
  let nextSections = sections
  if (a.entry && b.entry && a.section === b.section && a.list === b.list) {
    nextSections = produce(sections, (d) => {
      const items = d.find((s) => s.id === a.section!.id)![a.list!]
      const [moved] = items.splice(
        items.findIndex((e) => e.id === a.entry!.id),
        1
      )
      items.splice(items.findIndex((e) => e.id === b.entry!.id) + (delta > 0 ? 1 : 0), 0, moved)
    })
  } else if (!a.entry && !b.entry && a.section && b.section) {
    const rest = sections.filter((s) => s !== a.section)
    const at = rest.indexOf(b.section) + (delta > 0 ? 1 : 0)
    nextSections = [...rest.slice(0, at), a.section, ...rest.slice(at)]
  }
  return { map: next, sections: nextSections }
}

/**
 * Tópicos soltos embaixo de uma seção ou de um item (de mapas feitos antes de o mapa criar itens
 * no espaço) viram itens: embaixo da seção, tarefas; embaixo de um item, subitens dele. Os soltos
 * embaixo da raiz continuam só no mapa. Sem nada a adotar, devolve null.
 */
export function adoptTopics(map: MindMap, sections: Section[]): Change | null {
  const at = indexSections(sections)
  type Where = { sectionId: string; list?: ListType; entryId?: string }
  const adopted: { nodeId: string; sectionId: string; list: ListType; entry: Entry }[] = []
  const visit = (n: MindNode, parent: Where | null): void => {
    let mine: Where | null = null
    if (n.ref?.entryId) {
      const found = at.entries.get(n.ref.entryId)
      if (found) mine = { sectionId: found.section.id, list: found.list, entryId: found.entry.id }
    } else if (n.ref) {
      if (at.sections.has(n.ref.sectionId)) mine = { sectionId: n.ref.sectionId }
    } else if (parent) {
      const list = parent.list ?? 'checklist'
      const entry: Entry = {
        id: newId(),
        title: n.text.trim() || NEW_TOPIC,
        content: '',
        ...(parent.entryId ? { parentId: parent.entryId } : list === 'checklist' ? { done: false } : {})
      }
      adopted.push({ nodeId: n.id, sectionId: parent.sectionId, list, entry })
      mine = { sectionId: parent.sectionId, list, entryId: entry.id }
    }
    for (const c of n.children) visit(c, mine)
  }
  for (const c of map.root.children) visit(c, null)
  if (!adopted.length) return null
  const byNode = new Map(adopted.map((a) => [a.nodeId, a]))
  return {
    sections: produce(sections, (d) => {
      for (const a of adopted) d.find((s) => s.id === a.sectionId)![a.list].push(a.entry)
    }),
    map: produce(map, (d) => {
      walk(d.root, (n) => {
        const a = byNode.get(n.id)
        if (a) n.ref = { sectionId: a.sectionId, list: a.list, entryId: a.entry.id }
      })
    })
  }
}

/**
 * Seções de um passo de desfazer, com o texto atual das notas: o conteúdo é editado no painel,
 * fora do histórico do mapa, e desfazer um tópico não deve apagar o que foi escrito depois.
 */
export function keepContent(past: Section[], now: Section[]): Section[] {
  const content = new Map<string, string>()
  for (const s of now) for (const list of LISTS) for (const e of s[list]) content.set(e.id, e.content)
  return produce(past, (d) => {
    for (const s of d)
      for (const list of LISTS)
        for (const e of s[list]) {
          const c = content.get(e.id)
          if (c !== undefined && c !== e.content) e.content = c
        }
  })
}
