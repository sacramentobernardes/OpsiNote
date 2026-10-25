import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { useBinding, useBindings, useStore } from '../store'
import type { ListType, ShortcutId } from '../types'
import {
  FIXED_SHORTCUTS,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  comboFromEvent,
  comboHint,
  comboKeys,
  heldModifiers,
  resolveBindings,
  validateCombo,
  type Bindings,
  type ShortcutDef
} from '../lib/shortcuts'
import { resolveVars, sheetValues } from '../lib/variables'
import { copyText, cx } from '../lib/util'
import { Modal } from './ui'

export function ShortcutsDialog(): ReactNode {
  const setModal = useStore((s) => s.setModal)
  const open = useStore((s) => s.open)
  return (
    <Modal labelledBy="shortcuts-title" className="small-modal" onClose={() => setModal(null)}>
      <div className="modal-box">
        <header className="modal-header">
          <h2 id="shortcuts-title">Atalhos de teclado</h2>
          <p>No Mac, use Cmd no lugar de Ctrl.</p>
        </header>
        <div className="modal-body shortcuts-body">
          <ShortcutList />
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setModal(null)
              open({ type: 'settings', tab: 'shortcuts' })
            }}
          >
            Personalizar…
          </button>
          <button type="button" className="btn primary" onClick={() => setModal(null)}>
            Fechar
          </button>
        </footer>
      </div>
    </Modal>
  )
}

/** Teclas de um atalho, como Ctrl + Shift + C. */
export function Keys({ keys }: { keys: string[] }): ReactNode {
  return keys.map((k, i) => (
    <span key={`${i}-${k}`}>
      {i > 0 && <span className="plus">+</span>}
      <kbd>{k}</kbd>
    </span>
  ))
}

/** Teclas do atalho atual de uma ação, já com as personalizações. */
export function ShortcutKeys({ id }: { id: ShortcutId }): ReactNode {
  const combo = useBinding(id)
  return combo ? <Keys keys={comboKeys(combo)} /> : <span className="shortcut-none">sem atalho</span>
}

/**
 * Todos os atalhos por grupo. Na janela de atalhos só mostra; nas configurações
 * (`editable`) cada atalho pode ser trocado, removido ou voltar ao padrão.
 */
export function ShortcutList({ editable = false }: { editable?: boolean }): ReactNode {
  const bindings = useBindings()
  return SHORTCUT_GROUPS.map((group) => (
    <section key={group} className="shortcut-group">
      <h3>{group}</h3>
      <dl>
        {SHORTCUTS.filter((s) => s.group === group).map((s) =>
          editable ? (
            <ShortcutEditor key={s.id} def={s} bindings={bindings} />
          ) : (
            <div key={s.id} className="shortcut-row">
              <dt>{s.label}</dt>
              <dd>
                <ShortcutKeys id={s.id} />
              </dd>
            </div>
          )
        )}
        {FIXED_SHORTCUTS.filter((s) => s.group === group).map((s) => (
          <div key={s.label} className={cx('shortcut-row', editable && 'fixed')}>
            <dt>{s.label}</dt>
            <dd>
              <Keys keys={s.keys} />
              {editable && <span className="shortcut-fixed-note">fixo</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  ))
}

/** Linha editável: clique, pressione a nova combinação e pronto. Esc cancela. */
function ShortcutEditor({ def, bindings }: { def: ShortcutDef; bindings: Bindings }): ReactNode {
  const setShortcut = useStore((s) => s.setShortcut)
  const showToast = useStore((s) => s.showToast)
  const combo = bindings[def.id]
  const [recording, setRecording] = useState(false)
  const [held, setHeld] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // Quando a combinação termina com Espaço, a tecla ainda solta depois e "clicaria" o botão de novo.
  const endedAt = useRef(0)
  const errorId = `shortcut-error-${def.id}`

  const stop = (code?: string): void => {
    setRecording(false)
    setHeld([])
    if (code === 'Space') endedAt.current = Date.now()
  }

  const apply = (next: string | null): void => {
    setShortcut(def.id, next)
    setError(null)
    showToast(next ? `Atalho de “${def.label}”: ${comboHint(next)}` : `Atalho de “${def.label}” removido`)
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) return
    // Tab segue para o próximo campo: a gravação é cancelada.
    if (e.key === 'Tab') return stop()
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      setError(null)
      return stop()
    }
    // AltGr chega como Ctrl+Alt no Windows; é para digitar símbolos, não para atalhos.
    if (e.nativeEvent.getModifierState?.('AltGraph')) return
    const next = comboFromEvent(e)
    if (!next) {
      setHeld(heldModifiers(e))
      return
    }
    if (next === combo) {
      setError(null)
      return stop(e.code)
    }
    const why = validateCombo(def.id, next, bindings)
    if (why) {
      // Continua gravando, para tentar outra combinação na hora.
      setError(why)
      setHeld([])
      return
    }
    stop(e.code)
    apply(next)
  }

  const resetToDefault = (): void => {
    const why = validateCombo(def.id, def.default, bindings)
    if (why) setError(why)
    else apply(def.default)
  }

  return (
    <div className={cx('shortcut-row', 'editable', recording && 'recording', error && 'invalid')}>
      <dt>{def.label}</dt>
      <dd>
        <button
          type="button"
          className="shortcut-key"
          data-recording={recording ? '' : undefined}
          aria-label={recording ? 'Pressione a nova combinação. Esc cancela.' : `Alterar o atalho de ${def.label}`}
          aria-describedby={error ? errorId : undefined}
          title={recording ? 'Esc cancela' : 'Clique para alterar'}
          onClick={(e) => {
            // Só cliques do teclado (detail 0) vêm dessa tecla; um clique do mouse logo depois vale.
            if (e.detail === 0 && Date.now() - endedAt.current < 400) return
            setError(null)
            if (recording) stop()
            else setRecording(true)
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (!recording) return
            e.preventDefault()
            setHeld(heldModifiers(e))
          }}
          onBlur={() => stop()}
        >
          {recording ? (
            held.length > 0 ? (
              <Keys keys={[...held, '…']} />
            ) : (
              <span className="shortcut-wait">Pressione as teclas…</span>
            )
          ) : combo ? (
            <Keys keys={comboKeys(combo)} />
          ) : (
            <span className="shortcut-none">sem atalho</span>
          )}
        </button>
        <span className="shortcut-actions">
          {combo !== def.default && (
            <button type="button" className="icon-btn" title={`Voltar ao padrão (${comboHint(def.default)})`} onClick={resetToDefault}>
              <RotateCcw size={14} />
            </button>
          )}
          {combo !== null && (
            <button type="button" className="icon-btn" title="Remover atalho" onClick={() => apply(null)}>
              <X size={14} />
            </button>
          )}
        </span>
      </dd>
      {error && (
        <p id={errorId} className="shortcut-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Menus flutuantes que tratam o próprio Esc. */
const POPOVERS = '.menu-popover, .color-popover, .snippet-picker'

const isEditable = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

interface TreeItem {
  sectionId?: string
  list?: ListType
  id: string
}

/** Itens visíveis da árvore atual, na ordem da tela (seções recolhidas ficam de fora). */
function visibleItems(): TreeItem[] {
  const s = useStore.getState()
  const v = s.view
  if (!s.data) return []
  if (v.type === 'workspace' || v.type === 'library') {
    const board = (v.type === 'workspace' ? s.data.workspaces : s.data.libraries).find((b) => b.id === v.id)
    return (board?.sections ?? [])
      .filter((sec) => !sec.collapsed)
      .flatMap((sec) =>
        (['checklist', 'notes'] as const).flatMap((list) => sec[list].map((e) => ({ sectionId: sec.id, list, id: e.id })))
      )
  }
  if (v.type === 'snippets') return s.data.snippetGroups.filter((g) => !g.collapsed).flatMap((g) => g.items.map((i) => ({ id: i.id })))
  if (v.type === 'templates') return s.data.templates.map((t) => ({ id: t.id }))
  return []
}

function step(delta: number): void {
  const s = useStore.getState()
  const items = visibleItems()
  if (items.length === 0) return
  const at = items.findIndex((i) => i.id === s.entryId)
  const next = items[at < 0 ? (delta > 0 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, at + delta))]
  if (next.sectionId && next.list) s.selectItem(next.sectionId, next.list, next.id)
  else s.selectEntry(next.id)
  requestAnimationFrame(() => document.querySelector(`[data-entry-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }))
}

/** Ações sobre o que está aberto no documento. */
function current(): {
  entry?: { type: 'workspace' | 'library'; boardId: string; sectionId: string; list: ListType; done?: boolean }
  snippet?: { groupId: string; content: string }
  templateId?: string
} {
  const s = useStore.getState()
  const v = s.view
  if (!s.data || !s.entryId) return {}
  if (v.type === 'workspace' || v.type === 'library') {
    const board = (v.type === 'workspace' ? s.data.workspaces : s.data.libraries).find((b) => b.id === v.id)
    const section = board?.sections.find((x) => x.id === s.sectionId)
    const entry = section?.[s.list].find((e) => e.id === s.entryId)
    return entry && section ? { entry: { type: v.type, boardId: v.id, sectionId: section.id, list: s.list, done: entry.done } } : {}
  }
  if (v.type === 'snippets') {
    const group = s.data.snippetGroups.find((g) => g.items.some((i) => i.id === s.entryId))
    const item = group?.items.find((i) => i.id === s.entryId)
    return group && item ? { snippet: { groupId: group.id, content: item.content } } : {}
  }
  if (v.type === 'templates') return { templateId: s.entryId }
  return {}
}

/** Atalhos globais. Escuta na fase de captura para valer também dentro do editor. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Gravando um atalho novo nas configurações: as teclas são do gravador.
      if (e.target instanceof HTMLElement && e.target.dataset.recording !== undefined) return
      const s = useStore.getState()
      const handled = (): void => {
        e.preventDefault()
        e.stopPropagation()
      }

      if (e.key === 'Escape') {
        // Com um menu ou o seletor de cor aberto, o Esc fecha só ele (tratado no próprio componente).
        if (!s.modal && s.focusMode && !isEditable(e.target) && !document.querySelector(POPOVERS)) {
          handled()
          s.toggleFocus(false)
        }
        return
      }

      const combo = comboFromEvent(e)
      if (!combo) return
      const bindings = resolveBindings(s.data?.settings.shortcuts)
      const action = SHORTCUTS.find((x) => bindings[x.id] === combo)?.id
      if (!action) return

      // A busca abre e fecha de qualquer lugar.
      if (action === 'palette') {
        handled()
        s.setModal(s.modal?.type === 'palette' ? null : { type: 'palette' })
        return
      }
      // Com uma janela aberta, o resto do teclado é dela.
      if (s.modal) return

      switch (action) {
        case 'shortcuts':
          handled()
          s.setModal({ type: 'shortcuts' })
          break
        case 'settings':
          handled()
          s.open({ type: 'settings' })
          break
        case 'help':
          handled()
          s.open({ type: 'settings', tab: 'help' })
          break
        case 'focus':
          handled()
          s.toggleFocus()
          break
        case 'toggleRail':
          handled()
          s.toggleRail()
          break
        case 'newWorkspace':
          handled()
          s.addBoard('workspace', 'other')
          break
        case 'prevItem':
        case 'nextItem':
          handled()
          step(action === 'nextItem' ? 1 : -1)
          break
        case 'toggleDone': {
          // Fora de um item de checklist, a tecla segue para o editor.
          const c = current()
          if (c.entry && c.entry.type === 'workspace' && c.entry.list === 'checklist') {
            handled()
            s.updateEntry('workspace', c.entry.boardId, c.entry.sectionId, 'checklist', s.entryId!, { done: !c.entry.done })
          }
          break
        }
        case 'duplicate': {
          const c = current()
          if (c.entry) {
            handled()
            s.duplicateEntry({ boardType: c.entry.type, boardId: c.entry.boardId, sectionId: c.entry.sectionId, list: c.entry.list, entryId: s.entryId! })
          } else if (c.snippet) {
            handled()
            s.duplicateSnippet(c.snippet.groupId, s.entryId!)
          } else if (c.templateId) {
            handled()
            s.duplicateTemplate(c.templateId)
          }
          break
        }
        case 'copySnippet': {
          const c = current()
          if (c.snippet) {
            handled()
            const ctxId = s.snippetContextId ?? s.lastWorkspaceId
            const ctx = s.data?.workspaces.find((w) => w.id === ctxId) ?? s.data?.workspaces[0]
            const { text, missing } = resolveVars(c.snippet.content, sheetValues(ctx?.sheet))
            copyText(text).then(
              () => s.showToast(missing.length ? `Copiado, mas sem valor para: ${missing.map((m) => `{{${m}}}`).join(', ')}` : 'Copiado para a área de transferência'),
              () => s.showToast('Não foi possível copiar')
            )
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
