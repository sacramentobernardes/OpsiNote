import { memo, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BookCopy,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Copy,
  FileText,
  FolderInput,
  Layers,
  Plus,
  StickyNote,
  Trash,
  Pin,
  PinOff,
} from 'lucide-react'
import { useActiveBoard, useBinding, useStore } from '../store'
import { comboHint, withHint } from '../lib/shortcuts'
import type { Board, BoardType, Entry, Kind, ListType, Section, Template } from '../types'
import type { EntryRef } from '../lib/ops'
import { KINDS, KIND_LABELS, cx, pinnedFirst, progress } from '../lib/util'
import { useBoardMenu } from './BoardMenu'
import { ActionMenu, ColorPicker, DocEmpty, DocPage, EmptyState, InlineEdit, PanelHeader, ProgressBar, QuickAdd } from './ui'
import { SortableList } from './SortableList'
import { RichEditor } from './RichEditor'
import { PanelResizer } from './Resizer'
import { SheetDocument } from './SheetDocument'
import { SHEET_SPECS } from '../lib/sheets'
import { sheetValues, sheetVariables } from '../lib/variables'

const NO_TEMPLATES: Template[] = []
/** Mesma largura do CSS em que painel e documento se alternam. */
const NARROW = '(max-width: 860px)'
const LIST_LABELS: Record<ListType, string> = { checklist: 'Checklist', notes: 'Notas' }

/** Painel em árvore + documento para um Espaço ou uma Biblioteca. */
export function BoardView(): ReactNode {
  const active = useActiveBoard()
  const sectionId = useStore((s) => s.sectionId)
  const list = useStore((s) => s.list)
  const entryId = useStore((s) => s.entryId)
  const sheetOpen = useStore((s) => s.sheetOpen)

  if (!active) return null
  const { type, board } = active
  const section = board.sections.find((s) => s.id === sectionId)
  const entry = section?.[list].find((e) => e.id === entryId)

  let main: ReactNode
  if (sheetOpen) main = <SheetDocument type={type} board={board} />
  else if (section && entry) main = <EntryDocument key={entry.id} type={type} board={board} section={section} list={list} entry={entry} />
  else
    main = (
      <DocEmpty icon={<StickyNote size={28} />} title="Nada aberto">
        Escolha um item ou uma nota na árvore ao lado.
      </DocEmpty>
    )

  return (
    <>
      <aside className="panel">
        <BoardHeader type={type} board={board} />
        <div className="panel-scroll">
          <SheetRow type={type} board={board} active={sheetOpen} />
          {board.sections.length === 0 ? (
            <EmptyState icon={<Layers size={24} />} title="Nenhuma seção">
              Crie uma seção para começar a organizar itens.
            </EmptyState>
          ) : (
            board.sections.map((s, i) => (
              <SectionNode
                key={s.id}
                type={type}
                boardId={board.id}
                section={s}
                entryId={entryId}
                isFirst={i === 0}
                isLast={i === board.sections.length - 1}
              />
            ))
          )}
          <AddSectionButton type={type} board={board} />
        </div>
        <PanelResizer />
      </aside>
      {main}
    </>
  )
}

function BoardHeader({ type, board }: { type: BoardType; board: Board }): ReactNode {
  const updateBoard = useStore((s) => s.updateBoard)
  const addBoard = useStore((s) => s.addBoard)
  const saveAsLibrary = useStore((s) => s.saveAsLibrary)
  const boardMenu = useBoardMenu()
  const p = progress(board.sections)

  return (
    <PanelHeader
      eyebrow={type === 'workspace' ? 'Espaço' : 'Biblioteca'}
      title={
        <>
          <ColorPicker value={board.color} onChange={(color) => updateBoard(type, board.id, { color })} />
          <InlineEdit className="panel-title" value={board.title} onChange={(title) => updateBoard(type, board.id, { title })} />
          <ActionMenu label={`Ações ${type === 'workspace' ? 'do espaço' : 'da biblioteca'}`} items={boardMenu(type, board, { inHeader: true })} />
        </>
      }
    >
      <div className="panel-meta">
        <select
          className="kind-select"
          value={board.kind}
          onChange={(e) => updateBoard(type, board.id, { kind: e.target.value as Kind })}
          aria-label="Categoria"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {type === 'library' ? (
          <button type="button" className="btn primary small" onClick={() => addBoard('workspace', board.kind, board.id)}>
            <Plus size={14} /> Criar espaço
          </button>
        ) : (
          <button
            type="button"
            className="btn small"
            title="Salva a estrutura deste espaço como uma biblioteca reutilizável"
            onClick={() => saveAsLibrary(board.id)}
          >
            <BookCopy size={14} /> Salvar como biblioteca
          </button>
        )}
      </div>
      {type === 'workspace' && p.total > 0 && (
        <div className="panel-progress">
          <ProgressBar percent={p.percent} color={board.color} />
          <span>{p.percent}%</span>
        </div>
      )}
    </PanelHeader>
  )
}

/** Primeira linha da árvore: abre a ficha, que muda conforme a categoria. */
function SheetRow({ type, board, active }: { type: BoardType; board: Board; active: boolean }): ReactNode {
  const openSheet = useStore((s) => s.openSheet)
  const filled = board.sheet?.vars.filter((v) => v.key.trim() && v.value.trim()).length ?? 0
  return (
    <div className={cx('entry-row sheet-row', active && 'selected')} onClick={openSheet}>
      <span className="entry-icon">
        <ClipboardList size={15} />
      </span>
      <span className="entry-title">{SHEET_SPECS[board.kind].title}{type === 'library' && ' (modelo)'}</span>
      {filled > 0 && <span className="tree-count">{filled}</span>}
    </div>
  )
}

/*
 * A árvore recebe só ids e objetos que o Immer mantém iguais quando não mudam:
 * com memo, digitar em uma nota redesenha só a seção dela, não a árvore inteira.
 */
const SectionNode = memo(function SectionNode({
  type,
  boardId,
  section,
  entryId,
  isFirst,
  isLast
}: {
  type: BoardType
  boardId: string
  section: Section
  entryId: string | null
  isFirst: boolean
  isLast: boolean
}): ReactNode {
  const renameSection = useStore((s) => s.renameSection)
  const removeSection = useStore((s) => s.removeSection)
  const duplicateSection = useStore((s) => s.duplicateSection)
  const reorderSection = useStore((s) => s.reorderSection)
  const setCollapsed = useStore((s) => s.setSectionCollapsed)
  const setModal = useStore((s) => s.setModal)
  const collapsed = !!section.collapsed
  const p = progress([section])

  return (
    <section className={cx('tree-node', collapsed && 'collapsed')}>
      <div className="tree-head">
        <button
          type="button"
          className="tree-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandir seção' : 'Recolher seção'}
          onClick={() => setCollapsed(type, boardId, section.id, !collapsed)}
        >
          <ChevronRight size={14} />
        </button>
        <InlineEdit
          className="tree-title"
          value={section.title}
          onChange={(title) => renameSection(type, boardId, section.id, title)}
        />
        {type === 'workspace' && p.total > 0 && (
          <span className={cx('tree-count', p.done === p.total && 'complete')}>
            {p.done}/{p.total}
          </span>
        )}
        <ActionMenu
          className="row-action"
          label="Ações da seção"
          items={[
            { label: 'Duplicar seção', icon: <Copy size={14} />, onSelect: () => duplicateSection(type, boardId, section.id) },
            {
              label: 'Mover para…',
              icon: <FolderInput size={14} />,
              onSelect: () => setModal({ type: 'move', target: { kind: 'section', boardType: type, boardId: boardId, sectionId: section.id } })
            },
            isFirst ? null : { label: 'Mover para cima', icon: <ArrowUp size={14} />, onSelect: () => reorderSection(type, boardId, section.id, -1) },
            isLast ? null : { label: 'Mover para baixo', icon: <ArrowDown size={14} />, onSelect: () => reorderSection(type, boardId, section.id, 1) },
            { label: 'Excluir seção', icon: <Trash size={14} />, danger: true, onSelect: () => removeSection(type, boardId, section.id) }
          ]}
        />
      </div>
      {!collapsed && (
        <div className="tree-body">
          <EntryGroup type={type} boardId={boardId} section={section} list="checklist" entryId={entryId} />
          <EntryGroup type={type} boardId={boardId} section={section} list="notes" entryId={entryId} />
        </div>
      )}
    </section>
  )
})

/** Ações de uma entrada, usadas no menu da linha e na barra do documento. */
function useEntryActions(ref: EntryRef, pinned: boolean): { label: string; icon: ReactNode; danger?: boolean; hint?: string; onSelect: () => void }[] {
  const duplicateEntry = useStore((s) => s.duplicateEntry)
  const removeEntry = useStore((s) => s.removeEntry)
  const setModal = useStore((s) => s.setModal)
  const duplicateKeys = useBinding('duplicate')
  const togglePin = useStore((s) => s.togglePin)
  return [
    pinned
      ? { label: 'Desafixar', icon: <PinOff size={14} />, onSelect: () => togglePin({ kind: 'entry', ref }) }
      : { label: 'Fixar no topo', icon: <Pin size={14} />, onSelect: () => togglePin({ kind: 'entry', ref }) },
    { label: 'Duplicar', icon: <Copy size={14} />, hint: comboHint(duplicateKeys), onSelect: () => duplicateEntry(ref) },
    { label: 'Mover para…', icon: <FolderInput size={14} />, onSelect: () => setModal({ type: 'move', target: { kind: 'entry', ref } }) },
    {
      label: 'Excluir',
      icon: <Trash size={14} />,
      danger: true,
      onSelect: () => removeEntry(ref.boardType, ref.boardId, ref.sectionId, ref.list, ref.entryId)
    }
  ]
}

const EntryRow = memo(function EntryRow({
  type,
  boardId,
  sectionId,
  list,
  entry,
  selected,
  handle
}: {
  type: BoardType
  boardId: string
  sectionId: string
  list: ListType
  entry: Entry
  selected: boolean
  handle: ReactNode
}): ReactNode {
  const selectItem = useStore((s) => s.selectItem)
  const updateEntry = useStore((s) => s.updateEntry)
  const actions = useEntryActions({ boardType: type, boardId: boardId, sectionId: sectionId, list, entryId: entry.id }, !!entry.pinned)
  const isChecklist = list === 'checklist'

  return (
    <div
      className={cx('entry-row', selected && 'selected', entry.done && 'done')}
      data-entry-id={entry.id}
      onClick={() => selectItem(sectionId, list, entry.id)}
    >
      {handle}
      {type === 'workspace' && isChecklist ? (
        <input
          type="checkbox"
          className="entry-check"
          checked={!!entry.done}
          aria-label={`Concluir ${entry.title}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateEntry(type, boardId, sectionId, list, entry.id, { done: e.target.checked })}
        />
      ) : (
        <span className="entry-icon">{isChecklist ? <CircleCheck size={14} /> : <FileText size={14} />}</span>
      )}
      <span className="entry-title">{entry.title}</span>
      {entry.pinned && <Pin size={12} className="entry-pin" aria-label="Fixado" />}
      {entry.color && <span className="entry-color" style={{ background: entry.color }} />}
      <ActionMenu className="row-action" label={`Ações de “${entry.title}”`} items={actions} />
    </div>
  )
})

function EntryGroup({
  type,
  boardId,
  section,
  list,
  entryId
}: {
  type: BoardType
  boardId: string
  section: Section
  list: ListType
  entryId: string | null
}): ReactNode {
  const addEntry = useStore((s) => s.addEntry)
  const moveEntry = useStore((s) => s.moveEntry)
  const templates = useStore((s) => s.data?.templates ?? NO_TEMPLATES)

  const entries = section[list]
  // Fixados primeiro na tela; arrastar continua mexendo na ordem guardada (pelos ids).
  const shown = pinnedFirst(entries)
  const at = (i: number): number => entries.indexOf(shown[i])
  const isChecklist = list === 'checklist'

  return (
    <div className="tree-group">
      <div className="tree-group-label">
        {LIST_LABELS[list]} <span>{entries.length}</span>
      </div>
      {entries.length > 0 && (
        <SortableList
          items={shown}
          onMove={(from, to) => moveEntry(type, boardId, section.id, list, at(from), at(to))}
          renderItem={(entry: Entry, handle) => (
            <EntryRow
              type={type}
              boardId={boardId}
              sectionId={section.id}
              list={list}
              entry={entry}
              selected={entry.id === entryId}
              handle={handle}
            />
          )}
        />
      )}
      <div className="add-row">
        <QuickAdd
          placeholder={isChecklist ? '+ Adicionar item' : '+ Nova nota'}
          // Em janela estreita, abrir o item esconderia a árvore (painel e documento se alternam)
          // e o próximo item não teria onde ser digitado: lá ele só é acrescentado.
          onAdd={(title) => addEntry(type, boardId, section.id, list, title, '', !window.matchMedia(NARROW).matches)}
        />
        {!isChecklist && templates.length > 0 && (
          <select
            className="template-select"
            value=""
            aria-label="Criar nota a partir de um modelo"
            onChange={(e) => {
              const template = templates.find((t) => t.id === e.target.value)
              if (template) addEntry(type, boardId, section.id, 'notes', template.title, template.content)
            }}
          >
            <option value="">Modelo…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

function AddSectionButton({ type, board }: { type: BoardType; board: Board }): ReactNode {
  const addSection = useStore((s) => s.addSection)
  return (
    <button type="button" className="btn small ghost tree-add-section" onClick={() => addSection(type, board.id)}>
      <Plus size={14} /> Nova seção
    </button>
  )
}

function EntryDocument({
  type,
  board,
  section,
  list,
  entry
}: {
  type: BoardType
  board: Board
  section: Section
  list: ListType
  entry: Entry
}): ReactNode {
  const updateEntry = useStore((s) => s.updateEntry)
  const update = (patch: Partial<Omit<Entry, 'id'>>): void => updateEntry(type, board.id, section.id, list, entry.id, patch)
  const actions = useEntryActions({ boardType: type, boardId: board.id, sectionId: section.id, list, entryId: entry.id }, !!entry.pinned)
  const doneKeys = useBinding('toggleDone')

  return (
    <DocPage
      crumbs={[board.title, section.title, LIST_LABELS[list]]}
      actions={
        <>
          {type === 'workspace' && list === 'checklist' && (
            <button
              type="button"
              className={cx('done-toggle', entry.done && 'on')}
              onClick={() => update({ done: !entry.done })}
              title={withHint(entry.done ? 'Marcar como pendente' : 'Marcar como concluído', doneKeys)}
            >
              <CircleCheck size={16} /> {entry.done ? 'Concluído' : 'Pendente'}
            </button>
          )}
          <ColorPicker value={entry.color} onChange={(color) => update({ color })} />
          <ActionMenu label="Mais ações" items={actions} />
        </>
      }
    >
      <InlineEdit className="doc-title" value={entry.title} onChange={(title) => update({ title })} />
      <RichEditor
        content={entry.content}
        onChange={(content) => update({ content })}
        // Nas bibliotecas a ficha é só modelo: as {{variáveis}} ficam para preencher depois.
        snippetValues={type === 'workspace' ? sheetValues(board.sheet) : undefined}
        variables={type === 'workspace' ? sheetVariables(board.sheet) : sheetVariables(board.sheet).map((v) => ({ ...v, value: '' }))}
      />
    </DocPage>
  )
}
