/**
 * Operações de mover, duplicar e reordenar. Alteram os dados recebidos no lugar,
 * então servem tanto para rascunhos do Immer (no store) quanto para objetos comuns (nos testes).
 */
import type { AppData, Board, BoardType, Entry, ListType, Section, SnippetGroup, Template } from '../types'
import { newId } from './util'

export const boardsOf = (data: AppData, type: BoardType): Board[] => (type === 'workspace' ? data.workspaces : data.libraries)

export const findBoard = (data: AppData, type: BoardType, id: string): Board | undefined =>
  boardsOf(data, type).find((b) => b.id === id)

export const findSection = (data: AppData, type: BoardType, boardId: string, sectionId: string): Section | undefined =>
  findBoard(data, type, boardId)?.sections.find((s) => s.id === sectionId)

export function move<T>(items: T[], from: number, to: number): void {
  if (from === to || from < 0 || from >= items.length) return
  const [item] = items.splice(from, 1)
  items.splice(Math.max(0, Math.min(to, items.length)), 0, item)
}

const copyTitle = (title: string): string => `${title} (cópia)`

const cloneEntry = (e: Entry): Entry => ({ ...e, id: newId() })

/** Converte uma entrada ao trocar de lista: notas não têm "concluído". */
function adaptEntry(e: Entry, list: ListType): Entry {
  if (list === 'checklist') return { ...e, done: e.done ?? false }
  const { done: _done, ...note } = e
  return note
}

export const cloneSection = (s: Section): Section => ({
  ...s,
  id: newId(),
  checklist: s.checklist.map(cloneEntry),
  notes: s.notes.map(cloneEntry)
})

/* ---------- Entradas ---------- */

export interface EntryRef {
  boardType: BoardType
  boardId: string
  sectionId: string
  list: ListType
  entryId: string
}

export interface SectionDest {
  boardType: BoardType
  boardId: string
  sectionId: string
  list: ListType
}

/** Duplica logo abaixo do original. Devolve o id da cópia. */
export function duplicateEntry(data: AppData, ref: EntryRef): string | null {
  const list = findSection(data, ref.boardType, ref.boardId, ref.sectionId)?.[ref.list]
  const index = list?.findIndex((e) => e.id === ref.entryId) ?? -1
  if (!list || index < 0) return null
  const copy = { ...cloneEntry(list[index]), title: copyTitle(list[index].title) }
  list.splice(index + 1, 0, copy)
  return copy.id
}

/** Move para o fim de outra seção/lista (do mesmo espaço ou de outro). */
export function moveEntryTo(data: AppData, ref: EntryRef, dest: SectionDest): boolean {
  const from = findSection(data, ref.boardType, ref.boardId, ref.sectionId)
  const to = findSection(data, dest.boardType, dest.boardId, dest.sectionId)
  const index = from?.[ref.list].findIndex((e) => e.id === ref.entryId) ?? -1
  if (!from || !to || index < 0) return false
  if (from === to && ref.list === dest.list) return false
  const [entry] = from[ref.list].splice(index, 1)
  const moved = adaptEntry(entry, dest.list)
  // Como ao mover seções: em biblioteca não há progresso, o item fica pendente.
  if (dest.boardType === 'library' && dest.list === 'checklist') moved.done = false
  to[dest.list].push(moved)
  return true
}

/* ---------- Seções ---------- */

export function duplicateSection(data: AppData, type: BoardType, boardId: string, sectionId: string): string | null {
  const board = findBoard(data, type, boardId)
  const index = board?.sections.findIndex((s) => s.id === sectionId) ?? -1
  if (!board || index < 0) return null
  const copy = { ...cloneSection(board.sections[index]), title: copyTitle(board.sections[index].title) }
  board.sections.splice(index + 1, 0, copy)
  return copy.id
}

export function moveSectionTo(
  data: AppData,
  from: { boardType: BoardType; boardId: string; sectionId: string },
  to: { boardType: BoardType; boardId: string }
): boolean {
  const src = findBoard(data, from.boardType, from.boardId)
  const dst = findBoard(data, to.boardType, to.boardId)
  const index = src?.sections.findIndex((s) => s.id === from.sectionId) ?? -1
  if (!src || !dst || index < 0 || src === dst) return false
  const [section] = src.sections.splice(index, 1)
  // Em biblioteca não há progresso; ao voltar para um espaço, os itens começam pendentes.
  if (to.boardType === 'library') section.checklist.forEach((e) => (e.done = false))
  dst.sections.push(section)
  return true
}

export function reorderSection(data: AppData, type: BoardType, boardId: string, sectionId: string, delta: number): void {
  const board = findBoard(data, type, boardId)
  const index = board?.sections.findIndex((s) => s.id === sectionId) ?? -1
  if (board && index >= 0) move(board.sections, index, index + delta)
}

/* ---------- Espaços e bibliotecas ---------- */

export function duplicateBoard(data: AppData, type: BoardType, id: string): string | null {
  const list = boardsOf(data, type)
  const index = list.findIndex((b) => b.id === id)
  if (index < 0) return null
  const src = list[index]
  const now = Date.now()
  const copy: Board = {
    ...src,
    id: newId(),
    title: copyTitle(src.title),
    sections: src.sections.map(cloneSection),
    sheet: src.sheet ? { ...src.sheet, vars: src.sheet.vars.map((v) => ({ ...v, id: newId() })) } : undefined,
    createdAt: now,
    updatedAt: now
  }
  list.splice(index + 1, 0, copy)
  return copy.id
}

export function reorderBoards(data: AppData, type: BoardType, from: number, to: number): void {
  move(boardsOf(data, type), from, to)
}

/* ---------- Snippets e modelos ---------- */

export function duplicateSnippet(data: AppData, groupId: string, id: string): string | null {
  const group = data.snippetGroups.find((g) => g.id === groupId)
  const index = group?.items.findIndex((i) => i.id === id) ?? -1
  if (!group || index < 0) return null
  const copy = { ...cloneEntry(group.items[index]), title: copyTitle(group.items[index].title) }
  group.items.splice(index + 1, 0, copy)
  return copy.id
}

export function moveSnippetTo(data: AppData, fromGroupId: string, id: string, toGroupId: string): boolean {
  const from = data.snippetGroups.find((g) => g.id === fromGroupId)
  const to = data.snippetGroups.find((g) => g.id === toGroupId)
  const index = from?.items.findIndex((i) => i.id === id) ?? -1
  if (!from || !to || from === to || index < 0) return false
  to.items.push(...from.items.splice(index, 1))
  return true
}

export function duplicateSnippetGroup(data: AppData, groupId: string): string | null {
  const index = data.snippetGroups.findIndex((g) => g.id === groupId)
  if (index < 0) return null
  const src = data.snippetGroups[index]
  const copy: SnippetGroup = { ...src, id: newId(), title: copyTitle(src.title), items: src.items.map(cloneEntry) }
  data.snippetGroups.splice(index + 1, 0, copy)
  return copy.id
}

export function duplicateTemplate(data: AppData, id: string): string | null {
  const index = data.templates.findIndex((t) => t.id === id)
  if (index < 0) return null
  const copy: Template = { ...data.templates[index], id: newId(), title: copyTitle(data.templates[index].title) }
  data.templates.splice(index + 1, 0, copy)
  return copy.id
}
