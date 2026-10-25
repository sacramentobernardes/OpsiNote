/**
 * Layout do grafo por forças: ligações puxam como molas, todos os nós se empurram e uma
 * leve gravidade segura tudo perto do centro. A repulsão só olha os nós das células
 * vizinhas de uma grade, então cada passo é quase linear no número de nós.
 */
export interface LayoutLink {
  source: number
  target: number
  /** Comprimento de repouso da mola. */
  length: number
  strength: number
}

export interface Simulation {
  /** x, y de cada nó, intercalados: [x0, y0, x1, y1, …]. */
  pos: Float64Array
  /** Um passo; devolve false quando o grafo assentou. */
  step: () => boolean
  /** Prende um nó numa posição (arrastando), ou solta com `null`. */
  fix: (i: number, x: number | null, y?: number) => void
  /** Dá energia de novo (depois de arrastar ou de reorganizar). */
  reheat: (alpha?: number) => void
}

const REPULSION = 2600
const CELL = 140
const GRAVITY = 0.012
const DAMPING = 0.82
const ALPHA_MIN = 0.004
const ALPHA_DECAY = 0.985

/** Posição inicial previsível: uma espiral (o mesmo grafo sempre começa igual). */
function spiral(i: number): [number, number] {
  const r = 12 * Math.sqrt(i + 1)
  const a = i * 2.399963 // ângulo áureo
  return [r * Math.cos(a), r * Math.sin(a)]
}

/**
 * `charge` (opcional, 1 por padrão) é o quanto cada nó empurra os outros: espaços com carga maior
 * abrem espaço para os próprios itens e ficam mais longe uns dos outros.
 */
export function createSimulation(count: number, links: LayoutLink[], initial?: Float64Array, charge?: Float64Array): Simulation {
  const pos = new Float64Array(count * 2)
  const vel = new Float64Array(count * 2)
  const fixed = new Map<number, [number, number]>()
  for (let i = 0; i < count; i++) {
    const [x, y] = initial && i * 2 + 1 < initial.length ? [initial[i * 2], initial[i * 2 + 1]] : spiral(i)
    pos[i * 2] = x
    pos[i * 2 + 1] = y
  }
  let alpha = 1

  const step = (): boolean => {
    if (alpha < ALPHA_MIN) return false
    const force = new Float64Array(count * 2)

    // Repulsão, só entre nós de células vizinhas.
    const grid = new Map<string, number[]>()
    for (let i = 0; i < count; i++) {
      const key = `${Math.floor(pos[i * 2] / CELL)},${Math.floor(pos[i * 2 + 1] / CELL)}`
      const cell = grid.get(key)
      if (cell) cell.push(i)
      else grid.set(key, [i])
    }
    for (const [key, cell] of grid) {
      const [cx, cy] = key.split(',').map(Number)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const other = grid.get(`${cx + dx},${cy + dy}`)
          if (!other) continue
          for (const i of cell) {
            for (const j of other) {
              if (j <= i && other === cell) continue
              if (other !== cell && j < i) continue
              let ddx = pos[i * 2] - pos[j * 2]
              let ddy = pos[i * 2 + 1] - pos[j * 2 + 1]
              let d2 = ddx * ddx + ddy * ddy
              if (d2 < 0.01) {
                // Nós no mesmo ponto: separa numa direção qualquer, mas sempre a mesma.
                ddx = ((i * 7919) % 13) - 6 || 1
                ddy = ((j * 104729) % 13) - 6 || 1
                d2 = ddx * ddx + ddy * ddy
              }
              if (d2 > CELL * CELL * 4) continue
              const f = (REPULSION * (charge?.[i] ?? 1) * (charge?.[j] ?? 1)) / d2
              const d = Math.sqrt(d2)
              force[i * 2] += (ddx / d) * f
              force[i * 2 + 1] += (ddy / d) * f
              force[j * 2] -= (ddx / d) * f
              force[j * 2 + 1] -= (ddy / d) * f
            }
          }
        }
      }
    }

    // Molas das ligações.
    for (const l of links) {
      const dx = pos[l.target * 2] - pos[l.source * 2]
      const dy = pos[l.target * 2 + 1] - pos[l.source * 2 + 1]
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01
      const f = (d - l.length) * l.strength
      force[l.source * 2] += (dx / d) * f
      force[l.source * 2 + 1] += (dy / d) * f
      force[l.target * 2] -= (dx / d) * f
      force[l.target * 2 + 1] -= (dy / d) * f
    }

    // Gravidade, amortecimento e movimento (limitado, para nada explodir).
    for (let i = 0; i < count; i++) {
      const pin = fixed.get(i)
      if (pin) {
        pos[i * 2] = pin[0]
        pos[i * 2 + 1] = pin[1]
        vel[i * 2] = vel[i * 2 + 1] = 0
        continue
      }
      for (const k of [0, 1]) {
        const p = i * 2 + k
        vel[p] = (vel[p] + (force[p] - pos[p] * GRAVITY) * alpha) * DAMPING
        vel[p] = Math.max(-40, Math.min(40, vel[p]))
        pos[p] += vel[p]
      }
    }
    alpha *= ALPHA_DECAY
    return true
  }

  return {
    pos,
    step,
    fix: (i, x, y) => {
      if (x === null) fixed.delete(i)
      else fixed.set(i, [x, y ?? 0])
    },
    reheat: (a = 0.5) => {
      alpha = Math.max(alpha, a)
    }
  }
}
