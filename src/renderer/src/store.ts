import { useMemo } from 'react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { AppData, Appearance, Board, BoardType, Entry, Kind, ListType, Section, ShortcutId, TargetSheet, Theme, View } from './types'
import type { ImportResult } from './lib/importData'
import { resolveBindings, setOverride, type Bindings } from './lib/shortcuts'
import { createWelcomeBoard } from './lib/seed'
import { cleanAppearance } from './lib/appearance'
import type { SearchTarget } from './lib/search'
import { boardFromSections, cloneSections, newId } from './lib/util'
import { createSheet, sheetSkeleton } from './lib/variables'
import { SHEET_SPECS } from './lib/sheets'
import * as ops from './lib/ops'
import type { EntryRef, SectionDest } from './lib/ops'
import { deleteForever, moveToTrash, restoreFromTrash } from './lib/trash'

/** O que pode ser movido pela janela "Mover para…". */
export type MoveTarget =
  | { kind: 'entry'; ref: EntryRef }
  | { kind: 'section'; boardType: BoardType; boardId: string; sectionId: string }
  | { kind: 'snippet'; groupId: string; id: string }

/** Sessão do temporizador. Com `endsAt` null está pausado, e `remaining` guarda o que falta. */
export interface FocusTimer {
  kind: 'focus' | 'break'
  minutes: number
  endsAt: number | null
  remaining: number
}

/** O que pode ser fixado no topo. */
export type PinTarget =
  | { kind: 'board'; type: BoardType; id: string }
  | { kind: 'entry'; ref: EntryRef }
  | { kind: 'snippet'; groupId: string; id: string }

/** Janelas sobre o app; só uma aberta por vez. */
export type Modal =
  | { type: 'palette' }
  | { type: 'shortcuts' }
  /** `only` abre a exportação já com só esse espaço ou biblioteca marcado. */
  | { type: 'export'; only?: { type: BoardType; id: string } }
  | { type: 'move'; target: MoveTarget }

export interface Toast {
  message: string
  action?: { label: string; run: () => void }
}

interface State {
  data: AppData | null
  view: View
  sectionId: string | null
  list: ListType
  entryId: string | null
  /** Ficha do espaço aberta no lugar do documento. */
  sheetOpen: boolean
  toast: Toast | null
  modal: Modal | null
  focusMode: boolean
  /** Temporizador do modo foco; null quando parado. Não é salvo no arquivo. */
  focusTimer: FocusTimer | null
  /** Sessões de foco terminadas hoje (por computador). */
  focusSessions: number
  /** Último espaço aberto; dá os valores das variáveis dos snippets. */
  lastWorkspaceId: string | null
  /** Espaço escolhido explicitamente como fonte das variáveis (senão, o último aberto). */
  snippetContextId: string | null
  railExpanded: boolean
  /** Larguras ajustadas pelo usuário; null usa o padrão do CSS. */
  railWidth: number | null
  panelWidth: number | null

  load(data: AppData): void
  open(view: View): void
  /** Vai até um resultado da busca. */
  navigate(target: SearchTarget): void
  selectEntry(id: string | null): void
  /** Seleciona um item da árvore: seção, lista e entrada de uma vez. */
  selectItem(sectionId: string, list: ListType, entryId: string): void
  openSheet(): void
  showToast(message: string, action?: Toast['action']): void
  dismissToast(): void
  setModal(modal: Modal | null): void
  toggleFocus(force?: boolean): void
  /** Começa uma sessão de foco (entra no modo foco) ou uma pausa. */
  startTimer(minutes: number, kind: FocusTimer['kind']): void
  pauseTimer(): void
  resumeTimer(): void
  stopTimer(): void
  /** O tempo acabou: limpa o temporizador e conta a sessão de foco. Devolve o que terminou. */
  finishTimer(): FocusTimer | null
  setSnippetContext(workspaceId: string | null): void
  toggleRail(): void
  setRailWidth(width: number | null): void
  setPanelWidth(width: number | null): void

  addBoard(type: BoardType, kind: Kind, fromLibraryId?: string): void
  saveAsLibrary(workspaceId: string): void
  /** Acrescenta um espaço de boas-vindas novo (o tutorial) e o abre. */
  addWelcome(): void
  /** Fixa no topo (ou desafixa) um espaço, biblioteca, item, nota ou snippet. */
  togglePin(target: PinTarget): void
  updateBoard(type: BoardType, id: string, patch: Partial<Pick<Board, 'title' | 'kind' | 'color'>>): void
  updateSheet(type: BoardType, id: string, patch: Partial<TargetSheet>): void
  removeBoard(type: BoardType, id: string): void
  duplicateBoard(type: BoardType, id: string): void
  reorderBoards(type: BoardType, from: number, to: number): void

  addSection(type: BoardType, boardId: string): void
  renameSection(type: BoardType, boardId: string, sectionId: string, title: string): void
  removeSection(type: BoardType, boardId: string, sectionId: string): void
  duplicateSection(type: BoardType, boardId: string, sectionId: string): void
  reorderSection(type: BoardType, boardId: string, sectionId: string, delta: number): void
  moveSectionTo(from: { boardType: BoardType; boardId: string; sectionId: string }, to: { boardType: BoardType; boardId: string }): void
  setSectionCollapsed(type: BoardType, boardId: string, sectionId: string, collapsed: boolean): void

  /** `open: false` só acrescenta, sem abrir o item (para adicionar vários em sequência). */
  addEntry(type: BoardType, boardId: string, sectionId: string, list: ListType, title: string, content?: string, open?: boolean): void
  updateEntry(
    type: BoardType,
    boardId: string,
    sectionId: string,
    list: ListType,
    entryId: string,
    patch: Partial<Omit<Entry, 'id'>>
  ): void
  removeEntry(type: BoardType, boardId: string, sectionId: string, list: ListType, entryId: string): void
  moveEntry(type: BoardType, boardId: string, sectionId: string, list: ListType, from: number, to: number): void
  duplicateEntry(ref: EntryRef): void
  moveEntryTo(ref: EntryRef, dest: SectionDest): void

  addTemplate(): void
  updateTemplate(id: string, patch: { title?: string; content?: string }): void
  removeTemplate(id: string): void
  duplicateTemplate(id: string): void

  addSnippetGroup(): void
  renameSnippetGroup(id: string, title: string): void
  removeSnippetGroup(id: string): void
  duplicateSnippetGroup(id: string): void
  setGroupCollapsed(id: string, collapsed: boolean): void
  addSnippet(groupId: string): void
  updateSnippet(groupId: string, id: string, patch: { title?: string; content?: string }): void
  removeSnippet(groupId: string, id: string): void
  moveSnippet(groupId: string, from: number, to: number): void
  duplicateSnippet(groupId: string, id: string): void
  moveSnippetTo(fromGroupId: string, id: string, toGroupId: string): void

  restoreTrash(trashId: string): void
  deleteTrashForever(trashId: string): void
  emptyTrash(): void

  setTheme(theme: Theme): void
  /** Troca o atalho de uma ação (`null` desativa). Quem chama já validou com validateCombo. */
  setShortcut(id: ShortcutId, combo: string | null): void
  resetShortcuts(): void
  /** Muda a aparência; `undefined` num campo volta ao padrão. */
  setAppearance(patch: Partial<Record<keyof Appearance, string | undefined>>): void
  resetAppearance(): void
  importData(result: ImportResult): void
}

const findBoard = (data: AppData | null, type: BoardType, id: string): Board | undefined =>
  data ? ops.findBoard(data, type, id) : undefined

/** Seção para editar; marca o espaço como atualizado. */
function editSection(data: AppData | null, type: BoardType, boardId: string, sectionId: string): Section | undefined {
  const board = findBoard(data, type, boardId)
  if (board) board.updatedAt = Date.now()
  return board?.sections.find((s) => s.id === sectionId)
}

const touch = (data: AppData | null, type: BoardType, id: string): void => {
  const board = findBoard(data, type, id)
  if (board) board.updatedAt = Date.now()
}

const newSection = (title = 'Nova seção'): Section => ({ id: newId(), title, checklist: [], notes: [] })

let toastTimer: ReturnType<typeof setTimeout> | undefined

/* Preferências de layout, guardadas por computador (não entram nos backups). */
const PREF = {
  focusSessions: 'opsinote.focusSessions',
  railExpanded: 'opsinote.railExpanded',
  railWidth: 'opsinote.railWidth',
  panelWidth: 'opsinote.panelWidth'
}

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writePref(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Sem armazenamento local: a preferência vale só para esta sessão.
  }
}

/** Data local (AAAA-MM-DD): o contador de sessões recomeça a cada dia. */
const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readSessions(): number {
  try {
    const v = JSON.parse(readPref(PREF.focusSessions) ?? 'null') as { date?: string; count?: number } | null
    return v?.date === today() && typeof v.count === 'number' ? v.count : 0
  } catch {
    return 0
  }
}

function writeSessions(count: number): void {
  writePref(PREF.focusSessions, JSON.stringify({ date: today(), count }))
}

const prefTimers: Record<string, ReturnType<typeof setTimeout>> = {}

/** Para valores que mudam a cada movimento do mouse (larguras): grava só quando o arraste para. */
function writePrefSoon(key: string, value: string | null): void {
  clearTimeout(prefTimers[key])
  prefTimers[key] = setTimeout(() => writePref(key, value), 300)
}

function readWidthPref(key: string): number | null {
  const n = Number(readPref(key))
  return Number.isFinite(n) && n > 0 ? n : null
}

export const useStore = create<State>()(
  immer((set, get) => {
    /** Exclui movendo para a lixeira e oferece "Desfazer". */
    const trash = (what: Parameters<typeof moveToTrash>[1], label: string, cleanup: (s: State) => void): void => {
      let trashId: string | null = null
      set((s) => {
        if (!s.data) return
        trashId = moveToTrash(s.data, what)?.id ?? null
        if (trashId) cleanup(s as State)
      })
      if (trashId) {
        const id = trashId
        get().showToast(`${label} foi para a lixeira`, { label: 'Desfazer', run: () => get().restoreTrash(id) })
      }
    }

    return {
      data: null,
      view: { type: 'home' },
      sectionId: null,
      list: 'checklist',
      entryId: null,
      sheetOpen: false,
      toast: null,
      modal: null,
      focusMode: false,
      focusTimer: null,
      focusSessions: readSessions(),
      lastWorkspaceId: null,
      snippetContextId: null,
      railExpanded: readPref(PREF.railExpanded) === '1',
      railWidth: readWidthPref(PREF.railWidth),
      panelWidth: readWidthPref(PREF.panelWidth),

      load: (data) => set({ data, lastWorkspaceId: data.workspaces[0]?.id ?? null }),

      open: (view) =>
        set((s) => {
          s.view = view
          s.entryId = null
          s.sheetOpen = false
          s.list = 'checklist'
          s.sectionId = null
          if (view.type === 'workspace') s.lastWorkspaceId = view.id
          if (view.type === 'workspace' || view.type === 'library') {
            s.sectionId = findBoard(s.data, view.type, view.id)?.sections[0]?.id ?? null
          }
        }),

      navigate: (target) => {
        get().open(target.view)
        set((s) => {
          if (target.sheet) s.sheetOpen = true
          if (target.sectionId) s.sectionId = target.sectionId
          if (target.list) s.list = target.list
          if (target.entryId) s.entryId = target.entryId
          // Abre a seção do resultado se estiver recolhida.
          const v = target.view
          if (target.sectionId && (v.type === 'workspace' || v.type === 'library')) {
            const section = findBoard(s.data, v.type, v.id)?.sections.find((x) => x.id === target.sectionId)
            if (section?.collapsed) section.collapsed = false
          }
          if (target.entryId && v.type === 'snippets') {
            const group = s.data?.snippetGroups.find((g) => g.items.some((i) => i.id === target.entryId))
            if (group?.collapsed) group.collapsed = false
          }
        })
      },

      selectEntry: (id) => set({ entryId: id, sheetOpen: false }),

      selectItem: (sectionId, list, entryId) => set({ sectionId, list, entryId, sheetOpen: false }),

      openSheet: () =>
        set((s) => {
          s.sheetOpen = true
          s.entryId = null
        }),

      showToast: (message, action) => {
        clearTimeout(toastTimer)
        set({ toast: { message, action } })
        // Com "Desfazer" o aviso fica mais tempo, para dar tempo de clicar.
        toastTimer = setTimeout(() => set({ toast: null }), action ? 6000 : 2200)
      },

      dismissToast: () => {
        clearTimeout(toastTimer)
        set({ toast: null })
      },

      setModal: (modal) => set({ modal }),

      toggleFocus: (force) => set((s) => ({ focusMode: force ?? !s.focusMode })),

      startTimer: (minutes, kind) =>
        set((s) => {
          const ms = Math.round(minutes * 60_000)
          s.focusTimer = { kind, minutes, endsAt: Date.now() + ms, remaining: ms }
          if (kind === 'focus') s.focusMode = true
        }),

      pauseTimer: () =>
        set((s) => {
          const t = s.focusTimer
          if (!t || t.endsAt === null) return
          t.remaining = Math.max(0, t.endsAt - Date.now())
          t.endsAt = null
        }),

      resumeTimer: () =>
        set((s) => {
          const t = s.focusTimer
          if (t && t.endsAt === null) t.endsAt = Date.now() + t.remaining
        }),

      stopTimer: () => set({ focusTimer: null }),

      finishTimer: () => {
        const t = get().focusTimer
        if (!t) return null
        const focusSessions = t.kind === 'focus' ? get().focusSessions + 1 : get().focusSessions
        if (t.kind === 'focus') writeSessions(focusSessions)
        set({ focusTimer: null, focusSessions })
        return t
      },

      setSnippetContext: (workspaceId) => set({ snippetContextId: workspaceId }),

      toggleRail: () => {
        const railExpanded = !get().railExpanded
        set({ railExpanded })
        writePref(PREF.railExpanded, railExpanded ? '1' : '0')
      },

      setRailWidth: (width) => {
        set({ railWidth: width })
        writePrefSoon(PREF.railWidth, width === null ? null : String(Math.round(width)))
      },

      setPanelWidth: (width) => {
        set({ panelWidth: width })
        writePrefSoon(PREF.panelWidth, width === null ? null : String(Math.round(width)))
      },

      /* ---------- Espaços e bibliotecas ---------- */

      addBoard: (type, kind, fromLibraryId) => {
        const s = get()
        const library = fromLibraryId ? findBoard(s.data, 'library', fromLibraryId) : undefined
        const board = library
          ? boardFromSections(library.title, library.kind, cloneSections(library.sections), library.color)
          : boardFromSections(type === 'workspace' ? 'Novo espaço' : 'Nova biblioteca', kind, [newSection('Geral')])
        const sheet = library ? sheetSkeleton(library.sheet) : undefined
        if (sheet) board.sheet = sheet
        set((st) => {
          if (!st.data) return
          ops.boardsOf(st.data, type).unshift(board)
        })
        get().open({ type, id: board.id })
      },

      togglePin: (target) =>
        set((s) => {
          if (!s.data) return
          const thing =
            target.kind === 'board'
              ? findBoard(s.data, target.type, target.id)
              : target.kind === 'entry'
                ? editSection(s.data, target.ref.boardType, target.ref.boardId, target.ref.sectionId)?.[target.ref.list].find((e) => e.id === target.ref.entryId)
                : s.data.snippetGroups.find((g) => g.id === target.groupId)?.items.find((i) => i.id === target.id)
          if (!thing) return
          if (thing.pinned) delete thing.pinned
          else thing.pinned = true
        }),

      addWelcome: () => {
        const board = createWelcomeBoard()
        set((s) => {
          s.data?.workspaces.unshift(board)
        })
        get().open({ type: 'workspace', id: board.id })
      },

      saveAsLibrary: (workspaceId) => {
        const ws = findBoard(get().data, 'workspace', workspaceId)
        if (!ws) return
        const lib = boardFromSections(ws.title, ws.kind, cloneSections(ws.sections), ws.color)
        const sheet = sheetSkeleton(ws.sheet)
        if (sheet) lib.sheet = sheet
        set((s) => {
          s.data?.libraries.unshift(lib)
        })
        get().showToast('Biblioteca criada a partir do espaço')
      },

      updateBoard: (type, id, patch) =>
        set((s) => {
          const board = findBoard(s.data, type, id)
          if (board) Object.assign(board, patch, { updatedAt: Date.now() })
        }),

      updateSheet: (type, id, patch) =>
        set((s) => {
          const board = findBoard(s.data, type, id)
          if (!board) return
          board.sheet = { ...(board.sheet ?? createSheet(SHEET_SPECS[board.kind].defaultKeys)), ...patch }
          board.updatedAt = Date.now()
        }),

      removeBoard: (type, id) =>
        trash({ kind: 'board', boardType: type, id }, type === 'workspace' ? 'O espaço' : 'A biblioteca', (s) => {
          if ((s.view.type === 'workspace' || s.view.type === 'library') && s.view.id === id) {
            s.view = type === 'library' ? { type: 'libraries' } : { type: 'home' }
            s.sectionId = null
            s.entryId = null
            s.sheetOpen = false
          }
        }),

      duplicateBoard: (type, id) => {
        let copyId: string | null = null
        set((s) => {
          if (s.data) copyId = ops.duplicateBoard(s.data, type, id)
        })
        if (copyId) {
          get().open({ type, id: copyId })
          get().showToast(type === 'workspace' ? 'Espaço duplicado' : 'Biblioteca duplicada')
        }
      },

      reorderBoards: (type, from, to) =>
        set((s) => {
          if (s.data) ops.reorderBoards(s.data, type, from, to)
        }),

      /* ---------- Seções ---------- */

      addSection: (type, boardId) =>
        set((s) => {
          const board = findBoard(s.data, type, boardId)
          if (!board) return
          const section = newSection()
          board.sections.push(section)
          board.updatedAt = Date.now()
          s.sectionId = section.id
          s.entryId = null
        }),

      renameSection: (type, boardId, sectionId, title) =>
        set((s) => {
          const section = editSection(s.data, type, boardId, sectionId)
          if (section) section.title = title
        }),

      removeSection: (type, boardId, sectionId) =>
        trash({ kind: 'section', boardType: type, boardId, sectionId }, 'A seção', (s) => {
          if (s.sectionId === sectionId) {
            s.sectionId = null
            s.entryId = null
          }
        }),

      duplicateSection: (type, boardId, sectionId) =>
        set((s) => {
          if (!s.data) return
          ops.duplicateSection(s.data, type, boardId, sectionId)
          touch(s.data, type, boardId)
        }),

      reorderSection: (type, boardId, sectionId, delta) =>
        set((s) => {
          if (s.data) ops.reorderSection(s.data, type, boardId, sectionId, delta)
        }),

      moveSectionTo: (from, to) => {
        let ok = false
        set((s) => {
          if (!s.data) return
          ok = ops.moveSectionTo(s.data, from, to)
          if (!ok) return
          touch(s.data, from.boardType, from.boardId)
          touch(s.data, to.boardType, to.boardId)
          if (s.sectionId === from.sectionId) {
            s.sectionId = null
            s.entryId = null
          }
        })
        if (ok) get().showToast(`Seção movida para “${findBoard(get().data, to.boardType, to.boardId)?.title}”`)
      },

      // Recolher não conta como edição: não muda a data de atualização do espaço.
      setSectionCollapsed: (type, boardId, sectionId, collapsed) =>
        set((s) => {
          const section = findBoard(s.data, type, boardId)?.sections.find((x) => x.id === sectionId)
          if (section) section.collapsed = collapsed || undefined
        }),

      /* ---------- Entradas ---------- */

      addEntry: (type, boardId, sectionId, list, title, content = '', open = true) =>
        set((s) => {
          const section = editSection(s.data, type, boardId, sectionId)
          if (!section) return
          const entry: Entry = { id: newId(), title, content, ...(list === 'checklist' ? { done: false } : {}) }
          section[list].push(entry)
          if (!open) return
          s.sectionId = sectionId
          s.list = list
          s.entryId = entry.id
          s.sheetOpen = false
        }),

      updateEntry: (type, boardId, sectionId, list, entryId, patch) =>
        set((s) => {
          const entry = editSection(s.data, type, boardId, sectionId)?.[list].find((e) => e.id === entryId)
          if (entry) Object.assign(entry, patch)
        }),

      removeEntry: (type, boardId, sectionId, list, entryId) =>
        trash({ kind: 'entry', boardType: type, boardId, sectionId, list, entryId }, list === 'checklist' ? 'O item' : 'A nota', (s) => {
          if (s.entryId === entryId) s.entryId = null
        }),

      moveEntry: (type, boardId, sectionId, list, from, to) =>
        set((s) => {
          const section = editSection(s.data, type, boardId, sectionId)
          if (section) ops.move(section[list], from, to)
        }),

      duplicateEntry: (ref) =>
        set((s) => {
          if (!s.data) return
          const copyId = ops.duplicateEntry(s.data, ref)
          if (!copyId) return
          touch(s.data, ref.boardType, ref.boardId)
          s.sectionId = ref.sectionId
          s.list = ref.list
          s.entryId = copyId
          s.sheetOpen = false
        }),

      moveEntryTo: (ref, dest) => {
        let ok = false
        set((s) => {
          if (!s.data) return
          ok = ops.moveEntryTo(s.data, ref, dest)
          if (!ok) return
          touch(s.data, ref.boardType, ref.boardId)
          touch(s.data, dest.boardType, dest.boardId)
          if (s.entryId === ref.entryId) s.entryId = null
        })
        if (ok) {
          const board = findBoard(get().data, dest.boardType, dest.boardId)
          const section = board?.sections.find((x) => x.id === dest.sectionId)
          get().showToast(`Movido para “${board?.title} › ${section?.title}”`)
        }
      },

      /* ---------- Modelos ---------- */

      addTemplate: () =>
        set((s) => {
          const template = { id: newId(), title: 'Novo modelo', content: '' }
          s.data?.templates.push(template)
          s.entryId = template.id
        }),

      updateTemplate: (id, patch) =>
        set((s) => {
          const template = s.data?.templates.find((t) => t.id === id)
          if (template) Object.assign(template, patch)
        }),

      removeTemplate: (id) =>
        trash({ kind: 'template', id }, 'O modelo', (s) => {
          if (s.entryId === id) s.entryId = null
        }),

      duplicateTemplate: (id) =>
        set((s) => {
          if (!s.data) return
          const copyId = ops.duplicateTemplate(s.data, id)
          if (copyId) s.entryId = copyId
        }),

      /* ---------- Snippets ---------- */

      addSnippetGroup: () => {
        const group = { id: newId(), title: 'Novo grupo', items: [] }
        set((s) => {
          s.data?.snippetGroups.push(group)
        })
        if (get().view.type !== 'snippets') get().open({ type: 'snippets' })
      },

      renameSnippetGroup: (id, title) =>
        set((s) => {
          const group = s.data?.snippetGroups.find((g) => g.id === id)
          if (group) group.title = title
        }),

      removeSnippetGroup: (id) => {
        const group = get().data?.snippetGroups.find((g) => g.id === id)
        const hadSelection = !!group?.items.some((i) => i.id === get().entryId)
        trash({ kind: 'snippetGroup', id }, 'O grupo', (s) => {
          if (hadSelection) s.entryId = null
        })
      },

      duplicateSnippetGroup: (id) =>
        set((s) => {
          if (s.data) ops.duplicateSnippetGroup(s.data, id)
        }),

      setGroupCollapsed: (id, collapsed) =>
        set((s) => {
          const group = s.data?.snippetGroups.find((g) => g.id === id)
          if (group) group.collapsed = collapsed || undefined
        }),

      addSnippet: (groupId) =>
        set((s) => {
          const group = s.data?.snippetGroups.find((g) => g.id === groupId)
          if (!group) return
          const item = { id: newId(), title: 'Novo snippet', content: '' }
          group.items.push(item)
          group.collapsed = undefined
          s.entryId = item.id
        }),

      updateSnippet: (groupId, id, patch) =>
        set((s) => {
          const item = s.data?.snippetGroups.find((g) => g.id === groupId)?.items.find((i) => i.id === id)
          if (item) Object.assign(item, patch)
        }),

      removeSnippet: (groupId, id) =>
        trash({ kind: 'snippet', groupId, id }, 'O snippet', (s) => {
          if (s.entryId === id) s.entryId = null
        }),

      moveSnippet: (groupId, from, to) =>
        set((s) => {
          const group = s.data?.snippetGroups.find((g) => g.id === groupId)
          if (group) ops.move(group.items, from, to)
        }),

      duplicateSnippet: (groupId, id) =>
        set((s) => {
          if (!s.data) return
          const copyId = ops.duplicateSnippet(s.data, groupId, id)
          if (copyId) s.entryId = copyId
        }),

      moveSnippetTo: (fromGroupId, id, toGroupId) => {
        let ok = false
        set((s) => {
          if (s.data) ok = ops.moveSnippetTo(s.data, fromGroupId, id, toGroupId)
        })
        if (ok) get().showToast(`Movido para “${get().data?.snippetGroups.find((g) => g.id === toGroupId)?.title}”`)
      },

      /* ---------- Lixeira ---------- */

      restoreTrash: (trashId) => {
        let where: string | null = null
        set((s) => {
          if (s.data) where = restoreFromTrash(s.data, trashId)
        })
        if (where) get().showToast(`Restaurado em ${where}`)
      },

      deleteTrashForever: (trashId) =>
        set((s) => {
          if (s.data) deleteForever(s.data, trashId)
        }),

      emptyTrash: () =>
        set((s) => {
          if (s.data) s.data.trash = []
        }),

      setTheme: (theme) =>
        set((s) => {
          if (s.data) s.data.settings.theme = theme
        }),

      setShortcut: (id, combo) =>
        set((s) => {
          if (!s.data) return
          const next = setOverride(s.data.settings.shortcuts ?? {}, id, combo)
          if (Object.keys(next).length > 0) s.data.settings.shortcuts = next
          else delete s.data.settings.shortcuts
        }),

      setAppearance: (patch) =>
        set((s) => {
          if (!s.data) return
          const next = cleanAppearance({ ...s.data.settings.appearance, ...patch })
          if (Object.keys(next).length > 0) s.data.settings.appearance = next
          else delete s.data.settings.appearance
        }),

      resetAppearance: () =>
        set((s) => {
          if (s.data) delete s.data.settings.appearance
        }),

      resetShortcuts: () =>
        set((s) => {
          if (s.data) delete s.data.settings.shortcuts
        }),

      importData: (result) =>
        set((s) => {
          if (!s.data) return
          s.data.workspaces.push(...result.workspaces)
          s.data.libraries.push(...result.libraries)
          s.data.templates.push(...result.templates)
          s.data.snippetGroups.push(...result.snippetGroups)
        })
    }
  })
)

/** Atalhos para o Espaço ou Biblioteca aberto no momento. */
export function useActiveBoard(): { type: BoardType; board: Board } | null {
  const view = useStore((s) => s.view)
  const board = useStore((s) =>
    s.view.type === 'workspace' || s.view.type === 'library' ? findBoard(s.data, s.view.type, s.view.id) : undefined
  )
  if (!board || (view.type !== 'workspace' && view.type !== 'library')) return null
  return { type: view.type, board }
}

/** Atalhos em uso agora: os personalizados por cima dos padrões. */
export function useBindings(): Bindings {
  const overrides = useStore((s) => s.data?.settings.shortcuts)
  return useMemo(() => resolveBindings(overrides), [overrides])
}

/** Combinação atual de uma ação, ou null se estiver desativada. */
export function useBinding(id: ShortcutId): string | null {
  return useBindings()[id]
}

/** Espaço cuja ficha fornece os valores das variáveis dos snippets. */
export function useSnippetContext(): Board | undefined {
  return useStore((s) => {
    const id = s.snippetContextId ?? s.lastWorkspaceId
    return s.data?.workspaces.find((w) => w.id === id) ?? s.data?.workspaces[0]
  })
}
