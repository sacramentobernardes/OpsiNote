import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useStore } from '../store'

const KEY_STEP = 16

const RAIL_MIN = 180
const RAIL_MAX = 360
/** Abaixo desta largura, arrastar a borda recolhe o trilho. */
const RAIL_COLLAPSE_AT = 120
/** Com o trilho recolhido, arrastar além disto o expande. */
const RAIL_EXPAND_AT = 140

const PANEL_MIN = 220
const PANEL_MAX = 560

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

/**
 * Alça vertical na borda direita do elemento pai. Informa a nova largura
 * (posição do ponteiro menos a borda esquerda do pai) enquanto é arrastada.
 */
function Resizer({
  label,
  onStart,
  onResize,
  onStep,
  onReset
}: {
  label: string
  onStart?: () => void
  onResize: (width: number) => void
  onStep: (delta: number) => void
  onReset: () => void
}): ReactNode {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget
    const left = handle.parentElement?.getBoundingClientRect().left ?? 0
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing')
    onStart?.()

    const move = (ev: PointerEvent): void => onResize(ev.clientX - left)
    const end = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      document.body.classList.remove('resizing')
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }

  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={`${label} · arraste para ajustar, duplo clique para o padrão`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onStep(-KEY_STEP)
        else if (e.key === 'ArrowRight') onStep(KEY_STEP)
        else return
        e.preventDefault()
      }}
    />
  )
}

/** Borda do trilho: ajusta a largura expandida e expande/recolhe ao passar dos limites. */
export function RailResizer(): ReactNode {
  const setRailWidth = useStore((s) => s.setRailWidth)
  const toggleRail = useStore((s) => s.toggleRail)
  // Largura antes do arraste: é a que volta quando o trilho for expandido de novo.
  const startWidth = useRef<number | null>(null)

  const resize = (width: number): void => {
    // Lê o estado na hora: o arraste pode expandir ou recolher no meio do caminho.
    const { railExpanded } = useStore.getState()
    if (!railExpanded) {
      if (width > RAIL_EXPAND_AT) {
        toggleRail()
        setRailWidth(clamp(width, RAIL_MIN, RAIL_MAX))
      }
      return
    }
    if (width < RAIL_COLLAPSE_AT) {
      toggleRail()
      setRailWidth(startWidth.current)
    } else if (width >= RAIL_MIN) {
      setRailWidth(Math.min(width, RAIL_MAX))
    }
  }

  const step = (delta: number): void => {
    const { railExpanded, railWidth } = useStore.getState()
    if (!railExpanded) {
      if (delta > 0) toggleRail()
      return
    }
    setRailWidth(clamp((railWidth ?? document.querySelector('.rail')?.clientWidth ?? RAIL_MIN) + delta, RAIL_MIN, RAIL_MAX))
  }

  return (
    <Resizer
      label="Largura do menu"
      onStart={() => {
        const { railExpanded, railWidth } = useStore.getState()
        startWidth.current = railExpanded ? railWidth : null
      }}
      onResize={resize}
      onStep={step}
      onReset={() => setRailWidth(null)}
    />
  )
}

/** Borda do painel de contexto (árvore). */
export function PanelResizer(): ReactNode {
  const setPanelWidth = useStore((s) => s.setPanelWidth)
  // Deixa pelo menos metade da janela para o documento.
  const max = (): number => Math.max(PANEL_MIN, Math.min(PANEL_MAX, window.innerWidth * 0.5))

  const step = (delta: number): void => {
    const current = useStore.getState().panelWidth ?? document.querySelector('.panel')?.clientWidth ?? PANEL_MIN
    setPanelWidth(clamp(current + delta, PANEL_MIN, max()))
  }

  return (
    <Resizer
      label="Largura do painel"
      onResize={(w) => setPanelWidth(clamp(w, PANEL_MIN, max()))}
      onStep={step}
      onReset={() => setPanelWidth(null)}
    />
  )
}
