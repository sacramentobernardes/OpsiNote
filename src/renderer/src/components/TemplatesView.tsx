import { useMemo, type ReactNode } from 'react'
import { Copy, FileText, Plus, Trash } from 'lucide-react'
import { useBinding, useStore } from '../store'
import { cx } from '../lib/util'
import { comboHint } from '../lib/shortcuts'
import { SHEET_SPECS } from '../lib/sheets'
import { sheetVariables, varKey, type SheetVariable } from '../lib/variables'
import { ActionMenu, DocEmpty, DocPage, InlineEdit, PanelHeader, type MenuItem } from './ui'
import { RichEditor } from './RichEditor'
import { PanelResizer } from './Resizer'

/**
 * Um modelo não pertence a um espaço: o "/" oferece todas as chaves conhecidas (as das fichas
 * e as padrão de cada categoria). A nota criada do modelo mostra os valores da ficha do espaço.
 */
function useKnownVariables(): SheetVariable[] {
  const workspaces = useStore((s) => s.data!.workspaces)
  const libraries = useStore((s) => s.data!.libraries)
  return useMemo(() => {
    const seen = new Set<string>()
    const out: SheetVariable[] = []
    const add = (key: string): void => {
      const k = varKey(key)
      if (!k || seen.has(k)) return
      seen.add(k)
      out.push({ key: key.trim(), value: '' })
    }
    for (const b of [...workspaces, ...libraries]) for (const v of sheetVariables(b.sheet)) add(v.key)
    for (const spec of Object.values(SHEET_SPECS)) for (const key of spec.defaultKeys) add(key)
    return out
  }, [workspaces, libraries])
}

export function TemplatesView(): ReactNode {
  const knownVariables = useKnownVariables()
  const templates = useStore((s) => s.data!.templates)
  const entryId = useStore((s) => s.entryId)
  const selectEntry = useStore((s) => s.selectEntry)
  const addTemplate = useStore((s) => s.addTemplate)
  const updateTemplate = useStore((s) => s.updateTemplate)
  const removeTemplate = useStore((s) => s.removeTemplate)
  const duplicateTemplate = useStore((s) => s.duplicateTemplate)
  const selected = templates.find((t) => t.id === entryId)
  const duplicateKeys = useBinding('duplicate')
  const actions = (id: string): MenuItem[] => [
    { label: 'Duplicar', icon: <Copy size={14} />, hint: comboHint(duplicateKeys), onSelect: () => duplicateTemplate(id) },
    { label: 'Excluir modelo', icon: <Trash size={14} />, danger: true, onSelect: () => removeTemplate(id) }
  ]

  return (
    <>
      <aside className="panel">
        <PanelHeader eyebrow="Estruturas prontas" title={<h1 className="panel-title static">Modelos de nota</h1>}>
          <p className="panel-hint">Use-os ao criar notas em qualquer espaço.</p>
        </PanelHeader>
        <div className="panel-scroll">
          <ul className="entry-list">
            {templates.map((t) => (
              <li key={t.id}>
                <div className={cx('entry-row', t.id === entryId && 'selected')} data-entry-id={t.id} onClick={() => selectEntry(t.id)}>
                  <span className="entry-icon">
                    <FileText size={14} />
                  </span>
                  <span className="entry-title">{t.title}</span>
                  <ActionMenu className="row-action" label={`Ações de “${t.title}”`} items={actions(t.id)} />
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn small ghost tree-add-section" onClick={addTemplate}>
            <Plus size={14} /> Novo modelo
          </button>
        </div>
        <PanelResizer />
      </aside>
      {selected ? (
        <DocPage
          key={selected.id}
          crumbs={['Modelos de nota']}
          actions={<ActionMenu label="Mais ações" items={actions(selected.id)} />}
        >
          <InlineEdit className="doc-title" value={selected.title} onChange={(title) => updateTemplate(selected.id, { title })} />
          <RichEditor
            content={selected.content}
            onChange={(content) => updateTemplate(selected.id, { content })}
            placeholder="Monte a estrutura do modelo… Digite / para uma variável ou s/ para um snippet."
            variables={knownVariables}
          />
        </DocPage>
      ) : (
        <DocEmpty icon={<FileText size={28} />} title="Selecione um modelo" />
      )}
    </>
  )
}
