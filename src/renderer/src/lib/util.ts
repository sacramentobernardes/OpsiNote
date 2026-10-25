import type { Board, Kind, Section } from '../types'

export function newId(): string {
  return crypto.randomUUID()
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Até duas iniciais para os avatares do trilho ("Pentest Web" → "PW"). */
export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]
  return letters.toUpperCase()
}

export const COLORS =['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']

export const KIND_LABELS: Record<Kind, string> = {
  pentest: 'Pentest',
  study: 'Estudo',
  project: 'Projeto',
  task: 'Tarefas',
  other: 'Geral'
}

export const KINDS: Kind[] = ['pentest', 'study', 'project', 'task', 'other']

/** Tempo restante do temporizador: "24:59", ou "1:29:59" a partir de uma hora. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Fixados primeiro, mantendo a ordem de cada grupo. A ordem guardada não muda. */
export function pinnedFirst<T extends { pinned?: boolean }>(list: T[]): T[] {
  return list.some((x) => x.pinned) ? [...list.filter((x) => x.pinned), ...list.filter((x) => !x.pinned)] : list
}

export function progress(sections: Section[]): { done: number; total: number; percent: number } {
  let done = 0
  let total = 0
  for (const s of sections) {
    total += s.checklist.length
    done += s.checklist.filter((e) => e.done).length
  }
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

/** Copia seções com ids novos e checklist zerado. */
export function cloneSections(sections: Section[]): Section[] {
  return sections.map((s) => ({
    id: newId(),
    title: s.title,
    checklist: s.checklist.map((e) => ({ ...e, id: newId(), done: false })),
    notes: s.notes.map((e) => ({ ...e, id: newId() }))
  }))
}

export function boardFromSections(title: string, kind: Kind, sections: Section[], color?: string): Board {
  const now = Date.now()
  return { id: newId(), title, kind, color, sections, createdAt: now, updatedAt: now }
}

export { htmlToText as stripHtml } from './text'

export async function copyText(text: string): Promise<void> {
  // Pelo Electron quando disponível; a API do navegador exige a janela em foco.
  if (typeof window !== 'undefined' && window.api?.copyText) await window.api.copyText(text)
  else await navigator.clipboard.writeText(text)
}
