import { useMemo, useState, type ReactNode } from 'react'
import { Check, Copy, Plus, Search, Terminal, X } from 'lucide-react'
import { useStore } from '../store'
import type { Board, BoardType, SheetVar, TargetSheet } from '../types'
import { createSheet, sheetValues, sheetVariables, varKey } from '../lib/variables'
import { copyText, cx, newId } from '../lib/util'
import { SHEET_SPECS } from '../lib/sheets'
import { sheetSnippets, type SheetSnippet } from '../lib/snippets'
import { DocPage } from './ui'
import { SnippetTextarea } from './SnippetPicker'

const VALID_KEY = /^[\p{L}\p{N}_.-]+$/u

/** Ficha do espaço: variáveis para os snippets e campos que dependem da categoria. */
export function SheetDocument({ type, board }: { type: BoardType; board: Board }): ReactNode {
  const updateSheet = useStore((s) => s.updateSheet)
  // Sem ficha salva, mostra os campos padrão; só grava quando algo for preenchido.
  const spec = SHEET_SPECS[board.kind]
  const fallback = useMemo(() => createSheet(spec.defaultKeys), [board.id, spec])
  const sheet: TargetSheet = board.sheet ?? fallback
  const update = (patch: Partial<TargetSheet>): void => updateSheet(type, board.id, { ...sheet, ...patch })

  const setVar = (id: string, patch: Partial<SheetVar>): void =>
    update({ vars: sheet.vars.map((v) => (v.id === id ? { ...v, ...patch } : v)) })

  /** Leva ao valor da variável `key`, criando-a se a ficha ainda não tiver. */
  const addVar = (key: string): void => {
    const existing = sheet.vars.find((v) => varKey(v.key) === varKey(key))
    const id = existing?.id ?? newId()
    if (!existing) update({ vars: [...sheet.vars, { id, key, value: '' }] })
    requestAnimationFrame(() => {
      const input = document.getElementById(`var-value-${id}`)
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      input?.focus()
    })
  }

  const counts = new Map<string, number>()
  for (const v of sheet.vars) {
    const k = varKey(v.key)
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  const isLibrary = type === 'library'
  const title = isLibrary ? `${spec.title} (modelo)` : spec.title
  // Datas no formato AAAA-MM-DD: a comparação de texto já segue a ordem do calendário.
  const datesInverted = !!sheet.start && !!sheet.end && sheet.end < sheet.start

  return (
    <DocPage crumbs={[board.title, title]}>
      <h1 className="doc-title static">{title}</h1>
      {isLibrary && (
        <p className="sheet-hint">
          As chaves desta ficha são copiadas para cada espaço criado a partir da biblioteca, com os valores em branco.
        </p>
      )}

      <section className="sheet-section">
        <header className="sheet-section-head">
          <h2>{spec.infoTitle}</h2>
        </header>
        <div className="sheet-dates">
          <label>
            <span>{spec.startLabel}</span>
            <input
              id="sheet-start"
              type="date"
              value={sheet.start ?? ''}
              max={sheet.end}
              aria-invalid={datesInverted}
              className={datesInverted ? 'invalid' : undefined}
              onChange={(e) => update({ start: e.target.value || undefined })}
            />
          </label>
          <label>
            <span>{spec.endLabel}</span>
            <input
              id="sheet-end"
              type="date"
              value={sheet.end ?? ''}
              min={sheet.start}
              aria-invalid={datesInverted}
              className={datesInverted ? 'invalid' : undefined}
              onChange={(e) => update({ end: e.target.value || undefined })}
            />
          </label>
        </div>
        {datesInverted && (
          <small className="var-problem sheet-date-problem" role="alert">
            A data final está antes da inicial.
          </small>
        )}
        {spec.fields.map((f) => (
          <label className="sheet-field" key={f.id}>
            <span>{f.label}</span>
            <SnippetTextarea
              id={`sheet-${f.id}`}
              rows={f.rows}
              value={sheet.fields[f.id] ?? ''}
              placeholder={f.placeholder}
              values={isLibrary ? undefined : sheetValues(sheet)}
              variables={sheetVariables(sheet)}
              onChange={(value) => update({ fields: { ...sheet.fields, [f.id]: value } })}
            />
          </label>
        ))}
      </section>

      <section className="sheet-section">
        <header className="sheet-section-head">
          <h2>Variáveis</h2>
          <p>
            Use nos snippets como <code>{'{{chave}}'}</code>. Exemplo: <code>{spec.varExample}</code> vira o texto com o valor
            preenchido ao copiar. Nas notas e itens deste espaço, digite <kbd>/</kbd> para mostrar o valor de uma variável: ele
            acompanha a ficha quando você muda o valor aqui.
          </p>
        </header>
        <div className="var-table" role="table" aria-label="Variáveis">
          <div className="var-row var-head" role="row">
            <span role="columnheader">Chave</span>
            <span role="columnheader">Valor</span>
            <span />
          </div>
          {sheet.vars.map((v) => {
            const k = varKey(v.key)
            const problem = !v.key.trim()
              ? null
              : !VALID_KEY.test(v.key.trim())
                ? 'Use só letras, números, ponto, hífen ou sublinhado'
                : (counts.get(k) ?? 0) > 1
                  ? 'Chave repetida; vale a primeira'
                  : null
            return (
              <div className="var-row" role="row" key={v.id}>
                <span role="cell" className="var-key-cell">
                  <input
                    id={`var-key-${v.id}`}
                    className={problem ? 'invalid' : undefined}
                    value={v.key}
                    placeholder="chave"
                    spellCheck={false}
                    aria-label="Chave"
                    aria-invalid={!!problem}
                    title={problem ?? undefined}
                    onChange={(e) => setVar(v.id, { key: e.target.value })}
                  />
                  {problem && <small className="var-problem">{problem}</small>}
                </span>
                <span role="cell">
                  <input
                    id={`var-value-${v.id}`}
                    className="mono"
                    value={v.value}
                    placeholder={isLibrary ? '(preenchido em cada espaço)' : 'valor'}
                    spellCheck={false}
                    aria-label={`Valor de ${v.key || 'variável'}`}
                    onChange={(e) => setVar(v.id, { value: e.target.value })}
                  />
                </span>
                <span role="cell">
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`Remover ${v.key || 'variável'}`}
                    title="Remover"
                    onClick={() => update({ vars: sheet.vars.filter((x) => x.id !== v.id) })}
                  >
                    <X size={14} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => update({ vars: [...sheet.vars, { id: newId(), key: '', value: '' }] })}
        >
          <Plus size={14} /> Adicionar variável
        </button>
      </section>

      {!isLibrary && <SheetSnippets board={board} sheet={sheet} onAddVar={(key) => addVar(key)} />}

    </DocPage>
  )
}

/**
 * Os snippets já preenchidos com as variáveis desta ficha, prontos para copiar.
 * Quando falta uma variável, um clique cria a chave na ficha e leva ao campo do valor.
 */
function SheetSnippets({ board, sheet, onAddVar }: { board: Board; sheet: TargetSheet; onAddVar: (key: string) => void }): ReactNode {
  const groups = useStore((s) => s.data!.snippetGroups)
  const snippetContextId = useStore((s) => s.snippetContextId)
  const setSnippetContext = useStore((s) => s.setSnippetContext)
  const open = useStore((s) => s.open)
  const showToast = useStore((s) => s.showToast)
  const [query, setQuery] = useState('')
  const [onlyWithVars, setOnlyWithVars] = useState(false)

  const values = useMemo(() => sheetValues(sheet), [sheet])
  const all = useMemo(() => sheetSnippets(groups, values, query), [groups, values, query])
  const list = onlyWithVars ? all.filter((s) => s.varCount > 0) : all
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  // Contados sem a busca, para o resumo não mudar enquanto se digita.
  const everything = useMemo(() => sheetSnippets(groups, values), [groups, values])
  const withVars = everything.filter((s) => s.varCount > 0).length
  const ready = everything.filter((s) => s.varCount > 0 && s.missing.length === 0).length
  const isContext = snippetContextId === board.id

  const copy = (s: SheetSnippet): void => {
    copyText(s.text).then(
      () =>
        showToast(
          s.missing.length
            ? `Copiado, mas sem valor para: ${s.missing.map((m) => `{{${m}}}`).join(', ')}`
            : `“${s.item.title}” copiado com os valores da ficha`
        ),
      () => showToast('Não foi possível copiar')
    )
  }

  // Agrupa de volta por grupo, mantendo a ordem da busca dentro de cada um.
  const byGroup = new Map<string, { title: string; items: SheetSnippet[] }>()
  for (const s of list) {
    const g = byGroup.get(s.group.id) ?? { title: s.group.title, items: [] }
    g.items.push(s)
    byGroup.set(s.group.id, g)
  }

  return (
    <section className="sheet-section sheet-snippets" aria-labelledby="sheet-snippets-title">
      <header className="sheet-section-head">
        <h2 id="sheet-snippets-title">Snippets</h2>
        <p>
          Seus snippets já preenchidos com as variáveis desta ficha. Clique para copiar.
          {withVars > 0 && ` ${ready} de ${withVars} que usam variáveis ${ready === 1 ? 'está pronto' : 'estão prontos'}.`}
        </p>
      </header>

      {total === 0 ? (
        <p className="sheet-snippets-empty">
          Nenhum snippet ainda.{' '}
          <button type="button" className="link-btn" onClick={() => open({ type: 'snippets' })}>
            Criar um snippet
          </button>
        </p>
      ) : (
        <>
          <div className="sheet-snippets-toolbar">
            <label className="search">
              <Search size={14} />
              <input
                id="sheet-snippets-search"
                placeholder="Buscar snippet (título, grupo ou comando)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="sheet-snippets-filter">
              <input type="checkbox" checked={onlyWithVars} onChange={(e) => setOnlyWithVars(e.target.checked)} />
              Só os que usam variáveis
            </label>
          </div>

          {list.length === 0 && <p className="sheet-snippets-empty">Nada encontrado{query ? ` para “${query}”` : ''}.</p>}

          {[...byGroup.entries()].map(([id, g]) => (
            <div key={id} className="sheet-snippet-group">
              <h3>
                <Terminal size={13} /> {g.title}
              </h3>
              <ul>
                {g.items.map((s) => (
                  <li key={s.item.id} className={cx('sheet-snippet', s.missing.length > 0 && 'incomplete')}>
                    <button
                      type="button"
                      className="sheet-snippet-main"
                      title="Copiar com os valores desta ficha"
                      onClick={() => copy(s)}
                    >
                      <span className="sheet-snippet-title">
                        {s.item.title}
                        {s.varCount > 0 && s.missing.length === 0 && (
                          <span className="sheet-snippet-ok" aria-label="Todas as variáveis preenchidas">
                            <Check size={12} />
                          </span>
                        )}
                      </span>
                      <code className="sheet-snippet-text">{s.text || '(vazio)'}</code>
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Copiar ${s.item.title}`} title="Copiar" onClick={() => copy(s)}>
                      <Copy size={14} />
                    </button>
                    {s.missing.length > 0 && (
                      <div className="sheet-snippet-missing">
                        Falta:{' '}
                        {s.missing.map((m) => (
                          <button
                            key={m}
                            type="button"
                            className="var-chip"
                            title={sheet.vars.some((v) => varKey(v.key) === varKey(m)) ? 'Preencher na ficha' : 'Adicionar esta variável à ficha'}
                            onClick={() => onAddVar(m)}
                          >
                            {`{{${m}}}`}
                            <Plus size={11} />
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="sheet-snippets-context">
            {isContext ? (
              <span className="muted small">
                <Check size={13} /> A tela de Snippets também copia com esta ficha.
              </span>
            ) : (
              <button type="button" className="btn small ghost" onClick={() => setSnippetContext(board.id)}>
                Usar esta ficha também na tela de Snippets
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
