import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ChevronRight, Ellipsis, Maximize2, Minimize2, X } from 'lucide-react'
import { useBinding, useStore } from '../store'
import { COLORS, cx } from '../lib/util'
import { withHint } from '../lib/shortcuts'
import { FocusTimerButton } from './FocusTimer'

/** Campos com texto digitado e ainda não confirmado (sem Enter nem saída do campo). */
const pendingEdits = new Set<() => void>()

/** Confirma o que estiver em edição. Chamado antes do salvamento final, ao fechar a janela. */
export function commitPendingEdits(): void {
  for (const commit of pendingEdits) commit()
}

export function InlineEdit({
  value,
  onChange,
  className,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}): ReactNode {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  // Refs com o estado mais recente, para salvar também ao fechar a janela ou
  // quando o campo some da tela sem perder o foco (ex.: Alt+↓ com o título em edição).
  const latest = useRef({ draft, value, onChange })
  latest.current = { draft, value, onChange }
  const saved = useRef(value)
  saved.current = value

  const commitLatest = (): void => {
    const { draft: d, onChange: change } = latest.current
    const next = d.trim()
    if (!next || next === saved.current) return
    saved.current = next
    change(next)
  }

  useEffect(() => {
    pendingEdits.add(commitLatest)
    return () => {
      pendingEdits.delete(commitLatest)
      commitLatest()
    }
  }, [])

  const commit = (): void => {
    if (!draft.trim()) return setDraft(value)
    commitLatest()
  }

  return (
    <input
      className={cx('inline-edit', className)}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          const input = e.currentTarget
          requestAnimationFrame(() => input.blur())
        }
      }}
    />
  )
}

/** Botão de exclusão em dois cliques, para evitar acidentes sem diálogos. */
export function ConfirmButton({
  onConfirm,
  title,
  children,
  className
}: {
  onConfirm: () => void
  title: string
  children: ReactNode
  className?: string
}): ReactNode {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <button
      type="button"
      className={cx('icon-btn danger', armed && 'armed', className)}
      title={armed ? 'Clique de novo para confirmar' : title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        if (armed) {
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
    >
      {armed ? <span className="confirm-label">Excluir?</span> : children}
    </button>
  )
}

export function ColorPicker({ value, onChange }: { value?: string; onChange: (color?: string) => void }): ReactNode {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="color-picker" ref={ref}>
      <button
        type="button"
        className={cx('color-swatch trigger', !value && 'empty')}
        style={{ background: value ?? 'transparent' }}
        title="Cor"
        aria-label="Escolher cor"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      />
      {open && (
        <div className="color-popover" onClick={(e) => e.stopPropagation()}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cx('color-swatch', c === value && 'selected')}
              style={{ background: c }}
              aria-label={c}
              onClick={() => {
                onChange(c)
                setOpen(false)
              }}
            />
          ))}
          <button
            type="button"
            className={cx('color-swatch none', !value && 'selected')}
            title="Sem cor"
            aria-label="Sem cor"
            onClick={() => {
              onChange(undefined)
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

export function ProgressBar({ percent, color }: { percent: number; color?: string }): ReactNode {
  return (
    <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${percent}%`, background: color }} />
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }): ReactNode {
  return (
    <div className="empty-state">
      {icon}
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  )
}

export function Toast(): ReactNode {
  const toast = useStore((s) => s.toast)
  const dismiss = useStore((s) => s.dismissToast)
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action?.run()
            if (useStore.getState().toast === toast) dismiss()
          }}
        >
          {toast.action.label}
        </button>
      )}
      {toast.action && (
        <button type="button" className="toast-close" aria-label="Fechar aviso" onClick={dismiss}>
          <X size={13} />
        </button>
      )}
    </div>
  )
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  /** Atalho exibido à direita, só informativo. */
  hint?: string
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

/** Linha de opções lado a lado (cores, categorias): escolher fecha o menu. */
export interface MenuChoices {
  type: 'choices'
  label: string
  options: { id: string; title: string; node: ReactNode; active: boolean }[]
  onPick: (id: string) => void
}

export type MenuEntry = MenuItem | MenuChoices | { type: 'separator' }

const isItem = (e: MenuEntry): e is MenuItem => !('type' in e)

/** Retângulo onde o menu se apoia (um botão, ou o ponto do clique). */
interface MenuAnchor {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Menu flutuante num portal com posição fixa, para não ser cortado pela rolagem.
 * `align: 'end'` alinha pela direita da âncora (botão "⋯"); `'start'`, pela esquerda (botão direito).
 * Setas navegam, Esc fecha e devolve o foco a `returnFocus`.
 */
function MenuPopover({
  anchor,
  align,
  entries,
  label,
  ignore,
  onClose,
  returnFocus
}: {
  anchor: MenuAnchor
  align: 'start' | 'end'
  entries: (MenuEntry | null)[]
  label?: string
  /** Elemento que abriu o menu: clicar nele não conta como clique fora. */
  ignore?: HTMLElement | null
  onClose: () => void
  returnFocus?: HTMLElement | null
}): ReactNode {
  const menu = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Sem separadores sobrando no começo, no fim ou repetidos (quando um item some por condição).
  const visible = entries
    .filter((e): e is MenuEntry => e !== null)
    .filter((e, i, all) => !('type' in e && e.type === 'separator') || (i > 0 && i < all.length - 1 && !('type' in all[i - 1] && (all[i - 1] as { type: string }).type === 'separator')))

  useEffect(() => {
    const close = (): void => onCloseRef.current()
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !ignore?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
        returnFocus?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [ignore, returnFocus])

  // Vira para cima/para o outro lado se não couber na janela.
  useLayoutEffect(() => {
    if (!menu.current) return
    const m = menu.current.getBoundingClientRect()
    let top = anchor.bottom + 4
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, anchor.top - m.height - 4)
    let left = align === 'end' ? anchor.right - m.width : anchor.left
    if (left + m.width > window.innerWidth - 8) left = window.innerWidth - m.width - 8
    if (left < 8) left = Math.min(anchor.left, window.innerWidth - m.width - 8)
    setPos({ top, left: Math.max(8, left) })
  }, [anchor, align])

  // Foco no primeiro item só depois de posicionar: enquanto o menu está com
  // visibility: hidden (antes de medir), o navegador ignora o focus().
  const placed = pos !== null
  useLayoutEffect(() => {
    if (!placed) return
    const first = menu.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? stops()[0]
    first?.focus()
  }, [placed])

  /**
   * Paradas das setas ↑/↓: cada item, e cada linha de opções uma vez só (na opção marcada).
   * Dentro da linha, ←/→ passam de uma opção para outra.
   */
  const stops = (): HTMLButtonElement[] =>
    [...(menu.current?.children ?? [])].flatMap((child): HTMLButtonElement[] => {
      if (child instanceof HTMLButtonElement) return child.disabled ? [] : [child]
      if (!child.classList.contains('menu-choices')) return []
      const options = [...child.querySelectorAll<HTMLButtonElement>('button.menu-choice')]
      return options.length ? [options.find((o) => o.classList.contains('active')) ?? options[0]] : []
    })

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const active = document.activeElement as HTMLButtonElement | null
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && active?.classList.contains('menu-choice')) {
      e.preventDefault()
      const options = [...(active.parentElement?.querySelectorAll<HTMLButtonElement>('button.menu-choice') ?? [])]
      const i = options.indexOf(active)
      options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length]?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const list = stops()
    // Numa opção que não é a parada da linha, vale a posição da linha.
    const at = list.findIndex((b) => b === active || (active?.classList.contains('menu-choice') && b.parentElement === active.parentElement))
    list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
  }

  const pick = (run: () => void): void => {
    onClose()
    run()
  }

  return createPortal(
    <div
      ref={menu}
      className="menu-popover floating"
      role="menu"
      aria-label={label}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
    >
      {visible.map((entry, i) => {
        if (isItem(entry)) {
          return (
            <button
              key={entry.label}
              type="button"
              role="menuitem"
              className={cx(entry.danger && 'danger')}
              disabled={entry.disabled}
              onClick={() => pick(entry.onSelect)}
            >
              {entry.icon}
              <span className="menu-label">{entry.label}</span>
              {entry.hint && <kbd>{entry.hint}</kbd>}
            </button>
          )
        }
        if (entry.type === 'separator') return <div key={`sep-${i}`} className="menu-separator" role="separator" />
        return (
          <div key={entry.label} className="menu-choices" role="group" aria-label={entry.label}>
            <span className="menu-choices-label">{entry.label}</span>
            <span className="menu-choices-options">
              {entry.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={o.active}
                  title={o.title}
                  aria-label={o.title}
                  className={cx('menu-choice', o.active && 'active')}
                  onClick={() => pick(() => entry.onPick(o.id))}
                >
                  {o.node}
                </button>
              ))}
            </span>
          </div>
        )
      })}
    </div>,
    document.body
  )
}

/** Botão "⋯" com um menu de ações. */
export function ActionMenu({
  label,
  items,
  className,
  icon
}: {
  label: string
  items: (MenuEntry | null)[]
  className?: string
  /** Ícone do botão (padrão: ⋯). */
  icon?: ReactNode
}): ReactNode {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const button = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={button}
        type="button"
        className={cx('icon-btn', rect && 'open', className)}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!rect}
        onClick={(e) => {
          e.stopPropagation()
          setRect(rect ? null : e.currentTarget.getBoundingClientRect())
        }}
      >
        {icon ?? <Ellipsis size={15} />}
      </button>
      {rect && (
        <MenuPopover
          anchor={rect}
          align="end"
          entries={items}
          label={label}
          ignore={button.current}
          returnFocus={button.current}
          onClose={() => setRect(null)}
        />
      )}
    </>
  )
}

/**
 * Menu do botão direito. `open(e, entries)` no onContextMenu de qualquer elemento; o menu
 * abre no ponto do clique (ou embaixo do elemento, pela tecla de menu / Shift+F10).
 * Renderize `menu` uma vez no componente.
 */
export function useContextMenu(): {
  open: (e: ReactMouseEvent<HTMLElement>, entries: (MenuEntry | null)[], label?: string) => void
  menu: ReactNode
} {
  const [state, setState] = useState<{ anchor: MenuAnchor; entries: (MenuEntry | null)[]; label?: string; target: HTMLElement } | null>(null)
  const open = (e: ReactMouseEvent<HTMLElement>, entries: (MenuEntry | null)[], label?: string): void => {
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget
    // Pelo teclado o evento vem sem coordenadas úteis: o menu abre embaixo do elemento.
    const fromKeyboard = e.clientX === 0 && e.clientY === 0
    const r = target.getBoundingClientRect()
    const anchor = fromKeyboard
      ? { top: r.top, bottom: r.bottom, left: r.left, right: r.left }
      : { top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX }
    setState({ anchor, entries, label, target })
  }
  const menu = state && (
    <MenuPopover
      anchor={state.anchor}
      align="start"
      entries={state.entries}
      label={state.label}
      returnFocus={state.target}
      onClose={() => setState(null)}
    />
  )
  return { open, menu }
}

/** Botão de entrar/sair do modo foco, na barra do documento. */
export function FocusButton(): ReactNode {
  const focusMode = useStore((s) => s.focusMode)
  const toggleFocus = useStore((s) => s.toggleFocus)
  const label = withHint(focusMode ? 'Sair do modo foco' : 'Modo foco', useBinding('focus'))
  return (
    <button type="button" className="icon-btn" title={label} aria-label={label} aria-pressed={focusMode} onClick={() => toggleFocus()}>
      {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
    </button>
  )
}

/** Campo "digite e Enter" para adicionar itens em sequência. */
export function QuickAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }): ReactNode {
  const [value, setValue] = useState('')
  return (
    <input
      className="quick-add"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) {
          onAdd(value.trim())
          setValue('')
        }
        if (e.key === 'Escape') setValue('')
      }}
    />
  )
}

/** Área principal com um documento: barra com trilha e ações, e a página centralizada. */
export function DocPage({
  crumbs,
  actions,
  children
}: {
  crumbs: string[]
  actions?: ReactNode
  children: ReactNode
}): ReactNode {
  const selectEntry = useStore((s) => s.selectEntry)
  return (
    <main className="doc">
      <div className="doc-bar">
        <button type="button" className="btn small ghost doc-back" onClick={() => selectEntry(null)}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="crumbs">
          {crumbs.map((c, i) => (
            <span key={i} className="crumb">
              {i > 0 && <ChevronRight size={12} aria-hidden />}
              <span className="crumb-label">{c}</span>
            </span>
          ))}
        </div>
        <div className="doc-actions">
          {actions}
          <FocusTimerButton />
          <FocusButton />
        </div>
      </div>
      <div className="doc-page">{children}</div>
    </main>
  )
}

/** Área principal sem documento aberto. */
export function DocEmpty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }): ReactNode {
  return (
    <main className="doc doc-empty">
      <EmptyState icon={icon} title={title}>
        {children}
      </EmptyState>
    </main>
  )
}

/** Cabeçalho do painel de contexto. */
export function PanelHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }): ReactNode {
  return (
    <header className="panel-header">
      <span className="eyebrow">{eyebrow}</span>
      <div className="panel-title-row">{title}</div>
      {children}
    </header>
  )
}

/**
 * Janela modal nativa (<dialog>): prende o foco, fecha com Esc e com clique no fundo.
 * Para fechar por código, basta deixar de renderizá-la.
 */
export function Modal({
  labelledBy,
  className,
  onClose,
  children
}: {
  labelledBy: string
  className?: string
  onClose: () => void
  children: ReactNode
}): ReactNode {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={cx('modal', className)}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      {children}
    </dialog>
  )
}
