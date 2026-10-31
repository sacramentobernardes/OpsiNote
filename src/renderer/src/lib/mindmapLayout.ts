/**
 * Posições do mapa mental, a partir do tamanho de cada nó (medido na tela). Quatro arranjos:
 * - map: a raiz no meio e os ramos divididos entre a direita e a esquerda;
 * - right: tudo para a direita (organograma horizontal);
 * - down: tudo para baixo (organograma vertical);
 * - radial: os níveis em anéis em volta da raiz.
 * Nos três primeiros cada filho começa depois da borda do pai e os ramos se empilham sem encostar.
 * No vertical, filhos que são todos folhas descem numa coluna (senão a última fileira fica larga demais).
 * Os filhos de um nó recolhido não entram. Por fim, os tópicos arrastados pelo usuário (`moved`)
 * são deslocados, cada um com o ramo dele.
 */
import type { MindLayout, MindNode } from '../types'

export interface Size {
  w: number
  h: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** De que lado do pai o nó fica (decide de onde sai a linha e onde fica o botão de recolher). */
export type Side = 'root' | 'right' | 'left' | 'down' | 'stack' | 'radial'

export interface Placed {
  box: Box
  depth: number
  side: Side
  parent: string | null
}

export type Placement = Map<string, Placed>

/** Distância entre um nível e o próximo, e entre ramos vizinhos. */
const LEVEL_H = 56
const GAP_H = 10
const LEVEL_V = 52
const GAP_V = 18
/** Coluna de folhas no vertical: recuo em relação ao pai e espaço entre elas. */
const STACK_INDENT = 22
const STACK_GAP = 8

const visible = (n: MindNode): MindNode[] => (n.collapsed ? [] : n.children)
const stacks = (n: MindNode): boolean => visible(n).length > 0 && visible(n).every((c) => visible(c).length === 0)

type SizeOf = (n: MindNode) => Size

/** Quanto o ramo ocupa na direção em que os irmãos se empilham (altura, ou largura no vertical). */
function extents(n: MindNode, sizeOf: SizeOf, vertical: boolean, out: Map<string, number>): number {
  const s = sizeOf(n)
  const own = vertical ? s.w : s.h
  const kids = visible(n)
  if (vertical && stacks(n)) {
    const widest = kids.reduce((m, c) => Math.max(m, sizeOf(c).w), 0)
    for (const c of kids) out.set(c.id, sizeOf(c).w)
    const e = Math.max(own, STACK_INDENT + widest)
    out.set(n.id, e)
    return e
  }
  const gap = vertical ? GAP_V : GAP_H
  const sum = kids.reduce((t, c) => t + extents(c, sizeOf, vertical, out), 0) + gap * Math.max(0, kids.length - 1)
  const e = Math.max(own, sum)
  out.set(n.id, e)
  return e
}

/**
 * Põe o nó e o ramo dele. `main` é a borda do nó do lado do pai (a esquerda, indo para a
 * direita; a direita, indo para a esquerda; o topo, indo para baixo); `start` é onde o ramo
 * começa no outro eixo.
 */
function placeTree(
  n: MindNode,
  side: Exclude<Side, 'root' | 'radial' | 'stack'>,
  main: number,
  start: number,
  depth: number,
  parent: string | null,
  sizeOf: SizeOf,
  ext: Map<string, number>,
  out: Placement
): void {
  const s = sizeOf(n)
  const e = ext.get(n.id)!
  const vertical = side === 'down'
  const box: Box =
    side === 'down'
      ? { x: stacks(n) ? start : start + e / 2 - s.w / 2, y: main, w: s.w, h: s.h }
      : { x: side === 'right' ? main : main - s.w, y: start + e / 2 - s.h / 2, w: s.w, h: s.h }
  out.set(n.id, { box, depth, side: depth === 0 ? 'root' : side, parent })
  if (vertical && stacks(n)) {
    // O pai fica à esquerda do ramo e a coluna desce recuada embaixo dele.
    const x = box.x + STACK_INDENT
    let y = box.y + s.h + STACK_GAP + 6
    for (const c of visible(n)) {
      const cs = sizeOf(c)
      out.set(c.id, { box: { x, y, w: cs.w, h: cs.h }, depth: depth + 1, side: 'stack', parent: n.id })
      y += cs.h + STACK_GAP
    }
    return
  }
  const next = side === 'down' ? main + s.h + LEVEL_V : side === 'right' ? main + s.w + LEVEL_H : main - s.w - LEVEL_H
  placeKids(visible(n), side, next, start + e / 2, depth + 1, n.id, sizeOf, ext, out, vertical)
}

/** Os filhos centralizados em `center`, um depois do outro. */
function placeKids(
  kids: MindNode[],
  side: Exclude<Side, 'root' | 'radial' | 'stack'>,
  main: number,
  center: number,
  depth: number,
  parent: string,
  sizeOf: SizeOf,
  ext: Map<string, number>,
  out: Placement,
  vertical: boolean
): void {
  const gap = vertical ? GAP_V : GAP_H
  const total = kids.reduce((t, c) => t + ext.get(c.id)!, 0) + gap * Math.max(0, kids.length - 1)
  let at = center - total / 2
  for (const c of kids) {
    placeTree(c, side, main, at, depth, parent, sizeOf, ext, out)
    at += ext.get(c.id)! + gap
  }
}

function radial(root: MindNode, sizeOf: SizeOf, out: Placement): void {
  const leaves = new Map<string, number>()
  const maxW: number[] = []
  const maxH: number[] = []
  const count: number[] = []
  const scan = (n: MindNode, d: number): number => {
    const s = sizeOf(n)
    maxW[d] = Math.max(maxW[d] ?? 0, s.w)
    maxH[d] = Math.max(maxH[d] ?? 0, s.h)
    count[d] = (count[d] ?? 0) + 1
    const kids = visible(n)
    const v = kids.length ? kids.reduce((t, c) => t + scan(c, d + 1), 0) : 1
    leaves.set(n.id, v)
    return v
  }
  scan(root, 0)
  // Cada anel fica longe o bastante do anterior e é grande o bastante para os nós dele caberem.
  const radius = [0]
  for (let d = 1; d < count.length; d++) {
    const inner = d === 1 ? Math.hypot(maxW[0], maxH[0]) / 2 : radius[d - 1] + maxW[d - 1] / 2
    const around = (count[d] * (maxH[d] + 16)) / (2 * Math.PI)
    radius[d] = Math.max(inner + maxW[d] / 2 + 48, around)
  }
  // Cada ramo ganha uma fatia do círculo proporcional ao número de folhas; começa no topo.
  const place = (n: MindNode, d: number, a0: number, a1: number, parent: string | null): void => {
    const s = sizeOf(n)
    const a = (a0 + a1) / 2
    const cx = radius[d] * Math.cos(a)
    const cy = radius[d] * Math.sin(a)
    out.set(n.id, { box: { x: cx - s.w / 2, y: cy - s.h / 2, w: s.w, h: s.h }, depth: d, side: d === 0 ? 'root' : 'radial', parent })
    let at = a0
    for (const c of visible(n)) {
      const span = ((a1 - a0) * leaves.get(c.id)!) / leaves.get(n.id)!
      place(c, d + 1, at, at + span, n.id)
      at += span
    }
  }
  place(root, 0, -Math.PI / 2, (3 * Math.PI) / 2, null)
}

export function layoutMindMap(root: MindNode, sizeOf: SizeOf, layout: MindLayout = 'map', moved?: Record<string, [number, number]>): Placement {
  const out = autoLayout(root, sizeOf, layout)
  if (moved && Object.keys(moved).length) {
    const shift = (n: MindNode, ox: number, oy: number): void => {
      const p = out.get(n.id)
      if (!p) return
      const o = moved[n.id]
      const x = ox + (o?.[0] ?? 0)
      const y = oy + (o?.[1] ?? 0)
      if (x || y) p.box = { ...p.box, x: p.box.x + x, y: p.box.y + y }
      for (const c of visible(n)) shift(c, x, y)
    }
    shift(root, 0, 0)
  }
  return out
}

function autoLayout(root: MindNode, sizeOf: SizeOf, layout: MindLayout): Placement {
  const out: Placement = new Map()
  if (layout === 'radial') {
    radial(root, sizeOf, out)
    return out
  }
  const vertical = layout === 'down'
  const ext = new Map<string, number>()
  extents(root, sizeOf, vertical, ext)
  if (layout !== 'map') {
    // A raiz centralizada na origem.
    const s = sizeOf(root)
    const e = ext.get(root.id)!
    placeTree(root, layout, vertical ? -s.h / 2 : -s.w / 2, -e / 2, 0, null, sizeOf, ext, out)
    return out
  }
  // Mapa: a raiz no centro, os primeiros ramos à direita até dar metade da altura, o resto à esquerda.
  const s = sizeOf(root)
  out.set(root.id, { box: { x: -s.w / 2, y: -s.h / 2, w: s.w, h: s.h }, depth: 0, side: 'root', parent: null })
  const kids = visible(root)
  const total = kids.reduce((t, c) => t + ext.get(c.id)!, 0)
  let split = kids.length
  if (kids.length > 1) {
    let acc = 0
    split = 0
    while (split < kids.length && (split === 0 || acc + ext.get(kids[split].id)! / 2 <= total / 2)) acc += ext.get(kids[split++].id)!
  }
  placeKids(kids.slice(0, split), 'right', s.w / 2 + LEVEL_H, 0, 1, root.id, sizeOf, ext, out, false)
  placeKids(kids.slice(split), 'left', -s.w / 2 - LEVEL_H, 0, 1, root.id, sizeOf, ext, out, false)
  return out
}

const r = (v: number): string => v.toFixed(1)

/**
 * A linha do pai até o filho: curva saindo da borda do pai (ou reta entre os centros, no radial).
 * Nos arranjos laterais o lado sai da posição real: um tópico arrastado para o outro lado do pai
 * ganha a linha do outro lado.
 */
export function edgePath(from: Box, to: Placed): string {
  const t = to.box
  const fy = from.y + from.h / 2
  const ty = t.y + t.h / 2
  switch (to.side) {
    case 'right':
    case 'left': {
      const right = t.x + t.w / 2 >= from.x + from.w / 2
      const x1 = right ? from.x + from.w : from.x
      const x2 = right ? t.x : t.x + t.w
      const m = (x1 + x2) / 2
      return `M${r(x1)} ${r(fy)}C${r(m)} ${r(fy)} ${r(m)} ${r(ty)} ${r(x2)} ${r(ty)}`
    }
    case 'down': {
      const fx = from.x + from.w / 2
      const tx = t.x + t.w / 2
      const y1 = from.y + from.h
      const m = (y1 + t.y) / 2
      return `M${r(fx)} ${r(y1)}C${r(fx)} ${r(m)} ${r(tx)} ${r(m)} ${r(tx)} ${r(t.y)}`
    }
    case 'stack': {
      // Desce do pai e entra na folha pela esquerda, em L.
      const x = from.x + STACK_INDENT / 2
      return `M${r(x)} ${r(from.y + from.h)}V${r(ty)}H${r(t.x)}`
    }
    default:
      return `M${r(from.x + from.w / 2)} ${r(fy)}L${r(t.x + t.w / 2)} ${r(ty)}`
  }
}

export function bounds(placed: Placement): Box | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { box: b } of placed.values()) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  return placed.size ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null
}

export type Direction = 'left' | 'right' | 'up' | 'down'

/**
 * O nó mais perto na direção da seta: só conta quem está inteiro depois da borda do nó (os
 * tópicos têm larguras diferentes, então comparar os centros erra), e o desvio para os lados
 * pesa mais que a distância.
 */
export function nearest(placed: Placement, fromId: string, dir: Direction): string | null {
  const a = placed.get(fromId)?.box
  if (!a) return null
  let best: string | null = null
  let bestScore = Infinity
  for (const [id, { box: b }] of placed) {
    if (id === fromId) continue
    const along = dir === 'right' ? b.x - (a.x + a.w) : dir === 'left' ? a.x - (b.x + b.w) : dir === 'down' ? b.y - (a.y + a.h) : a.y - (b.y + b.h)
    const across =
      dir === 'left' || dir === 'right' ? Math.abs(b.y + b.h / 2 - (a.y + a.h / 2)) : Math.abs(b.x + b.w / 2 - (a.x + a.w / 2))
    if (along < -1) continue
    const score = along + across * 2.5
    if (score < bestScore) {
      bestScore = score
      best = id
    }
  }
  return best
}
