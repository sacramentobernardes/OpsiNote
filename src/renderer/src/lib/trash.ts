/**
 * Lixeira: excluir move o item para `data.trash` junto com a origem; restaurar
 * devolve ao mesmo lugar ou, se a origem não existir mais, a um lugar novo.
 */
import type { AppData, Board, BoardType, Kind, ListType, Section, TrashItem } from '../types'
import { boardFromSections, newId } from './util'
import { boardsOf, findBoard, findSection } from './ops'

export const TRASH_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

type Removed =
  | { kind: 'board'; boardType: BoardType; id: string }
  | { kind: 'section'; boardType: BoardType; boardId: string; sectionId: string }
  | { kind: 'entry'; boardType: BoardType; boardId: string; sectionId: string; list: ListType; entryId: string }
  | { kind: 'template'; id: string }
  | { kind: 'snippetGroup'; id: string }
  | { kind: 'snippet'; groupId: string; id: string }

const origin = (boardType: BoardType, board: Board) => ({
  boardType,
  boardId: board.id,
  boardTitle: board.title,
  boardKind: board.kind,
  ...(board.color ? { boardColor: board.color } : {})
})

/** Recria o espaço de origem com o mesmo nome, categoria e cor. */
const recreateBoard = (item: { boardTitle: string; boardKind?: Kind; boardColor?: string }, sections: Section[]): Board =>
  boardFromSections(item.boardTitle, item.boardKind ?? 'other', sections, item.boardColor)

/** Tira o item do lugar e guarda na lixeira. Devolve o registro criado (ou null se não achou). */
export function moveToTrash(data: AppData, what: Removed, now = Date.now()): TrashItem | null {
  const base = { id: newId(), deletedAt: now }
  let item: TrashItem | null = null

  switch (what.kind) {
    case 'board': {
      const list = boardsOf(data, what.boardType)
      const index = list.findIndex((b) => b.id === what.id)
      if (index < 0) return null
      item = { ...base, index, kind: 'board', boardType: what.boardType, board: list.splice(index, 1)[0] }
      break
    }
    case 'section': {
      const board = findBoard(data, what.boardType, what.boardId)
      const index = board?.sections.findIndex((s) => s.id === what.sectionId) ?? -1
      if (!board || index < 0) return null
      const [section] = board.sections.splice(index, 1)
      item = { ...base, ...origin(what.boardType, board), index, kind: 'section', section }
      break
    }
    case 'entry': {
      const board = findBoard(data, what.boardType, what.boardId)
      const section = findSection(data, what.boardType, what.boardId, what.sectionId)
      const index = section?.[what.list].findIndex((e) => e.id === what.entryId) ?? -1
      if (!board || !section || index < 0) return null
      const [entry] = section[what.list].splice(index, 1)
      item = {
        ...base,
        index,
        ...origin(what.boardType, board),
        kind: 'entry',
        sectionId: section.id,
        sectionTitle: section.title,
        list: what.list,
        entry
      }
      break
    }
    case 'template': {
      const index = data.templates.findIndex((t) => t.id === what.id)
      if (index < 0) return null
      item = { ...base, index, kind: 'template', template: data.templates.splice(index, 1)[0] }
      break
    }
    case 'snippetGroup': {
      const index = data.snippetGroups.findIndex((g) => g.id === what.id)
      if (index < 0) return null
      item = { ...base, index, kind: 'snippetGroup', group: data.snippetGroups.splice(index, 1)[0] }
      break
    }
    case 'snippet': {
      const group = data.snippetGroups.find((g) => g.id === what.groupId)
      const index = group?.items.findIndex((i) => i.id === what.id) ?? -1
      if (!group || index < 0) return null
      item = { ...base, index, kind: 'snippet', groupId: group.id, groupTitle: group.title, snippet: group.items.splice(index, 1)[0] }
      break
    }
  }

  data.trash.unshift(item)
  return item
}

const insertAt = <T>(list: T[], index: number, value: T): void => {
  list.splice(Math.min(Math.max(index, 0), list.length), 0, value)
}

/** Título e descrição de onde o item estava, para a tela da lixeira. */
export function trashTitle(item: TrashItem): string {
  switch (item.kind) {
    case 'board':
      return item.board.title
    case 'section':
      return item.section.title
    case 'entry':
      return item.entry.title
    case 'template':
      return item.template.title
    case 'snippetGroup':
      return item.group.title
    case 'snippet':
      return item.snippet.title
  }
}

/**
 * Restaura o item. Devolve onde ele foi parar, para avisar a pessoa.
 * Se a origem foi excluída também, cria um lugar novo em vez de perder o item.
 */
export function restoreFromTrash(data: AppData, trashId: string): string | null {
  const at = data.trash.findIndex((t) => t.id === trashId)
  if (at < 0) return null
  const [item] = data.trash.splice(at, 1)

  switch (item.kind) {
    case 'board': {
      insertAt(boardsOf(data, item.boardType), item.index, item.board)
      return item.boardType === 'workspace' ? 'Espaços' : 'Bibliotecas'
    }
    case 'section': {
      const board = findBoard(data, item.boardType, item.boardId)
      if (board) {
        insertAt(board.sections, item.index, item.section)
        return board.title
      }
      const fresh = recreateBoard(item, [item.section])
      boardsOf(data, item.boardType).unshift(fresh)
      return `${fresh.title} (recriado)`
    }
    case 'entry': {
      const section = findSection(data, item.boardType, item.boardId, item.sectionId)
      if (section) {
        insertAt(section[item.list], item.index, item.entry)
        return `${item.boardTitle} › ${section.title}`
      }
      const board = findBoard(data, item.boardType, item.boardId)
      const recovered = { id: newId(), title: item.sectionTitle, checklist: [], notes: [], [item.list]: [item.entry] }
      if (board) {
        board.sections.push(recovered)
        return `${board.title} › ${recovered.title} (recriada)`
      }
      const fresh = recreateBoard(item, [recovered])
      boardsOf(data, item.boardType).unshift(fresh)
      return `${fresh.title} (recriado)`
    }
    case 'template':
      insertAt(data.templates, item.index, item.template)
      return 'Modelos de nota'
    case 'snippetGroup':
      insertAt(data.snippetGroups, item.index, item.group)
      return 'Snippets'
    case 'snippet': {
      const group = data.snippetGroups.find((g) => g.id === item.groupId)
      if (group) {
        insertAt(group.items, item.index, item.snippet)
        return group.title
      }
      data.snippetGroups.push({ id: newId(), title: item.groupTitle, items: [item.snippet] })
      return `${item.groupTitle} (recriado)`
    }
  }
}

export function deleteForever(data: AppData, trashId: string): void {
  data.trash = data.trash.filter((t) => t.id !== trashId)
}

/** Remove de vez o que está na lixeira há mais de 30 dias. Devolve quantos saíram. */
export function purgeExpired(data: AppData, now = Date.now()): number {
  const before = data.trash.length
  data.trash = data.trash.filter((t) => now - t.deletedAt < TRASH_DAYS * DAY)
  return before - data.trash.length
}
