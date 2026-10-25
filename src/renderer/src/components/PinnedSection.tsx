import type { CSSProperties, ReactNode } from 'react'
import { BookCopy, CircleCheck, Copy, FileText, Pin, Terminal } from 'lucide-react'
import { useStore } from '../store'
import type { AppData, BoardType } from '../types'
import type { SearchTarget } from '../lib/search'
import { KindIcon } from './KindIcon'
import { useSnippetCopy } from './SnippetsView'

interface PinnedRow {
  id: string
  title: string
  path: string
  icon: ReactNode
  target: SearchTarget
  color?: string
  /** Conteúdo do snippet, para copiar direto daqui. */
  snippet?: string
}

/** Tudo o que está fixado, na ordem: espaços e bibliotecas, depois itens e notas, depois snippets. */
export function pinnedRows(data: AppData): PinnedRow[] {
  const rows: PinnedRow[] = []
  const boards: [BoardType, AppData['workspaces']][] = [
    ['workspace', data.workspaces],
    ['library', data.libraries]
  ]
  for (const [type, list] of boards) {
    for (const b of list) {
      if (!b.pinned) continue
      rows.push({
        id: b.id,
        title: b.title,
        path: type === 'workspace' ? 'Espaço' : 'Biblioteca',
        icon: type === 'workspace' ? <KindIcon kind={b.kind} size={14} /> : <BookCopy size={14} />,
        target: { view: { type, id: b.id } },
        color: b.color
      })
    }
  }
  for (const [type, list] of boards) {
    for (const b of list) {
      for (const s of b.sections) {
        for (const listType of ['checklist', 'notes'] as const) {
          for (const e of s[listType]) {
            if (!e.pinned) continue
            rows.push({
              id: e.id,
              title: e.title,
              path: `${b.title} › ${s.title}`,
              icon: listType === 'checklist' ? <CircleCheck size={14} /> : <FileText size={14} />,
              target: { view: { type, id: b.id }, sectionId: s.id, list: listType, entryId: e.id },
              color: e.color ?? b.color
            })
          }
        }
      }
    }
  }
  for (const g of data.snippetGroups) {
    for (const i of g.items) {
      if (!i.pinned) continue
      rows.push({
        id: i.id,
        title: i.title,
        path: `Snippets › ${g.title}`,
        icon: <Terminal size={14} />,
        target: { view: { type: 'snippets' }, entryId: i.id },
        snippet: i.content
      })
    }
  }
  return rows
}

/** Seção "Fixados" do Início: o que foi fixado no topo, a um clique. */
export function PinnedSection(): ReactNode {
  const data = useStore((s) => s.data!)
  const navigate = useStore((s) => s.navigate)
  const copy = useSnippetCopy()
  const rows = pinnedRows(data)

  return (
    <section className="pinned-section" aria-labelledby="pinned-title">
      <h2 id="pinned-title">
        <Pin size={14} /> Fixados
      </h2>
      {rows.length === 0 ? (
        <p className="muted small">
          Fixe espaços, notas, itens e snippets importantes pelo menu <strong>⋯</strong> ou pelo botão direito, em{' '}
          <strong>Fixar no topo</strong>. Eles aparecem aqui e no começo das listas.
        </p>
      ) : (
        <ul className="pinned-list">
          {rows.map((r) => (
            <li key={r.id} className="pinned-row" style={r.color ? ({ '--pin-color': r.color } as CSSProperties) : undefined}>
              <button type="button" className="pinned-open" onClick={() => navigate(r.target)}>
                <span className="pinned-icon">{r.icon}</span>
                <span className="pinned-text">
                  <span className="pinned-title">{r.title}</span>
                  <span className="pinned-path">{r.path}</span>
                </span>
              </button>
              {r.snippet !== undefined && (
                <button
                  type="button"
                  className="icon-btn"
                  title="Copiar com as variáveis preenchidas"
                  aria-label={`Copiar ${r.title}`}
                  onClick={() => copy(r.snippet!)}
                >
                  <Copy size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
