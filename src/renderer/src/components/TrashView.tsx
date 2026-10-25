import { useState, type ReactNode } from 'react'
import { BookCopy, FileText, Layers, ListChecks, RotateCcw, Search, StickyNote, Terminal, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { TrashItem } from '../types'
import { TRASH_DAYS, trashTitle } from '../lib/trash'
import { fold } from '../lib/text'
import { ConfirmButton, EmptyState } from './ui'

const DAY = 24 * 60 * 60 * 1000

function describe(item: TrashItem): { icon: ReactNode; kind: string; origin: string } {
  switch (item.kind) {
    case 'board':
      return item.boardType === 'workspace'
        ? { icon: <Layers size={15} />, kind: 'Espaço', origin: 'Espaços' }
        : { icon: <BookCopy size={15} />, kind: 'Biblioteca', origin: 'Bibliotecas' }
    case 'section':
      return { icon: <Layers size={15} />, kind: 'Seção', origin: item.boardTitle }
    case 'entry':
      return item.list === 'checklist'
        ? { icon: <ListChecks size={15} />, kind: 'Item', origin: `${item.boardTitle} › ${item.sectionTitle}` }
        : { icon: <StickyNote size={15} />, kind: 'Nota', origin: `${item.boardTitle} › ${item.sectionTitle}` }
    case 'template':
      return { icon: <FileText size={15} />, kind: 'Modelo', origin: 'Modelos de nota' }
    case 'snippetGroup':
      return { icon: <Terminal size={15} />, kind: 'Grupo de snippets', origin: 'Snippets' }
    case 'snippet':
      return { icon: <Terminal size={15} />, kind: 'Snippet', origin: item.groupTitle }
  }
}

const startOfDay = (t: number): number => new Date(t).setHours(0, 0, 0, 0)

function when(deletedAt: number, now: number): string {
  // Dias de calendário (não blocos de 24h): excluído anteontem às 23h não é "ontem".
  const days = Math.round((startOfDay(now) - startOfDay(deletedAt)) / DAY)
  const date = new Date(deletedAt)
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (days <= 0) return `hoje, ${time}`
  if (days === 1) return `ontem, ${time}`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function daysLeft(deletedAt: number, now: number): number {
  return Math.max(0, TRASH_DAYS - Math.floor((now - deletedAt) / DAY))
}

/** Itens excluídos: restaurar ou apagar de vez. */
export function TrashView(): ReactNode {
  const trash = useStore((s) => s.data!.trash)
  const restore = useStore((s) => s.restoreTrash)
  const deleteForever = useStore((s) => s.deleteTrashForever)
  const emptyTrash = useStore((s) => s.emptyTrash)
  const [query, setQuery] = useState('')
  const now = Date.now()

  const q = fold(query.trim())
  const visible = q ? trash.filter((t) => fold(trashTitle(t)).includes(q)) : trash

  return (
    <main className="hub">
      <div className="hub-inner">
        <header className="hub-hero hub-hero-row">
          <div>
            <h1>Lixeira</h1>
            <p className="muted">
              O que você exclui fica aqui por {TRASH_DAYS} dias e depois é apagado de vez. Restaurar devolve o item ao lugar de onde
              saiu.
            </p>
          </div>
          {trash.length > 0 && (
            <ConfirmButton className="btn danger-btn" title="Esvaziar lixeira" onConfirm={emptyTrash}>
              <Trash2 size={15} /> Esvaziar lixeira
            </ConfirmButton>
          )}
        </header>

        {trash.length === 0 ? (
          <EmptyState icon={<Trash2 size={26} />} title="A lixeira está vazia">
            Itens, notas, seções, espaços e snippets excluídos aparecem aqui.
          </EmptyState>
        ) : (
          <>
            <div className="hub-toolbar">
              <h2>
                {trash.length} {trash.length === 1 ? 'item' : 'itens'}
              </h2>
              <label className="search">
                <Search size={14} />
                <input id="trash-search" placeholder="Buscar na lixeira" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            </div>
            <ul className="trash-list">
              {visible.map((item) => {
                const d = describe(item)
                const left = daysLeft(item.deletedAt, now)
                return (
                  <li key={item.id} className="trash-item">
                    <span className="trash-icon">{d.icon}</span>
                    <div className="trash-text">
                      <span className="trash-title">{trashTitle(item)}</span>
                      <span className="trash-meta">
                        {d.kind} · de {d.origin} · excluído {when(item.deletedAt, now)}
                        {left <= 3 && <strong> · some em {left === 0 ? 'menos de 1 dia' : `${left} ${left === 1 ? 'dia' : 'dias'}`}</strong>}
                      </span>
                    </div>
                    <button type="button" className="btn small" onClick={() => restore(item.id)}>
                      <RotateCcw size={14} /> Restaurar
                    </button>
                    <ConfirmButton title="Excluir de vez" onConfirm={() => deleteForever(item.id)}>
                      <Trash2 size={15} />
                    </ConfirmButton>
                  </li>
                )
              })}
              {visible.length === 0 && <p className="list-hint">Nada encontrado para “{query}”.</p>}
            </ul>
          </>
        )}
      </div>
    </main>
  )
}
