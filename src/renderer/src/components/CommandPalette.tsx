import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BookCopy,
  CircleHelp,
  ClipboardList,
  CornerDownLeft,
  Download,
  FileText,
  House,
  Keyboard,
  Layers,
  ListChecks,
  Maximize2,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Sparkles,
  SunMoon,
  Terminal,
  Trash2,
  Timer,
  Upload,
  Waypoints
} from 'lucide-react'
import { useBindings, useStore } from '../store'
import type { ShortcutId, Theme } from '../types'
import { buildIndex, search, type SearchKind, type SearchResult } from '../lib/search'
import { fold, foldWithMap } from '../lib/text'
import { comboHint, comboKeys } from '../lib/shortcuts'
import { cx } from '../lib/util'
import { Modal } from './ui'
import { useImport } from './useImport'
import { pinnedRows } from './PinnedSection'
import { Keys } from './Shortcuts'

interface Command {
  id: string
  label: string
  icon: ReactNode
  shortcut?: ShortcutId
  run: () => void
}

type Row = { type: 'result'; result: SearchResult } | { type: 'command'; command: Command }

const KIND_ICON: Record<SearchKind, ReactNode> = {
  workspace: <Layers size={15} />,
  library: <BookCopy size={15} />,
  sheet: <ClipboardList size={15} />,
  section: <Layers size={15} />,
  entry: <ListChecks size={15} />,
  template: <FileText size={15} />,
  snippetGroup: <Terminal size={15} />,
  snippet: <Terminal size={15} />
}

const THEME_NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_LABEL: Record<Theme, string> = { system: 'do sistema', light: 'claro', dark: 'escuro' }

/** Destaca no texto os trechos que batem com os termos da busca. */
function Highlight({ text, terms }: { text: string; terms: string[] }): ReactNode {
  if (terms.length === 0) return text
  // As posições são achadas no texto dobrado e convertidas para o texto original.
  const { folded, map } = foldWithMap(text)
  const marks: [number, number][] = []
  for (const t of terms) {
    let at = folded.indexOf(t)
    while (at >= 0) {
      marks.push([map[at], map[at + t.length]])
      at = folded.indexOf(t, at + t.length)
    }
  }
  if (marks.length === 0) return text
  marks.sort((a, b) => a[0] - b[0])
  const parts: ReactNode[] = []
  let pos = 0
  for (const [start, end] of marks) {
    if (start < pos) continue
    if (start > pos) parts.push(text.slice(pos, start))
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>)
    pos = end
  }
  parts.push(text.slice(pos))
  return parts
}

/** Ctrl+K: busca em tudo (títulos e conteúdo) e executa comandos. */
export function CommandPalette(): ReactNode {
  const data = useStore((s) => s.data!)
  const setModal = useStore((s) => s.setModal)
  const navigate = useStore((s) => s.navigate)
  const open = useStore((s) => s.open)
  const addBoard = useStore((s) => s.addBoard)
  const toggleFocus = useStore((s) => s.toggleFocus)
  const toggleRail = useStore((s) => s.toggleRail)
  const setTheme = useStore((s) => s.setTheme)
  const addWelcome = useStore((s) => s.addWelcome)
  const startTimer = useStore((s) => s.startTimer)
  const stopTimer = useStore((s) => s.stopTimer)
  const runImport = useImport()
  const keys = useBindings()

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const index = useMemo(() => buildIndex(data), [data])
  const close = (): void => setModal(null)

  const theme = data.settings.theme
  const commands: Command[] = [
    { id: 'new', label: 'Novo espaço', icon: <Plus size={15} />, shortcut: 'newWorkspace', run: () => addBoard('workspace', 'other') },
    { id: 'home', label: 'Ir para o Início', icon: <House size={15} />, run: () => open({ type: 'home' }) },
    { id: 'libraries', label: 'Ir para Bibliotecas', icon: <BookCopy size={15} />, run: () => open({ type: 'libraries' }) },
    { id: 'snippets', label: 'Ir para Snippets', icon: <Terminal size={15} />, run: () => open({ type: 'snippets' }) },
    { id: 'templates', label: 'Ir para Modelos de nota', icon: <FileText size={15} />, run: () => open({ type: 'templates' }) },
    { id: 'timer25', label: 'Iniciar foco de 25 minutos', icon: <Timer size={15} />, run: () => startTimer(25, 'focus') },
    { id: 'timer50', label: 'Iniciar foco de 50 minutos', icon: <Timer size={15} />, run: () => startTimer(50, 'focus') },
    { id: 'break5', label: 'Iniciar pausa de 5 minutos', icon: <Timer size={15} />, run: () => startTimer(5, 'break') },
    { id: 'timerStop', label: 'Parar o temporizador', icon: <Timer size={15} />, run: stopTimer },
    { id: 'graph', label: 'Ir para o Grafo', icon: <Waypoints size={15} />, run: () => open({ type: 'graph' }) },
    { id: 'trash', label: 'Abrir a lixeira', icon: <Trash2 size={15} />, run: () => open({ type: 'trash' }) },
    { id: 'focus', label: 'Modo foco', icon: <Maximize2 size={15} />, shortcut: 'focus', run: () => toggleFocus() },
    { id: 'rail', label: 'Expandir ou recolher o menu', icon: <PanelLeft size={15} />, shortcut: 'toggleRail', run: toggleRail },
    {
      id: 'theme',
      label: `Mudar tema para ${THEME_LABEL[THEME_NEXT[theme]]}`,
      icon: <SunMoon size={15} />,
      run: () => setTheme(THEME_NEXT[theme])
    },
    { id: 'export', label: 'Exportar dados…', icon: <Upload size={15} />, run: () => setModal({ type: 'export' }) },
    { id: 'import', label: 'Importar arquivo…', icon: <Download size={15} />, run: () => void runImport() },
    { id: 'shortcuts', label: 'Atalhos de teclado', icon: <Keyboard size={15} />, shortcut: 'shortcuts', run: () => setModal({ type: 'shortcuts' }) },
    { id: 'settings', label: 'Abrir configurações', icon: <Settings size={15} />, shortcut: 'settings', run: () => open({ type: 'settings' }) },
    { id: 'help', label: 'Ajuda: como usar o OpsiNote', icon: <CircleHelp size={15} />, shortcut: 'help', run: () => open({ type: 'settings', tab: 'help' }) },
    { id: 'welcome', label: 'Abrir o tour de boas-vindas (novo espaço)', icon: <Sparkles size={15} />, run: addWelcome }
  ]

  const q = fold(query.trim())
  const terms = q.split(/\s+/).filter(Boolean)
  const results = q ? search(index, query) : []
  const matchingCommands = q ? commands.filter((c) => terms.every((t) => fold(c.label).includes(t))) : commands
  // Sem busca: espaços recentes primeiro, depois os comandos.
  // Sem busca: os fixados, depois os espaços recentes.
  const pinnedIds = q ? [] : pinnedRows(data).map((r) => r.id)
  const recent: SearchResult[] = q
    ? []
    : [
        ...pinnedIds,
        ...[...data.workspaces]
          .filter((w) => !w.pinned)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 5)
          .map((w) => w.id)
      ]
        .map((id) => ({ doc: index.find((d) => d.key === id)!, score: 0 }))
        .filter((r) => r.doc)

  const rows: Row[] = [
    ...(q ? results : recent).map((result): Row => ({ type: 'result', result })),
    ...matchingCommands.map((command): Row => ({ type: 'command', command }))
  ]

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (row: Row | undefined): void => {
    if (!row) return
    // Fecha antes de agir, para comandos que abrem outra janela.
    close()
    if (row.type === 'result') navigate(row.result.doc.target)
    else row.command.run()
  }

  const firstCommand = rows.findIndex((r) => r.type === 'command')

  return (
    <Modal labelledBy="palette-input" className="palette" onClose={close}>
      <div className="palette-box">
        <label className="palette-search">
          <Search size={17} />
          <input
            id="palette-input"
            autoFocus
            placeholder="Buscar itens, notas, snippets… ou digite um comando"
            value={query}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows.length ? `palette-row-${active}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(rows.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(rows[active])
              }
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <ul className="palette-list" id="palette-list" role="listbox" ref={list}>
          {rows.length === 0 && <li className="palette-empty">Nada encontrado para “{query}”.</li>}
          {rows.map((row, i) => {
            const heading =
              i === 0 && row.type === 'result' ? (q ? 'Resultados' : 'Espaços recentes') : i === firstCommand ? 'Comandos' : null
            return (
              <li key={row.type === 'result' ? row.result.doc.key : row.command.id} role="presentation">
                {heading && <div className="palette-heading">{heading}</div>}
                <div
                  id={`palette-row-${i}`}
                  data-row={i}
                  role="option"
                  aria-selected={i === active}
                  className={cx('palette-row', i === active && 'active')}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(row)}
                >
                  <span className="palette-icon">{row.type === 'result' ? KIND_ICON[row.result.doc.kind] : row.command.icon}</span>
                  {row.type === 'result' ? (
                    <span className="palette-text">
                      <span className="palette-title">
                        <Highlight text={row.result.doc.title} terms={terms} />
                      </span>
                      <span className="palette-path">{row.result.doc.path}</span>
                      {row.result.excerpt && (
                        <span className="palette-excerpt">
                          <Highlight text={row.result.excerpt} terms={terms} />
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="palette-text">
                      <span className="palette-title">{row.command.label}</span>
                    </span>
                  )}
                  {row.type === 'command' && row.command.shortcut && keys[row.command.shortcut] && (
                    <kbd>{comboHint(keys[row.command.shortcut])}</kbd>
                  )}
                  {i === active && <CornerDownLeft size={14} className="palette-enter" aria-hidden />}
                </div>
              </li>
            )
          })}
        </ul>
        <footer className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>Enter</kbd> abrir
          </span>
          {keys.shortcuts && (
            <span>
              <Keys keys={comboKeys(keys.shortcuts)} /> atalhos
            </span>
          )}
        </footer>
      </div>
    </Modal>
  )
}
