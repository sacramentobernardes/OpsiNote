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
  /** Subitem de outra entrada da mesma seção (criado no mapa mental ou em "Adicionar subitem"). */
  parentId?: string
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

/** Seção ou item do espaço que um nó do mapa mental representa (sem `entryId`, é a seção). */
export interface MindRef {
  sectionId: string
  list?: ListType
  entryId?: string
}

/** Nó do mapa mental (ver lib/mindmap.ts). */
export interface MindNode {
  id: string
  text: string
  children: MindNode[]
  /** Filhos escondidos. */
  collapsed?: boolean
  /** Texto longo, mostrado no painel ao lado em vez de no desenho. */
  note?: string
  /** Endereço aberto no navegador. */
  url?: string
  color?: string
  /** Fundo na cor do nó (senão, só a borda). */
  filled?: boolean
  /** Formato do balão; sem ele, arredondado. */
  shape?: MindShape
  bold?: boolean
  /** Texto maior. */
  big?: boolean
  ref?: MindRef
}

export type MindShape = 'pill' | 'rect' | 'plain'

export type MindLayout = 'map' | 'right' | 'down' | 'radial'

export interface MindMap {
  root: MindNode
  /** Padrão: 'map' (ramos para os dois lados). */
  layout?: MindLayout
  /** Espessura das linhas, de 1 a 6. */
  lineWidth?: number
  /** Uma cor só para as linhas; sem ela, cada ramo usa a cor do próprio nó. */
  lineColor?: string
  /**
   * Tópicos arrastados para fora do lugar automático, por arranjo: deslocamento (x, y) em relação
   * ao lugar calculado. O ramo inteiro vai junto.
   */
  moved?: Partial<Record<MindLayout, Record<string, [number, number]>>>
}

/** Espaços (workspaces) e bibliotecas compartilham a mesma estrutura. */
export interface Board {
  id: string
  title: string
  kind: Kind
  color?: string
  sections: Section[]
  sheet?: TargetSheet
  /** Mapa mental editado. Sem ele, o mapa é gerado das seções e itens. */
  mindmap?: MindMap
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
  /** Sem `board`, abre o último mapa visto. */
  | { type: 'mindmap'; board?: { type: BoardType; id: string } }
  | { type: 'settings'; tab?: SettingsTab }
