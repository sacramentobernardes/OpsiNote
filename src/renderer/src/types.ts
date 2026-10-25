export type Kind = 'pentest' | 'study' | 'project' | 'task' | 'other'

export type BoardType = 'workspace' | 'library'
export type ListType = 'checklist' | 'notes'

export interface Entry {
  id: string
  title: string
  /** HTML gerado pelo editor (ou texto puro, nos snippets). */
  content: string
  color?: string
  done?: boolean
  /** Fixado no topo da lista e na seção Fixados do Início. */
  pinned?: boolean
}

export interface Section {
  id: string
  title: string
  checklist: Entry[]
  notes: Entry[]
  /** Recolhida na árvore; lembrado entre sessões. */
  collapsed?: boolean
}

/** Variável da ficha, usada nos snippets como {{chave}}. */
export interface SheetVar {
  id: string
  key: string
  value: string
}

/**
 * Ficha do espaço: variáveis para os snippets, um período e campos de texto que
 * dependem da categoria (escopo do pentest, objetivo do estudo…). Ver lib/sheets.ts.
 */
export interface TargetSheet {
  vars: SheetVar[]
  /** Datas no formato AAAA-MM-DD. */
  start?: string
  end?: string
  /** Campos de texto por id. Ao trocar de categoria, os campos da anterior ficam guardados. */
  fields: Record<string, string>
}

/** Espaços (workspaces) e bibliotecas compartilham a mesma estrutura. */
export interface Board {
  id: string
  title: string
  kind: Kind
  color?: string
  sections: Section[]
  sheet?: TargetSheet
  /** Fixado no topo do trilho e na seção Fixados do Início. */
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

export interface Template {
  id: string
  title: string
  content: string
}

export interface SnippetGroup {
  id: string
  title: string
  items: Entry[]
  collapsed?: boolean
}

export type Theme = 'system' | 'light' | 'dark'

/** Ações com atalho de teclado configurável (ver lib/shortcuts.ts). */
export type ShortcutId =
  | 'palette'
  | 'shortcuts'
  | 'settings'
  | 'help'
  | 'newWorkspace'
  | 'toggleRail'
  | 'focus'
  | 'prevItem'
  | 'nextItem'
  | 'toggleDone'
  | 'duplicate'
  | 'copySnippet'

/** Aparência personalizada (ver lib/appearance.ts). Campos ausentes = padrão. */
export interface Appearance {
  /** Cor de destaque (#rrggbb). */
  accent?: string
  density?: 'compact'
  cards?: 'elevated' | 'flat'
  radius?: 'square' | 'round'
}

/** Só os atalhos trocados pelo usuário; `null` desativa o atalho. */
export type ShortcutOverrides = Partial<Record<ShortcutId, string | null>>

export interface AppData {
  version: 1
  workspaces: Board[]
  libraries: Board[]
  templates: Template[]
  snippetGroups: SnippetGroup[]
  /** Itens excluídos, restauráveis por 30 dias. */
  trash: TrashItem[]
  settings: { theme: Theme; shortcuts?: ShortcutOverrides; appearance?: Appearance }
}

/** Dados do espaço de origem, para recriá-lo igual se ele também tiver sido excluído. */
interface TrashOrigin {
  boardType: BoardType
  boardId: string
  boardTitle: string
  boardKind?: Kind
  boardColor?: string
}

interface TrashBase {
  /** Id do registro na lixeira (não do item excluído). */
  id: string
  deletedAt: number
  /** Posição original, para restaurar no mesmo lugar. */
  index: number
}

export type TrashItem = TrashBase &
  (
    | { kind: 'board'; boardType: BoardType; board: Board }
    | (TrashOrigin & { kind: 'section'; section: Section })
    | (TrashOrigin & {
        kind: 'entry'
        sectionId: string
        sectionTitle: string
        list: ListType
        entry: Entry
      })
    | { kind: 'template'; template: Template }
    | { kind: 'snippetGroup'; group: SnippetGroup }
    | { kind: 'snippet'; groupId: string; groupTitle: string; snippet: Entry }
  )

export type SettingsTab = 'general' | 'data' | 'shortcuts' | 'help' | 'about'

export type View =
  | { type: 'home' }
  | { type: 'workspace'; id: string }
  | { type: 'library'; id: string }
  | { type: 'templates' }
  | { type: 'libraries' }
  | { type: 'snippets' }
  | { type: 'trash' }
  | { type: 'graph' }
  | { type: 'settings'; tab?: SettingsTab }
