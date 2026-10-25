import type { Appearance } from '../types'

/** Opções da aparência; o primeiro valor de cada uma é o padrão (e não é gravado). */
export const DENSITIES = ['comfortable', 'compact'] as const
export const CARD_STYLES = ['bordered', 'elevated', 'flat'] as const
export const RADII = ['medium', 'square', 'round'] as const

export const DENSITY_LABELS: Record<(typeof DENSITIES)[number], string> = { comfortable: 'Confortável', compact: 'Compacta' }
export const CARD_LABELS: Record<(typeof CARD_STYLES)[number], string> = { bordered: 'Com borda', elevated: 'Com sombra', flat: 'Planos' }
export const RADIUS_LABELS: Record<(typeof RADII)[number], string> = { medium: 'Suaves', square: 'Retos', round: 'Arredondados' }

/** Cores de destaque prontas; a padrão do app é o âmbar. */
export const ACCENTS: { color: string; name: string }[] = [
  { color: '#b45309', name: 'Âmbar (padrão)' },
  { color: '#dc2626', name: 'Vermelho' },
  { color: '#db2777', name: 'Rosa' },
  { color: '#7c3aed', name: 'Roxo' },
  { color: '#2563eb', name: 'Azul' },
  { color: '#0d9488', name: 'Turquesa' },
  { color: '#16a34a', name: 'Verde' },
  { color: '#475569', name: 'Grafite' }
]
export const DEFAULT_ACCENT = ACCENTS[0].color

const HEX_RE = /^#[0-9a-f]{6}$/i

/** Lê a aparência do arquivo: só valores conhecidos; os padrões não ficam gravados. */
export function cleanAppearance(raw: unknown): Appearance {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const v = raw as Record<string, unknown>
  const out: Appearance = {}
  if (typeof v.accent === 'string' && HEX_RE.test(v.accent) && v.accent.toLowerCase() !== DEFAULT_ACCENT) out.accent = v.accent.toLowerCase()
  if (v.density === 'compact') out.density = 'compact'
  if (v.cards === 'elevated' || v.cards === 'flat') out.cards = v.cards
  if (v.radius === 'square' || v.radius === 'round') out.radius = v.radius
  return out
}

/**
 * Cor do texto sobre a cor de destaque (botões primários): preto ou branco, o que tiver
 * mais contraste (luminância relativa do WCAG).
 */
export function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Contraste com branco (1.05 / (L + 0.05)) contra preto ((L + 0.05) / 0.05).
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '#ffffff' : '#1a1204'
}
