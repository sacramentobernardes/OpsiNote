/** Dados pequenos e previsíveis para os testes (não é usado pelo app). */
import type { AppData, Board, Entry, Section } from '../types'

let n = 0
const id = (prefix: string): string => `${prefix}-${++n}`

export const entry = (title: string, extra: Partial<Entry> = {}): Entry => ({ id: id('e'), title, content: '', ...extra })

export const section = (title: string, checklist: Entry[] = [], notes: Entry[] = []): Section => ({
  id: id('s'),
  title,
  checklist,
  notes
})

export const board = (title: string, sections: Section[] = [], extra: Partial<Board> = {}): Board => ({
  id: id('b'),
  title,
  kind: 'pentest',
  sections,
  createdAt: 1,
  updatedAt: 1,
  ...extra
})

export function makeData(): AppData {
  return {
    version: 1,
    workspaces: [
      board('Pentest ACME', [
        section('Recon', [entry('Rodar nmap', { done: true }), entry('Enumerar subdomínios', { done: false })], [entry('Achados', { content: '<p>Porta <b>8080</b> aberta com Jenkins</p>' })]),
        section('Exploração', [entry('Testar SQLi', { done: false })])
      ]),
      board('Estudos', [section('Redes')])
    ],
    libraries: [board('Roteiro web', [section('Autenticação', [entry('Testar login', { done: false })])])],
    templates: [{ id: id('t'), title: 'Relatório', content: '<h2>Resumo</h2>' }],
    snippetGroups: [
      { id: id('g'), title: 'Rede', items: [entry('nmap', { content: 'nmap -sV {{ip}}' }), entry('curl', { content: 'curl {{url}}' })] },
      { id: id('g'), title: 'Web', items: [] }
    ],
    trash: [],
    settings: { theme: 'system' }
  }
}

/**
 * Limite de tempo dos testes de desempenho. No servidor de integração contínua (CI=true,
 * como no GitHub Actions) as máquinas são mais lentas: o limite triplica, para uma release
 * não ser bloqueada por um falso alarme. Um travamento de verdade estoura do mesmo jeito.
 */
export const timeLimit = (ms: number): number => ms * (process.env.CI ? 3 : 1)
