import type { ShortcutId, ShortcutOverrides } from '../types'

/**
 * Atalhos de teclado do app. Cada combinação é guardada como texto, na ordem
 * Ctrl, Alt, Shift e a tecla física (`KeyboardEvent.code`): "Ctrl+Shift+KeyN".
 * Usar a tecla física faz o atalho valer igual em qualquer layout de teclado.
 * No Mac, Cmd conta como Ctrl.
 */
export interface ShortcutDef {
  id: ShortcutId
  label: string
  group: string
  default: string
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'palette', group: 'Geral', label: 'Buscar em tudo e executar comandos', default: 'Ctrl+KeyK' },
  { id: 'shortcuts', group: 'Geral', label: 'Mostrar os atalhos', default: 'Ctrl+Slash' },
  { id: 'settings', group: 'Geral', label: 'Abrir as configurações', default: 'Ctrl+Comma' },
  { id: 'help', group: 'Geral', label: 'Abrir a ajuda', default: 'F1' },
  { id: 'newWorkspace', group: 'Geral', label: 'Novo espaço', default: 'Ctrl+Shift+KeyN' },
  { id: 'toggleRail', group: 'Geral', label: 'Expandir ou recolher o menu', default: 'Ctrl+Backslash' },
  { id: 'focus', group: 'Geral', label: 'Entrar ou sair do modo foco', default: 'Ctrl+Shift+KeyF' },
  { id: 'prevItem', group: 'Itens e notas', label: 'Abrir o item anterior da árvore', default: 'Alt+ArrowUp' },
  { id: 'nextItem', group: 'Itens e notas', label: 'Abrir o próximo item da árvore', default: 'Alt+ArrowDown' },
  { id: 'toggleDone', group: 'Itens e notas', label: 'Marcar o item aberto como concluído ou pendente', default: 'Ctrl+Enter' },
  { id: 'duplicate', group: 'Itens e notas', label: 'Duplicar o item, nota, snippet ou modelo aberto', default: 'Ctrl+Shift+KeyD' },
  { id: 'copySnippet', group: 'Snippets', label: 'Copiar o snippet aberto com as variáveis preenchidas', default: 'Ctrl+Shift+KeyC' }
]

/** Atalhos que não podem ser trocados (aparecem na lista só para consulta). */
export const FIXED_SHORTCUTS: { group: string; label: string; keys: string[] }[] = [
  { group: 'Geral', label: 'Sair do modo foco', keys: ['Esc'] }
]

export const SHORTCUT_GROUPS = ['Geral', 'Itens e notas', 'Snippets']

const SHORTCUT_IDS = new Set<string>(SHORTCUTS.map((s) => s.id))
const DEFS = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s])) as Record<ShortcutId, ShortcutDef>

export type Bindings = Record<ShortcutId, string | null>

/** Combinação de cada ação: a personalizada ou, se não houver, a padrão. `null` = desativado. */
export function resolveBindings(overrides: ShortcutOverrides | undefined): Bindings {
  const out = {} as Bindings
  for (const s of SHORTCUTS) out[s.id] = overrides && s.id in overrides ? (overrides[s.id] ?? null) : s.default
  return out
}

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$|^(CapsLock|NumLock|ScrollLock|Fn|FnLock|AltGraph|ContextMenu)$/

/** Teclas que existem em layouts diferentes com outro código, mas são a mesma para o usuário. */
const CODE_ALIASES: Record<string, string> = { IntlRo: 'Slash', IntlBackslash: 'Backslash', NumpadEnter: 'Enter' }

/** Teclas aceitas como tecla principal de um atalho. */
const KEY_RE =
  /^(Key[A-Z]|Digit\d|Numpad(\d|Add|Subtract|Multiply|Divide|Decimal)|F([1-9]|1\d|2[0-4])|Arrow(Up|Down|Left|Right)|Enter|Space|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash)$/

const COMBO_RE = new RegExp(`^(Ctrl\\+)?(Alt\\+)?(Shift\\+)?(${KEY_RE.source.slice(2, -2)})$`)

export const isCombo = (v: unknown): v is string => typeof v === 'string' && COMBO_RE.test(v)

export interface KeyLike {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** A combinação de um evento de teclado, ou null quando é só um modificador (ou uma tecla sem uso). */
export function comboFromEvent(e: KeyLike): string | null {
  if (!e.code || MODIFIER_CODES.test(e.code)) return null
  const code = CODE_ALIASES[e.code] ?? e.code
  if (!KEY_RE.test(code)) return null
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', code].filter(Boolean).join('+')
}

/** Modificadores segurados, para mostrar enquanto a pessoa ainda está escolhendo a tecla. */
export function heldModifiers(e: KeyLike): string[] {
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean)
}

const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Espaço',
  Delete: 'Del',
  Insert: 'Ins',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .'
}

function keyLabel(code: string): string {
  if (KEY_LABELS[code]) return KEY_LABELS[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
  return code
}

/** Teclas para mostrar na tela: "Ctrl+Shift+KeyN" → ["Ctrl", "Shift", "N"]. */
export function comboKeys(combo: string): string[] {
  const parts = combo.split('+')
  // A própria tecla "+" do teclado numérico tem nome próprio, então o split é seguro.
  return [...parts.slice(0, -1), keyLabel(parts[parts.length - 1])]
}

export const hint = (keys: string[]): string => keys.join('+')

/** "Ctrl+Shift+N", ou '' quando o atalho está desativado. */
export const comboHint = (combo: string | null): string => (combo ? hint(comboKeys(combo)) : '')

/** "Novo espaço (Ctrl+Shift+N)", sem os parênteses quando o atalho está desativado. */
export const withHint = (label: string, combo: string | null): string => (combo ? `${label} (${comboHint(combo)})` : label)

/** Combinações que o sistema, o editor de texto ou a janela já usam. */
const RESERVED: Record<string, string> = {
  'Ctrl+KeyC': 'copiar',
  'Ctrl+KeyV': 'colar',
  'Ctrl+Shift+KeyV': 'colar sem formatação',
  'Ctrl+KeyX': 'recortar',
  'Ctrl+KeyZ': 'desfazer',
  'Ctrl+KeyY': 'refazer',
  'Ctrl+Shift+KeyZ': 'refazer',
  'Ctrl+KeyA': 'selecionar tudo',
  'Ctrl+KeyB': 'negrito',
  'Ctrl+KeyI': 'itálico',
  'Ctrl+KeyU': 'sublinhado',
  'Ctrl+KeyE': 'código no texto',
  'Ctrl+Shift+KeyS': 'riscado',
  'Ctrl+Shift+KeyB': 'citação',
  'Ctrl+Shift+Digit7': 'lista numerada',
  'Ctrl+Shift+Digit8': 'lista com marcadores',
  'Ctrl+Shift+Digit9': 'lista de tarefas',
  'Ctrl+KeyR': 'recarregar a janela',
  'Ctrl+Shift+KeyR': 'recarregar a janela',
  'Ctrl+KeyW': 'fechar a janela',
  'Alt+F4': 'fechar a janela',
  'Ctrl+Shift+KeyI': 'ferramentas do desenvolvedor',
  'Ctrl+Digit0': 'zoom',
  'Ctrl+Minus': 'zoom',
  'Ctrl+Equal': 'zoom',
  'Ctrl+Shift+Equal': 'zoom',
  F11: 'tela cheia'
}

/** Teclas que, com Ctrl, movem o cursor ou apagam palavras no texto. */
const EDITING_KEYS = /^(Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown|Backspace|Delete)$/
/** Teclas que produzem um caractere ao digitar. */
const CHARACTER_KEYS = /^(Key[A-Z]|Digit\d|Space|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash)$/

/**
 * Confere se `combo` pode virar o atalho de `id`. Devolve o motivo para recusar,
 * ou null quando pode. Nunca deixa duas ações com a mesma combinação.
 */
export function validateCombo(id: ShortcutId, combo: string, bindings: Bindings): string | null {
  const parts = combo.split('+')
  const code = parts[parts.length - 1]
  const ctrl = parts.includes('Ctrl')
  const alt = parts.includes('Alt')

  if (!ctrl && !alt && !/^F\d+$/.test(code)) {
    return 'Combine com Ctrl ou Alt (ou use uma tecla de F1 a F12). Sozinha, a tecla atrapalharia a digitação.'
  }
  if (ctrl && alt && CHARACTER_KEYS.test(code)) {
    return 'Ctrl+Alt com letras, números ou símbolos equivale ao AltGr, que digita caracteres como @, € e /. Escolha outra combinação.'
  }
  if (ctrl && !alt && EDITING_KEYS.test(code)) {
    return `${comboHint(combo)} já move o cursor ou apaga palavras no texto. Escolha outra combinação.`
  }
  if (RESERVED[combo]) return `${comboHint(combo)} já é usado para ${RESERVED[combo]}. Escolha outra combinação.`

  const other = SHORTCUTS.find((s) => s.id !== id && bindings[s.id] === combo)
  if (other) return `${comboHint(combo)} já é o atalho de “${other.label}”. Mude aquele primeiro ou escolha outra combinação.`
  return null
}

/**
 * Atalhos personalizados lidos do arquivo: só ficam ids conhecidos com combinações válidas.
 * Uma combinação repetida (arquivo editado à mão) é descartada, voltando ao padrão.
 */
export function cleanOverrides(raw: unknown): ShortcutOverrides {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: ShortcutOverrides = {}
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (SHORTCUT_IDS.has(id) && (v === null || isCombo(v))) out[id as ShortcutId] = v
  }
  // Tira uma personalizada inválida por vez: voltar ao padrão pode criar um conflito novo.
  for (;;) {
    const bindings = resolveBindings(out)
    const bad = (Object.keys(out) as ShortcutId[]).find((k) => {
      const v = out[k]
      return v && validateCombo(k, v, bindings) !== null
    })
    if (!bad) return out
    delete out[bad]
  }
}

/** Grava a escolha no mapa de personalizados; voltar ao padrão remove a entrada. */
export function setOverride(overrides: ShortcutOverrides, id: ShortcutId, combo: string | null): ShortcutOverrides {
  const next = { ...overrides }
  if (combo === DEFS[id].default) delete next[id]
  else next[id] = combo
  return next
}
