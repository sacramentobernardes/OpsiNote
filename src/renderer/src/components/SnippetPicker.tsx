import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
  type TextareaHTMLAttributes
} from 'react'
import { createPortal } from 'react-dom'
import { Braces, Search, Terminal } from 'lucide-react'
import { useStore } from '../store'
import { matchSnippets, slashTrigger, snippetText, type SlashTrigger, type SnippetMatch } from '../lib/snippets'
import { matchVariables, type SheetVariable } from '../lib/variables'
import { cx } from '../lib/util'

/** Onde o menu se apoia, em coordenadas da janela. */
export interface PickerAnchor {
  left: number
  top: number
  bottom: number
}

export interface SnippetPickerHandle {
  /** Teclas vindas do texto enquanto o menu do "/" está aberto; `true` se o menu usou a tecla. */
  onKey: (e: { key: string }) => boolean
}

/** Avisa quando o snippet entrou com variáveis sem valor na ficha. */
export function useMissingToast(): (missing: string[]) => void {
  const showToast = useStore((s) => s.showToast)
  return (missing) => {
    if (missing.length) showToast(`Inserido, mas sem valor para: ${missing.map((m) => `{{${m}}}`).join(', ')}`)
  }
}

/** Linha do menu. */
interface PickerRow {
  id: string
  title: string
  /** Texto menor ao lado do título (grupo do snippet). */
  meta?: string
  /** Segunda linha, em fonte de código. */
  preview?: string
  /** Mostra a prévia apagada (variável sem valor). */
  faded?: boolean
}

interface PickerProps<T> {
  ref?: Ref<SnippetPickerHandle>
  anchor: () => PickerAnchor | null | undefined
  /** Com `query`, é o menu do "/": filtra pelo que se digita no texto e some quando nada bate. */
  query?: string
  /** Botão que abre o menu: clicar nele não conta como clique fora. */
  trigger?: RefObject<HTMLElement | null>
  onPick: (item: T) => void
  /** `key`: fechado com Esc (o texto pode receber o foco de volta); `click`: clique fora. */
  onClose: (via: 'key' | 'click') => void
}

/**
 * Menu flutuante para inserir no texto. Sem `query`, tem campo de busca próprio (aberto
 * pelo botão). O menu acompanha a âncora ao rolar.
 */
function Picker<T>({
  ref,
  anchor,
  query,
  trigger,
  onPick,
  onClose,
  find,
  row,
  icon,
  label,
  searchLabel,
  empty
}: PickerProps<T> & {
  find: (term: string) => T[]
  row: (item: T) => PickerRow
  icon: ReactNode
  label: string
  searchLabel: string
  empty: (term: string) => string
}): ReactNode {
  const searchMode = query === undefined
  const [search, setSearch] = useState('')
  const term = searchMode ? search : query
  const matches = find(term)
  const [active, setActive] = useState(0)
  const current = Math.min(active, matches.length - 1)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const anchorRef = useRef(anchor)
  anchorRef.current = anchor
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const hidden = !searchMode && matches.length === 0

  useEffect(() => setActive(0), [term])

  const onKey = (e: { key: string }): boolean => {
    if (hidden) return false
    if (e.key === 'Escape') {
      onClose('key')
      return true
    }
    if (matches.length === 0) return false
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + matches.length) % matches.length)
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      onPick(matches[current])
      return true
    }
    return false
  }
  useImperativeHandle(ref, () => ({ onKey }))

  // Abaixo da âncora; vira para cima se não couber. Mexe direto no estilo para não re-renderizar.
  const place = (): void => {
    const el = box.current
    const a = anchorRef.current()
    if (!el || !a) return
    let top = a.bottom + 4
    if (top + el.offsetHeight > window.innerHeight - 8) top = Math.max(8, a.top - el.offsetHeight - 4)
    const left = Math.max(8, Math.min(a.left, window.innerWidth - el.offsetWidth - 8))
    el.style.top = `${top}px`
    el.style.left = `${left}px`
    el.style.visibility = 'visible'
  }
  useLayoutEffect(place)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !trigger?.current?.contains(t)) onCloseRef.current('click')
    }
    const reposition = (): void => place()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [trigger])

  useEffect(() => {
    list.current?.children[current]?.scrollIntoView({ block: 'nearest' })
  }, [current])

  if (hidden) return null

  return createPortal(
    <div ref={box} className="snippet-picker" style={{ visibility: 'hidden', top: 0, left: 0 }}>
      {searchMode && (
        <div className="snippet-picker-search">
          <Search size={14} />
          <input
            autoFocus
            value={search}
            placeholder={searchLabel}
            aria-label={searchLabel}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (onKey(e)) {
                e.preventDefault()
                e.stopPropagation()
              }
            }}
          />
        </div>
      )}
      {matches.length > 0 ? (
        <ul ref={list} className="snippet-picker-list" role="listbox" aria-label={label}>
          {matches.map((m, i) => {
            const r = row(m)
            return (
              <li
                key={r.id}
                role="option"
                aria-selected={i === current}
                className={cx('snippet-picker-row', i === current && 'active')}
                // Não tira o foco do texto: o "/" e o cursor continuam onde estavam.
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => i !== current && setActive(i)}
                onClick={() => onPick(m)}
              >
                <span className="snippet-picker-icon">{icon}</span>
                <span className="snippet-picker-text">
                  <span className="snippet-picker-title">
                    {r.title}
                    {r.meta && <span className="snippet-picker-group">{r.meta}</span>}
                  </span>
                  {r.preview && <code className={cx('snippet-picker-preview', r.faded && 'faded')}>{r.preview}</code>}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="snippet-picker-empty">{empty(term)}</p>
      )}
      <div className="snippet-picker-foot">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> navega
        </span>
        <span>
          <kbd>Enter</kbd> insere
        </span>
        <span>
          <kbd>Esc</kbd> fecha
        </span>
      </div>
    </div>,
    document.body
  )
}

/** Menu de snippets ("s/" no texto ou o botão de terminal). */
export function SnippetPicker(props: PickerProps<SnippetMatch>): ReactNode {
  const groups = useStore((s) => s.data!.snippetGroups)
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  return (
    <Picker
      {...props}
      find={(term) => matchSnippets(groups, term)}
      row={(m) => ({ id: m.item.id, title: m.item.title, meta: m.group.title, preview: m.item.content.trim().split('\n')[0] || undefined })}
      icon={<Terminal size={13} />}
      label="Snippets"
      searchLabel="Buscar snippet"
      empty={() => (total ? 'Nenhum snippet encontrado' : 'Nenhum snippet ainda. Crie em Snippets.')}
    />
  )
}

/** Menu das variáveis da ficha ("/" no texto ou o botão de chaves). */
export function VariablePicker({ variables, ...props }: PickerProps<SheetVariable> & { variables: SheetVariable[] }): ReactNode {
  return (
    <Picker
      {...props}
      find={(term) => matchVariables(variables, term)}
      row={(v) => ({ id: v.key, title: `{{${v.key}}}`, preview: v.value || 'sem valor', faded: !v.value })}
      icon={<Braces size={13} />}
      label="Variáveis da ficha"
      searchLabel="Buscar variável"
      empty={(term) => (variables.length ? `Nenhuma variável com “${term}”` : 'A ficha deste espaço ainda não tem variáveis.')}
    />
  )
}

const MIRROR_PROPS = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'wordSpacing',
  'tabSize'
] as const

/** Posição do cursor num textarea, medida com uma cópia invisível do texto com o mesmo estilo. */
function caretCoords(el: HTMLTextAreaElement, pos: number): PickerAnchor {
  const style = getComputedStyle(el)
  const mirror = document.createElement('div')
  for (const p of MIRROR_PROPS) mirror.style[p] = style[p]
  Object.assign(mirror.style, { position: 'absolute', top: '0', left: '-9999px', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' })
  mirror.textContent = el.value.slice(0, pos)
  const marker = document.createElement('span')
  marker.textContent = el.value.slice(pos) || '.'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const rect = el.getBoundingClientRect()
  const top = rect.top + marker.offsetTop - el.scrollTop
  const left = rect.left + marker.offsetLeft - el.scrollLeft
  mirror.remove()
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4
  return { left, top, bottom: top + lineHeight }
}

type FieldTrigger = SlashTrigger & { from: number }

/** Gatilho ("s/" ou "/") antes do cursor de um textarea (só na linha atual). */
function textareaTrigger(el: HTMLTextAreaElement): FieldTrigger | null {
  const pos = el.selectionStart
  if (pos !== el.selectionEnd) return null
  const before = el.value.slice(0, pos)
  const t = slashTrigger(before.slice(before.lastIndexOf('\n') + 1))
  return t && { ...t, from: pos - t.length }
}

/**
 * Textarea onde "s/" insere um snippet e "/" uma variável da ficha, como texto (um campo
 * de texto não tem como acompanhar o valor). Com `values`, as variáveis dos snippets são
 * preenchidas; sem, ficam como {{variável}}.
 */
export function SnippetTextarea({
  value,
  onChange,
  values,
  variables = [],
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  values?: Record<string, string>
  /** Variáveis oferecidas pelo "/". */
  variables?: SheetVariable[]
}): ReactNode {
  const area = useRef<HTMLTextAreaElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const picker = useRef<SnippetPickerHandle>(null)
  const [slash, setSlash] = useState<FieldTrigger | null>(null)
  const [searching, setSearching] = useState(false)
  // Gatilho fechado com Esc: não reabre enquanto o cursor continuar nele.
  const dismissed = useRef<number | null>(null)
  const caret = useRef<number | null>(null)
  const warnMissing = useMissingToast()

  const detect = (): void => {
    const found = area.current ? textareaTrigger(area.current) : null
    if (!found) dismissed.current = null
    const next = found && found.from !== dismissed.current ? found : null
    setSlash((prev) => (prev?.from === next?.from && prev?.query === next?.query && prev?.kind === next?.kind ? prev : next))
  }

  useLayoutEffect(() => {
    if (caret.current === null || !area.current) return
    area.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  })

  const insertText = (text: string, from: number, to: number): void => {
    const next = value.slice(0, from) + text + value.slice(to)
    const end = from + text.length
    // Se o texto inserido terminar em "/algo", não abre o menu de novo por causa dele.
    const after = slashTrigger(next.slice(next.lastIndexOf('\n', end - 1) + 1, end))
    dismissed.current = after === null ? null : end - after.length
    caret.current = end
    onChange(next)
    setSlash(null)
    setSearching(false)
    area.current?.focus()
  }

  const insertSnippet = (match: SnippetMatch, from: number, to: number): void => {
    const { text, missing } = snippetText(match.item.content, values)
    insertText(text, from, to)
    warnMissing(missing)
  }

  const insertVariable = (v: SheetVariable, from: number, to: number): void => insertText(v.value || `{{${v.key}}}`, from, to)

  const slashEnd = (): number => area.current?.selectionStart ?? (slash ? slash.from + slash.length : value.length)
  const close = (): void => {
    if (slash) dismissed.current = slash.from
    setSlash(null)
  }

  return (
    <span className="snippet-field">
      <textarea
        {...rest}
        ref={area}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          detect()
        }}
        onSelect={detect}
        onBlur={() => setSlash(null)}
        onKeyDown={(e) => {
          if (slash && picker.current?.onKey(e)) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
      />
      <button
        ref={button}
        type="button"
        className={cx('icon-btn snippet-field-btn', searching && 'open')}
        title="Inserir snippet (ou digite s/). Digite / para uma variável."
        aria-label="Inserir snippet"
        onClick={() => setSearching((v) => !v)}
      >
        <Terminal size={13} />
      </button>
      {searching ? (
        <SnippetPicker
          anchor={() => button.current?.getBoundingClientRect()}
          trigger={button}
          onPick={(m) => insertSnippet(m, area.current?.selectionStart ?? value.length, area.current?.selectionEnd ?? value.length)}
          onClose={(via) => {
            setSearching(false)
            if (via === 'key') area.current?.focus()
          }}
        />
      ) : slash?.kind === 'snippet' ? (
        <SnippetPicker
          ref={picker}
          query={slash.query}
          anchor={() => area.current && caretCoords(area.current, slash.from)}
          onPick={(m) => insertSnippet(m, slash.from, slashEnd())}
          onClose={close}
        />
      ) : (
        slash?.kind === 'variable' && (
          <VariablePicker
            ref={picker}
            variables={variables}
            query={slash.query}
            anchor={() => area.current && caretCoords(area.current, slash.from)}
            onPick={(v) => insertVariable(v, slash.from, slashEnd())}
            onClose={close}
          />
        )
      )}
    </span>
  )
}
