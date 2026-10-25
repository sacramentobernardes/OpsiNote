import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BookCopy, ChevronRight, DatabaseBackup, FileCode, FileText, FileType, Globe, Layers, Search, Sheet, Terminal, Upload } from 'lucide-react'
import { useStore } from '../store'
import type { AppData, Board, BoardType } from '../types'
import { buildExport } from '../lib/exportData'
import { EXPORT_FORMATS, renderExport, type ExportFormat } from '../lib/exportFormats'
import { KIND_LABELS, cx } from '../lib/util'
import { fold } from '../lib/text'
import { KindIcon } from './KindIcon'

type GroupKey = 'workspaces' | 'libraries' | 'templates' | 'snippetGroups'
type Selection = Record<GroupKey, Set<string>>

interface Item {
  id: string
  title: string
  icon: ReactNode
  meta: string
}

const GROUP_ORDER: GroupKey[] = ['workspaces', 'libraries', 'templates', 'snippetGroups']
const GROUP_INFO: Record<GroupKey, { label: string; icon: ReactNode }> = {
  workspaces: { label: 'Espaços', icon: <Layers size={15} /> },
  libraries: { label: 'Bibliotecas', icon: <BookCopy size={15} /> },
  templates: { label: 'Modelos de nota', icon: <FileText size={15} /> },
  snippetGroups: { label: 'Snippets', icon: <Terminal size={15} /> }
}

const FORMAT_ICONS: Record<ExportFormat, ReactNode> = {
  json: <DatabaseBackup size={16} />,
  html: <Globe size={16} />,
  md: <FileCode size={16} />,
  csv: <Sheet size={16} />,
  txt: <FileType size={16} />
}

/* O último formato usado volta selecionado (preferência deste computador). */
const FORMAT_PREF = 'opsinote.exportFormat'

function readFormat(): ExportFormat {
  try {
    const v = localStorage.getItem(FORMAT_PREF)
    return EXPORT_FORMATS.some((f) => f.id === v) ? (v as ExportFormat) : 'json'
  } catch {
    return 'json'
  }
}

function writeFormat(format: ExportFormat): void {
  try {
    localStorage.setItem(FORMAT_PREF, format)
  } catch {
    // Sem armazenamento local: o formato volta ao padrão na próxima vez.
  }
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

function boardMeta(b: Board): string {
  const items = b.sections.reduce((n, s) => n + s.checklist.length + s.notes.length, 0)
  return `${KIND_LABELS[b.kind]} · ${plural(items, 'item', 'itens')}`
}

function itemsOf(data: AppData): Record<GroupKey, Item[]> {
  const board = (b: Board): Item => ({ id: b.id, title: b.title, icon: <KindIcon kind={b.kind} size={14} />, meta: boardMeta(b) })
  return {
    workspaces: data.workspaces.map(board),
    libraries: data.libraries.map(board),
    templates: data.templates.map((t) => ({ id: t.id, title: t.title, icon: <FileText size={14} />, meta: 'Modelo' })),
    snippetGroups: data.snippetGroups.map((g) => ({
      id: g.id,
      title: g.title,
      icon: <Terminal size={14} />,
      meta: plural(g.items.length, 'snippet', 'snippets')
    }))
  }
}

const allSelected = (items: Record<GroupKey, Item[]>): Selection => ({
  workspaces: new Set(items.workspaces.map((i) => i.id)),
  libraries: new Set(items.libraries.map((i) => i.id)),
  templates: new Set(items.templates.map((i) => i.id)),
  snippetGroups: new Set(items.snippetGroups.map((i) => i.id))
})

/** Só um espaço ou biblioteca marcado (aberto pelo menu do botão direito). */
const onlySelected = (only: { type: BoardType; id: string }): Selection => ({
  workspaces: new Set(only.type === 'workspace' ? [only.id] : []),
  libraries: new Set(only.type === 'library' ? [only.id] : []),
  templates: new Set(),
  snippetGroups: new Set()
})

/** Data local (não UTC) para o nome do arquivo. */
function today(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function ExportDialog({ only, onClose }: { only?: { type: BoardType; id: string }; onClose: () => void }): ReactNode {
  const data = useStore((s) => s.data!)
  const showToast = useStore((s) => s.showToast)
  const ref = useRef<HTMLDialogElement>(null)

  const items = useMemo(() => itemsOf(data), [data])
  const [selected, setSelected] = useState<Selection>(() => (only ? onlySelected(only) : allSelected(items)))
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(new Set())
  const [query, setQuery] = useState('')
  const [resetChecklists, setResetChecklists] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formatId, setFormatId] = useState<ExportFormat>(readFormat)
  const format = EXPORT_FORMATS.find((f) => f.id === formatId) ?? EXPORT_FORMATS[0]

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const q = fold(query.trim())
  const visible = (key: GroupKey): Item[] => (q ? items[key].filter((i) => fold(i.title).includes(q)) : items[key])

  const total = GROUP_ORDER.reduce((n, k) => n + items[k].length, 0)
  const chosen = GROUP_ORDER.reduce((n, k) => n + selected[k].size, 0)
  const isEverything = chosen === total && !resetChecklists

  const update = (key: GroupKey, ids: string[], on: boolean): void =>
    setSelected((prev) => {
      const next = new Set(prev[key])
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return { ...prev, [key]: next }
    })

  // "Marcar/Desmarcar tudo" respeitam a busca: agem só sobre o que está visível.
  const setAllVisible = (on: boolean): void => {
    for (const key of GROUP_ORDER) update(key, visible(key).map((i) => i.id), on)
  }

  const toggleCollapsed = (key: GroupKey): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const handleExport = async (): Promise<void> => {
    setSaving(true)
    const file = buildExport(data, selected, resetChecklists)
    const isBackup = isEverything && format.id === 'json'
    const name = `opsinote-${isBackup ? 'backup' : 'export'}-${today()}.${format.ext}`
    try {
      const ok = await window.api.exportFile(renderExport(format.id, file), name)
      if (ok) {
        writeFormat(format.id)
        showToast(isBackup ? 'Backup completo exportado' : `${plural(chosen, 'item exportado', 'itens exportados')} em ${format.label}`)
        ref.current?.close()
      }
    } catch (err) {
      showToast(`Não foi possível exportar: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={ref}
      className="modal export-dialog"
      aria-labelledby="export-title"
      onClose={onClose}
      onClick={(e) => {
        // Clique no fundo escurecido (fora da caixa) fecha.
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      <div className="modal-box">
        <header className="modal-header">
          <h2 id="export-title">Exportar dados</h2>
          <p>Escolha o formato e o que entra no arquivo.</p>
        </header>

        <fieldset className="export-formats">
          <legend>Formato</legend>
          <div className="export-format-list" role="radiogroup" aria-label="Formato do arquivo">
            {EXPORT_FORMATS.map((f) => (
              <label key={f.id} className={cx('export-format', f.id === format.id && 'active')}>
                <input type="radio" name="export-format" value={f.id} checked={f.id === format.id} onChange={() => setFormatId(f.id)} />
                <span className="export-format-icon">{FORMAT_ICONS[f.id]}</span>
                <span className="export-format-name">{f.label}</span>
                <span className="export-format-ext">.{f.ext}</span>
              </label>
            ))}
          </div>
          <p className="export-format-hint">
            {format.description}
            {!format.lossless && ' Para levar tudo para outro computador, prefira o backup (.json).'}
          </p>
        </fieldset>

        <div className="export-toolbar">
          <label className="search">
            <Search size={14} />
            <input
              id="export-search"
              placeholder="Filtrar por nome"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="export-bulk">
            <button type="button" className="btn small ghost" onClick={() => setAllVisible(true)}>
              Marcar tudo
            </button>
            <button type="button" className="btn small ghost" onClick={() => setAllVisible(false)}>
              Desmarcar tudo
            </button>
          </div>
        </div>

        <div className="modal-body">
          {GROUP_ORDER.map((key) => {
            const list = visible(key)
            if (items[key].length === 0 || (q && list.length === 0)) return null
            const count = list.filter((i) => selected[key].has(i.id)).length
            const isOpen = !collapsed.has(key)
            return (
              <section key={key} className={cx('xg', !isOpen && 'collapsed')}>
                <div className="xg-head">
                  <GroupCheckbox
                    id={`export-group-${key}`}
                    label={GROUP_INFO[key].label}
                    checked={count === list.length}
                    indeterminate={count > 0 && count < list.length}
                    onChange={(on) => update(key, list.map((i) => i.id), on)}
                  />
                  <label htmlFor={`export-group-${key}`} className="xg-label">
                    <span className="xg-icon">{GROUP_INFO[key].icon}</span>
                    {GROUP_INFO[key].label}
                  </label>
                  <span className="xg-count">
                    {selected[key].size} de {items[key].length}
                  </span>
                  <button
                    type="button"
                    className="tree-toggle"
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Recolher ${GROUP_INFO[key].label}` : `Expandir ${GROUP_INFO[key].label}`}
                    onClick={() => toggleCollapsed(key)}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                {isOpen && (
                  <ul className="xg-list">
                    {list.map((item) => (
                      <li key={item.id}>
                        <label className="xg-item">
                          <input
                            type="checkbox"
                            id={`export-item-${item.id}`}
                            checked={selected[key].has(item.id)}
                            onChange={(e) => update(key, [item.id], e.target.checked)}
                          />
                          <span className="xg-item-icon">{item.icon}</span>
                          <span className="xg-item-title">{item.title}</span>
                          <span className="xg-item-meta">{item.meta}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          {q && GROUP_ORDER.every((k) => visible(k).length === 0) && <p className="list-hint">Nada encontrado para “{query}”.</p>}
        </div>

        <label className="export-option">
          <input
            type="checkbox"
            id="export-reset"
            checked={resetChecklists}
            onChange={(e) => setResetChecklists(e.target.checked)}
          />
          <span>
            <strong>Zerar checklists</strong>
            <small>Os itens saem todos desmarcados. Bom para compartilhar um roteiro sem o seu progresso.</small>
          </span>
        </label>

        <footer className="modal-footer">
          <span className="export-summary">
            {chosen === 0 ? 'Nada selecionado' : `${chosen} de ${plural(total, 'item', 'itens')}`}
          </span>
          <button type="button" className="btn" onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={chosen === 0 || saving} onClick={handleExport}>
            <Upload size={14} /> {isEverything ? 'Exportar tudo' : 'Exportar seleção'} (.{format.ext})
          </button>
        </footer>
      </div>
    </dialog>
  )
}

/** Caixa de seleção do grupo, com o estado "parcial" quando só alguns itens estão marcados. */
function GroupCheckbox({
  id,
  label,
  checked,
  indeterminate,
  onChange
}: {
  id: string
  label: string
  checked: boolean
  indeterminate: boolean
  onChange: (on: boolean) => void
}): ReactNode {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      id={id}
      aria-label={`Selecionar todos: ${label}`}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}
