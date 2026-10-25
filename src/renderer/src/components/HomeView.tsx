import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { BookCopy, Layers, Search } from 'lucide-react'
import { useStore } from '../store'
import type { Board, Kind } from '../types'
import { KINDS, KIND_LABELS, cx, initials, progress } from '../lib/util'
import { fold } from '../lib/text'
import { KindIcon } from './KindIcon'
import { EmptyState, ProgressBar, useContextMenu } from './ui'
import { useBoardMenu } from './BoardMenu'
import { PinnedSection } from './PinnedSection'

export function HomeView(): ReactNode {
  const workspaces = useStore((s) => s.data!.workspaces)
  const libraries = useStore((s) => s.data!.libraries)
  const addBoard = useStore((s) => s.addBoard)
  const open = useStore((s) => s.open)
  const contextMenu = useContextMenu()
  const boardMenu = useBoardMenu()

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind | 'all'>('all')

  const q = fold(query.trim())
  const visible = [...workspaces]
    .filter((ws) => (kind === 'all' || ws.kind === kind) && fold(ws.title).includes(q))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)

  return (
    <main className="hub">
      <div className="hub-inner">
        <header className="hub-hero">
          <h1>O que vamos organizar hoje?</h1>
          <p className="muted">Crie um espaço do zero, comece a partir de uma biblioteca ou continue de onde parou.</p>
        </header>

        <PinnedSection />

        <div className="quick-create">
          {KINDS.map((k) => (
            <button key={k} type="button" className="kind-card" onClick={() => addBoard('workspace', k)}>
              <span className="kind-card-icon">
                <KindIcon kind={k} size={18} />
              </span>
              <span>{KIND_LABELS[k]}</span>
            </button>
          ))}
        </div>

        {libraries.length > 0 && (
          <>
            <h2>Começar com uma biblioteca</h2>
            <div className="chip-row">
              {libraries.map((lib) => (
                <button
                  key={lib.id}
                  type="button"
                  className="chip"
                  title="Criar um espaço a partir desta biblioteca · botão direito para mais ações"
                  onClick={() => addBoard('workspace', lib.kind, lib.id)}
                  onContextMenu={(e) => contextMenu.open(e, boardMenu('library', lib), `Ações de “${lib.title}”`)}
                >
                  <BookCopy size={14} /> {lib.title}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="hub-toolbar">
          <h2>Seus espaços</h2>
          <label className="search">
            <Search size={14} />
            <input placeholder="Buscar espaço" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        <div className="kind-filter" role="group" aria-label="Filtrar por categoria">
          <button type="button" className={cx('chip small', kind === 'all' && 'active')} onClick={() => setKind('all')}>
            Todos
          </button>
          {KINDS.map((k) => (
            <button key={k} type="button" className={cx('chip small', kind === k && 'active')} onClick={() => setKind(k)}>
              <KindIcon kind={k} size={12} /> {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={<Layers size={24} />} title={workspaces.length ? 'Nenhum espaço encontrado' : 'Nenhum espaço ainda'} />
        ) : (
          <div className="card-grid">
            {visible.map((ws) => (
              <BoardCard
                key={ws.id}
                board={ws}
                onClick={() => open({ type: 'workspace', id: ws.id })}
                onContextMenu={(e) => contextMenu.open(e, boardMenu('workspace', ws), `Ações de “${ws.title}”`)}
              />
            ))}
          </div>
        )}
      </div>
      {contextMenu.menu}
    </main>
  )
}

export function BoardCard({
  board,
  onClick,
  onContextMenu,
  footer
}: {
  board: Board
  onClick: () => void
  onContextMenu?: (e: ReactMouseEvent<HTMLElement>) => void
  footer?: ReactNode
}): ReactNode {
  const p = progress(board.sections)
  const items = board.sections.reduce((n, s) => n + s.checklist.length + s.notes.length, 0)
  return (
    <button
      type="button"
      className="ws-card"
      style={board.color ? ({ '--ws-color': board.color } as CSSProperties) : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span className="ws-card-top">
        <span className="ws-avatar static">{initials(board.title)}</span>
        <span className="ws-card-kind">
          <KindIcon kind={board.kind} size={12} /> {KIND_LABELS[board.kind]}
        </span>
      </span>
      <span className="ws-card-title">{board.title}</span>
      {footer ?? (
        <>
          <ProgressBar percent={p.percent} color={board.color} />
          <span className="muted small">
            {p.total === 0 ? `${items} ${items === 1 ? 'item' : 'itens'}` : `${p.done} de ${p.total} concluídos`}
          </span>
        </>
      )}
    </button>
  )
}
