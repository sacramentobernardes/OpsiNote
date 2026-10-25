import type { ReactNode } from 'react'
import { ChevronRight, ClipboardList, Copy, FolderInput, Pin, PinOff, Plus, Terminal, Trash, TriangleAlert } from 'lucide-react'
import { useBinding, useSnippetContext, useStore } from '../store'
import { comboHint, withHint } from '../lib/shortcuts'
import type { Entry, SnippetGroup } from '../types'
import { copyText, cx, pinnedFirst } from '../lib/util'
import { extractVars, resolveVars, sheetValues, varKey } from '../lib/variables'
import { ActionMenu, DocEmpty, DocPage, EmptyState, InlineEdit, PanelHeader } from './ui'
import { SortableList } from './SortableList'
import { PanelResizer } from './Resizer'

/** Copia o snippet já com as variáveis trocadas pelos valores da ficha do espaço escolhido. */
export function useSnippetCopy(): (text: string) => void {
  const showToast = useStore((s) => s.showToast)
  const context = useSnippetContext()
  return (text) => {
    const { text: resolved, missing } = resolveVars(text, sheetValues(context?.sheet))
    copyText(resolved).then(
      () =>
        showToast(
          missing.length
            ? `Copiado, mas sem valor para: ${missing.map((m) => `{{${m}}}`).join(', ')}`
            : 'Copiado para a área de transferência'
        ),
      () => showToast('Não foi possível copiar')
    )
  }
}

/** Todos os grupos de snippets em árvore + editor do snippet aberto. */
export function SnippetsView(): ReactNode {
  const groups = useStore((s) => s.data!.snippetGroups)
  const entryId = useStore((s) => s.entryId)
  const addSnippetGroup = useStore((s) => s.addSnippetGroup)

  const group = groups.find((g) => g.items.some((i) => i.id === entryId))
  const selected = group?.items.find((i) => i.id === entryId)

  return (
    <>
      <aside className="panel">
        <PanelHeader eyebrow="Biblioteca de comandos" title={<h1 className="panel-title static">Snippets</h1>}>
          <p className="panel-hint">
            Trechos para copiar com um clique. Use <code>{'{{variável}}'}</code> para preencher com a ficha do alvo.
          </p>
        </PanelHeader>
        <div className="panel-scroll">
          {groups.length === 0 && <EmptyState icon={<Terminal size={24} />} title="Nenhum grupo" />}
          {groups.map((g) => (
            <GroupNode key={g.id} group={g} entryId={entryId} />
          ))}
          <button type="button" className="btn small ghost tree-add-section" onClick={addSnippetGroup}>
            <Plus size={14} /> Novo grupo
          </button>
        </div>
        <PanelResizer />
      </aside>
      {group && selected ? (
        <SnippetDocument key={selected.id} group={group} item={selected} />
      ) : (
        <DocEmpty icon={<Terminal size={28} />} title="Selecione um snippet" />
      )}
    </>
  )
}

function SnippetDocument({ group, item }: { group: SnippetGroup; item: Entry }): ReactNode {
  const updateSnippet = useStore((s) => s.updateSnippet)
  const copy = useSnippetCopy()
  const actions = useSnippetActions(group, item)
  const copyKeys = useBinding('copySnippet')
  return (
    <DocPage
      crumbs={['Snippets', group.title]}
      actions={
        <>
          <button
            type="button"
            className="btn small primary"
            title={withHint('Copiar com as variáveis preenchidas', copyKeys)}
            onClick={() => copy(item.content)}
          >
            <Copy size={14} /> Copiar
          </button>
          <ActionMenu label="Mais ações" items={actions} />
        </>
      }
    >
      <InlineEdit className="doc-title" value={item.title} onChange={(title) => updateSnippet(group.id, item.id, { title })} />
      <textarea
        className="snippet-editor"
        value={item.content}
        spellCheck={false}
        placeholder="Cole ou escreva o conteúdo do snippet. Ex.: nmap -sV {{ip}}"
        onChange={(e) => updateSnippet(group.id, item.id, { content: e.target.value })}
      />
      <VariablesPanel content={item.content} />
    </DocPage>
  )
}

function useSnippetActions(group: SnippetGroup, item: Entry): { label: string; icon: ReactNode; danger?: boolean; hint?: string; onSelect: () => void }[] {
  const duplicateSnippet = useStore((s) => s.duplicateSnippet)
  const removeSnippet = useStore((s) => s.removeSnippet)
  const setModal = useStore((s) => s.setModal)
  const groupCount = useStore((s) => s.data?.snippetGroups.length ?? 0)
  const duplicateKeys = useBinding('duplicate')
  const togglePin = useStore((s) => s.togglePin)
  const pin = (): void => togglePin({ kind: 'snippet', groupId: group.id, id: item.id })
  return [
    item.pinned
      ? { label: 'Desafixar', icon: <PinOff size={14} />, onSelect: pin }
      : { label: 'Fixar no topo', icon: <Pin size={14} />, onSelect: pin },
    { label: 'Duplicar', icon: <Copy size={14} />, hint: comboHint(duplicateKeys), onSelect: () => duplicateSnippet(group.id, item.id) },
    ...(groupCount > 1
      ? [
          {
            label: 'Mover para outro grupo…',
            icon: <FolderInput size={14} />,
            onSelect: () => setModal({ type: 'move', target: { kind: 'snippet', groupId: group.id, id: item.id } })
          }
        ]
      : []),
    { label: 'Excluir', icon: <Trash size={14} />, danger: true, onSelect: () => removeSnippet(group.id, item.id) }
  ]
}

/** Lista as variáveis do snippet, de onde vêm os valores e como o texto fica ao copiar. */
function VariablesPanel({ content }: { content: string }): ReactNode {
  const workspaces = useStore((s) => s.data!.workspaces)
  const setContext = useStore((s) => s.setSnippetContext)
  const navigate = useStore((s) => s.navigate)
  const context = useSnippetContext()
  const names = extractVars(content)
  if (names.length === 0) return null

  const values = sheetValues(context?.sheet)
  const { text } = resolveVars(content, values)
  const missing = names.filter((n) => !values[varKey(n)])

  return (
    <section className="vars-panel" aria-label="Variáveis do snippet">
      <div className="vars-panel-head">
        <h2>Variáveis</h2>
        {workspaces.length > 0 ? (
          <label className="vars-context">
            <span>Valores de</span>
            <select id="snippet-context" value={context?.id ?? ''} onChange={(e) => setContext(e.target.value || null)}>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="muted small">Crie um espaço para preencher variáveis.</span>
        )}
      </div>
      <ul className="vars-list">
        {names.map((n) => {
          const value = values[varKey(n)]
          return (
            <li key={n} className={cx(!value && 'missing')}>
              <code>{`{{${n}}}`}</code>
              <span className="vars-value">{value ?? 'sem valor'}</span>
            </li>
          )
        })}
      </ul>
      {context && missing.length > 0 && (
        <button
          type="button"
          className="btn small"
          onClick={() => navigate({ view: { type: 'workspace', id: context.id }, sheet: true })}
        >
          <ClipboardList size={14} /> Preencher na ficha de “{context.title}”
        </button>
      )}
      <div className="vars-preview">
        <span className="vars-preview-label">
          {missing.length ? <TriangleAlert size={13} /> : null} Ao copiar
        </span>
        <pre className="mono">{text}</pre>
      </div>
    </section>
  )
}

function GroupNode({ group, entryId }: { group: SnippetGroup; entryId: string | null }): ReactNode {
  const selectEntry = useStore((s) => s.selectEntry)
  const renameGroup = useStore((s) => s.renameSnippetGroup)
  const removeGroup = useStore((s) => s.removeSnippetGroup)
  const duplicateGroup = useStore((s) => s.duplicateSnippetGroup)
  const setCollapsed = useStore((s) => s.setGroupCollapsed)
  const addSnippet = useStore((s) => s.addSnippet)
  const moveSnippet = useStore((s) => s.moveSnippet)
  const collapsed = !!group.collapsed
  // Fixados primeiro na tela; arrastar continua mexendo na ordem guardada.
  const shown = pinnedFirst(group.items)

  return (
    <section className={cx('tree-node', collapsed && 'collapsed')}>
      <div className="tree-head">
        <button
          type="button"
          className="tree-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandir grupo' : 'Recolher grupo'}
          onClick={() => setCollapsed(group.id, !collapsed)}
        >
          <ChevronRight size={14} />
        </button>
        <InlineEdit className="tree-title" value={group.title} onChange={(title) => renameGroup(group.id, title)} />
        <span className="tree-count">{group.items.length}</span>
        <ActionMenu
          className="row-action"
          label="Ações do grupo"
          items={[
            { label: 'Novo snippet', icon: <Plus size={14} />, onSelect: () => addSnippet(group.id) },
            { label: 'Duplicar grupo', icon: <Copy size={14} />, onSelect: () => duplicateGroup(group.id) },
            { label: 'Excluir grupo', icon: <Trash size={14} />, danger: true, onSelect: () => removeGroup(group.id) }
          ]}
        />
      </div>
      {!collapsed && (
        <div className="tree-body">
          {group.items.length > 0 && (
            <SortableList
              items={shown}
              onMove={(from, to) => moveSnippet(group.id, group.items.indexOf(shown[from]), group.items.indexOf(shown[to]))}
              renderItem={(item, handle) => (
                <SnippetRow group={group} item={item} selected={item.id === entryId} handle={handle} onOpen={() => selectEntry(item.id)} />
              )}
            />
          )}
          <button type="button" className="tree-add" onClick={() => addSnippet(group.id)}>
            + Novo snippet
          </button>
        </div>
      )}
    </section>
  )
}

function SnippetRow({
  group,
  item,
  selected,
  handle,
  onOpen
}: {
  group: SnippetGroup
  item: Entry
  selected: boolean
  handle: ReactNode
  onOpen: () => void
}): ReactNode {
  const copy = useSnippetCopy()
  const actions = useSnippetActions(group, item)
  return (
    <div className={cx('entry-row', selected && 'selected')} data-entry-id={item.id} onClick={onOpen}>
      {handle}
      <span className="entry-icon">
        <Terminal size={14} />
      </span>
      <span className="entry-title">{item.title}</span>
      {item.pinned && <Pin size={12} className="entry-pin" aria-label="Fixado" />}
      <button
        type="button"
        className="icon-btn row-action"
        title="Copiar"
        aria-label={`Copiar ${item.title}`}
        onClick={(e) => {
          e.stopPropagation()
          copy(item.content)
        }}
      >
        <Copy size={13} />
      </button>
      <ActionMenu className="row-action" label={`Ações de “${item.title}”`} items={actions} />
    </div>
  )
}
