import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  BookCopy,
  Database,
  Download,
  FileText,
  House,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sun,
  Terminal,
  Trash2,
  Upload,
  Pin,
  Waypoints,
} from 'lucide-react'
import { useBindings, useStore } from '../store'
import type { Board, Theme, View } from '../types'
import { cx, initials, pinnedFirst, progress } from '../lib/util'
import { comboHint, withHint } from '../lib/shortcuts'
import { Logo } from './Logo'
import { useBoardMenu } from './BoardMenu'
import { useContextMenu } from './ui'
import { RailResizer } from './Resizer'
import { useImport } from './useImport'

const THEME_ORDER: Theme[] = ['system', 'light', 'dark']
const THEME_INFO: Record<Theme, { label: string; icon: ReactNode }> = {
  system: { label: 'Sistema', icon: <Monitor size={18} /> },
  light: { label: 'Claro', icon: <Sun size={18} /> },
  dark: { label: 'Escuro', icon: <Moon size={18} /> }
}

/** Áreas do trilho que, ao receber um clique direto (fora de botões), expandem ou recolhem o menu. */
const TOGGLE_AREAS = ['rail', 'rail-scroll', 'rail-bottom']

/** Trilho de navegação: espaços como avatares e as demais áreas como ícones. */
export function Rail(): ReactNode {
  const expanded = useStore((s) => s.railExpanded)
  const toggleRail = useStore((s) => s.toggleRail)
  const workspaces = useStore((s) => s.data!.workspaces)
  const trashCount = useStore((s) => s.data!.trash.length)
  const theme = useStore((s) => s.data!.settings.theme)
  const view = useStore((s) => s.view)
  const open = useStore((s) => s.open)
  const addBoard = useStore((s) => s.addBoard)
  const setTheme = useStore((s) => s.setTheme)
  const setModal = useStore((s) => s.setModal)
  const reorderBoards = useStore((s) => s.reorderBoards)
  const contextMenu = useContextMenu()
  const boardMenu = useBoardMenu()
  // Estável para não desfazer o memo dos avatares; lê sempre as ações mais recentes.
  const menuRef = useRef({ contextMenu, boardMenu })
  menuRef.current = { contextMenu, boardMenu }
  const openBoardMenu = useCallback((e: ReactMouseEvent<HTMLElement>, board: Board) => {
    const { contextMenu: cm, boardMenu: bm } = menuRef.current
    cm.open(e, bm('workspace', board), `Ações de “${board.title}”`)
  }, [])
  const keys = useBindings()

  // Fixados no topo; arrastar continua usando a ordem guardada (onDragEnd procura pelos ids).
  const railOrder = pinnedFirst(workspaces)

  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]
  // Arrastar só começa depois de 6px, para o clique continuar abrindo o espaço.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Em janelas estreitas o trilho expandido cobre o conteúdo: recolhe ao navegar.
  const collapseIfOverlay = (): void => {
    if (useStore.getState().railExpanded && window.matchMedia('(max-width: 860px)').matches) toggleRail()
  }
  // Estável entre renderizações, para os avatares (memo) não redesenharem a cada tecla.
  const openWorkspace = useCallback((id: string) => {
    useStore.getState().open({ type: 'workspace', id })
    if (useStore.getState().railExpanded && window.matchMedia('(max-width: 860px)').matches) useStore.getState().toggleRail()
  }, [])
  const go = (target: View): void => {
    open(target)
    collapseIfOverlay()
  }

  // Logo e Início levam à tela inicial e também expandem ou recolhem o menu.
  const goHomeAndToggle = (): void => {
    open({ type: 'home' })
    toggleRail()
  }

  const onRailClick = (e: ReactMouseEvent<HTMLElement>): void => {
    const target = e.target as HTMLElement
    if (TOGGLE_AREAS.some((c) => target.classList.contains(c))) toggleRail()
  }

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    const from = workspaces.findIndex((w) => w.id === active.id)
    const to = workspaces.findIndex((w) => w.id === over.id)
    if (from >= 0 && to >= 0) reorderBoards('workspace', from, to)
  }

  return (
    <nav
      className={cx('rail', expanded && 'expanded')}
      aria-label="Navegação"
      title={expanded ? undefined : 'Clique para expandir o menu'}
      onClick={onRailClick}
    >
      <button
        type="button"
        className="rail-logo"
        title={expanded ? 'Início · recolher menu' : 'Início · expandir menu'}
        aria-label="Início"
        aria-expanded={expanded}
        onClick={goHomeAndToggle}
      >
        <Logo size={34} />
        <span className="rail-label rail-brand">OpsiNote</span>
      </button>

      <RailButton label="Início" active={view.type === 'home'} onClick={goHomeAndToggle}>
        <House size={18} />
      </RailButton>
      <RailButton label="Buscar" hint={comboHint(keys.palette)} onClick={() => setModal({ type: 'palette' })}>
        <Search size={18} />
      </RailButton>

      <div className="rail-sep" />

      <div className="rail-scroll">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={railOrder.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            {railOrder.map((ws) => (
              <WorkspaceAvatar
                key={ws.id}
                board={ws}
                active={view.type === 'workspace' && view.id === ws.id}
                onOpen={openWorkspace}
                onMenu={openBoardMenu}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          type="button"
          className="rail-add"
          title={withHint('Novo espaço', keys.newWorkspace)}
          aria-label="Novo espaço"
          onClick={() => {
            addBoard('workspace', 'other')
            collapseIfOverlay()
          }}
        >
          <Plus size={18} />
          <span className="rail-label">Novo espaço</span>
        </button>
      </div>

      <div className="rail-bottom">
        <RailButton
          label="Bibliotecas"
          active={view.type === 'libraries' || view.type === 'library'}
          onClick={() => go({ type: 'libraries' })}
        >
          <BookCopy size={18} />
        </RailButton>
        <RailButton label="Grafo" active={view.type === 'graph'} onClick={() => go({ type: 'graph' })}>
          <Waypoints size={18} />
        </RailButton>
        <RailButton label="Snippets" active={view.type === 'snippets'} onClick={() => go({ type: 'snippets' })}>
          <Terminal size={18} />
        </RailButton>
        <RailButton label="Modelos de nota" active={view.type === 'templates'} onClick={() => go({ type: 'templates' })}>
          <FileText size={18} />
        </RailButton>
        <RailButton label="Lixeira" active={view.type === 'trash'} badge={trashCount || undefined} onClick={() => go({ type: 'trash' })}>
          <Trash2 size={18} />
        </RailButton>
        <div className="rail-sep" />
        <RailButton label="Configurações" hint={comboHint(keys.settings)} active={view.type === 'settings'} onClick={() => go({ type: 'settings' })}>
          <Settings size={18} />
        </RailButton>
        <DataMenu />
        <RailButton label={`Tema: ${THEME_INFO[theme].label}`} onClick={() => setTheme(nextTheme)}>
          {THEME_INFO[theme].icon}
        </RailButton>
        <RailButton label={expanded ? 'Recolher menu' : 'Expandir menu'} hint={comboHint(keys.toggleRail)} onClick={toggleRail}>
          {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </RailButton>
      </div>
      <RailResizer />
      {contextMenu.menu}
    </nav>
  )
}

function RailButton({
  label,
  hint,
  active,
  badge,
  onClick,
  children
}: {
  label: string
  /** Atalho mostrado na dica. */
  hint?: string
  active?: boolean
  badge?: number
  onClick: () => void
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      className={cx('rail-btn', active && 'active')}
      title={hint ? `${label} (${hint})` : label}
      aria-label={badge ? `${label} (${badge})` : label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {children}
      <span className="rail-label">{label}</span>
      {badge !== undefined && <span className="rail-badge">{badge > 99 ? '99+' : badge}</span>}
    </button>
  )
}

const WorkspaceAvatar = memo(function WorkspaceAvatar({
  board,
  active,
  onOpen,
  onMenu
}: {
  board: Board
  active: boolean
  onOpen: (id: string) => void
  onMenu: (e: ReactMouseEvent<HTMLElement>, board: Board) => void
}): ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: board.id })
  const p = progress(board.sections)
  const label = p.total > 0 ? `${board.title} · ${p.percent}%` : board.title
  const style: CSSProperties = {
    ...(board.color ? { '--ws-color': board.color } : {}),
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined
  } as CSSProperties

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cx('rail-item', active && 'active', isDragging && 'dragging', !board.color && 'no-color')}
      style={style}
      {...attributes}
      {...listeners}
      title={`${label} · arraste para reordenar, botão direito para mais ações`}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={() => onOpen(board.id)}
      onContextMenu={(e) => onMenu(e, board)}
    >
      <span className="ws-avatar">
        {initials(board.title)}
        {p.total > 0 && p.done === p.total && <span className="ws-avatar-done" aria-hidden />}
        {board.pinned && (
          <span className="ws-avatar-pin" aria-hidden>
            <Pin size={9} />
          </span>
        )}
      </span>
      <span className="rail-label">{board.title}</span>
      {p.total > 0 && <span className="rail-meta">{p.percent}%</span>}
    </button>
  )
})

function DataMenu(): ReactNode {
  const setModal = useStore((s) => s.setModal)
  const runImport = useImport()
  const [isOpen, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const close = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen])

  return (
    <div className="rail-menu" ref={ref}>
      <RailButton label="Dados" active={isOpen} onClick={() => setOpen((o) => !o)}>
        <Database size={18} />
      </RailButton>
      {isOpen && (
        <div className="menu-popover" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void runImport()
            }}
          >
            <Download size={14} /> Importar arquivos…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setModal({ type: 'export' })
            }}
          >
            <Upload size={14} /> Exportar…
          </button>
        </div>
      )}
    </div>
  )
}
