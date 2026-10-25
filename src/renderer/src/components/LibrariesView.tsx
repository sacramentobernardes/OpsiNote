import type { ReactNode } from 'react'
import { BookCopy, Plus } from 'lucide-react'
import { useStore } from '../store'
import { BoardCard } from './HomeView'
import { EmptyState, useContextMenu } from './ui'
import { useBoardMenu } from './BoardMenu'

/** Visão geral das bibliotecas: estruturas reutilizáveis para criar espaços. */
export function LibrariesView(): ReactNode {
  const libraries = useStore((s) => s.data!.libraries)
  const addBoard = useStore((s) => s.addBoard)
  const open = useStore((s) => s.open)
  const contextMenu = useContextMenu()
  const boardMenu = useBoardMenu()

  return (
    <main className="hub">
      <div className="hub-inner">
        <header className="hub-hero hub-hero-row">
          <div>
            <h1>Bibliotecas</h1>
            <p className="muted">Estruturas reutilizáveis. Cada espaço criado a partir delas começa com o checklist zerado.</p>
          </div>
          <button type="button" className="btn primary" onClick={() => addBoard('library', 'other')}>
            <Plus size={15} /> Nova biblioteca
          </button>
        </header>

        {libraries.length === 0 ? (
          <EmptyState icon={<BookCopy size={24} />} title="Nenhuma biblioteca">
            Crie uma do zero ou use “Salvar como biblioteca” em um espaço.
          </EmptyState>
        ) : (
          <div className="card-grid">
            {libraries.map((lib) => {
              const items = lib.sections.reduce((n, s) => n + s.checklist.length + s.notes.length, 0)
              return (
                <BoardCard
                  key={lib.id}
                  board={lib}
                  onClick={() => open({ type: 'library', id: lib.id })}
                  onContextMenu={(e) => contextMenu.open(e, boardMenu('library', lib), `Ações de “${lib.title}”`)}
                  footer={
                    <span className="muted small">
                      {lib.sections.length} {lib.sections.length === 1 ? 'seção' : 'seções'} · {items}{' '}
                      {items === 1 ? 'item' : 'itens'}
                    </span>
                  }
                />
              )
            })}
          </div>
        )}
      </div>
      {contextMenu.menu}
    </main>
  )
}
