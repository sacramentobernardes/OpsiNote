import type { Kind } from '../types'

export interface SheetField {
  id: string
  label: string
  placeholder: string
  rows: number
}

/** Como a ficha aparece em cada categoria. */
export interface SheetSpec {
  /** "Ficha do alvo", "Ficha de estudo"… */
  title: string
  /** Chaves criadas numa ficha nova. */
  defaultKeys: string[]
  /** Exemplo de uso das variáveis num snippet. */
  varExample: string
  /** Título da seção com o período e os campos. */
  infoTitle: string
  startLabel: string
  endLabel: string
  fields: SheetField[]
}

const field = (id: string, label: string, placeholder: string, rows = 3): SheetField => ({ id, label, placeholder, rows })

export const SHEET_SPECS: Record<Kind, SheetSpec> = {
  pentest: {
    title: 'Ficha do alvo',
    defaultKeys: ['alvo', 'ip', 'dominio', 'url'],
    varExample: 'nmap -sV {{ip}}',
    infoTitle: 'Engajamento',
    startLabel: 'Início',
    endLabel: 'Fim',
    fields: [
      field('scope', 'Escopo', 'O que está dentro e fora do escopo, regras de engajamento, horários permitidos…', 4),
      field('contacts', 'Contatos', 'Responsável técnico, contato de emergência…')
    ]
  },
  study: {
    title: 'Ficha de estudo',
    defaultKeys: ['tema', 'curso'],
    varExample: 'Resumo de {{tema}}',
    infoTitle: 'Plano',
    startLabel: 'Início',
    endLabel: 'Prova / meta',
    fields: [
      field('goal', 'Objetivo', 'O que você quer aprender ou alcançar: certificação, prova, domínio de um assunto…', 4),
      field('materials', 'Materiais', 'Livros, cursos, vídeos, links e documentação de referência…', 4),
      field('schedule', 'Rotina', 'Dias e horários de estudo, metas por semana…')
    ]
  },
  project: {
    title: 'Ficha do projeto',
    defaultKeys: ['repo', 'url'],
    varExample: 'git clone {{repo}}',
    infoTitle: 'Projeto',
    startLabel: 'Início',
    endLabel: 'Entrega',
    fields: [
      field('goal', 'Objetivo', 'O problema que o projeto resolve e o que conta como pronto…', 4),
      field('links', 'Links e recursos', 'Repositório, ambientes, documentação, quadro de tarefas…'),
      field('people', 'Pessoas', 'Quem participa e quem decide…')
    ]
  },
  task: {
    title: 'Ficha das tarefas',
    defaultKeys: [],
    varExample: 'Lembrete: {{responsavel}}',
    infoTitle: 'Prazos',
    startLabel: 'Início',
    endLabel: 'Prazo',
    fields: [field('context', 'Contexto', 'Para que servem estas tarefas, prioridades, dependências…', 4)]
  },
  other: {
    title: 'Ficha',
    defaultKeys: [],
    varExample: 'Olá, {{nome}}',
    infoTitle: 'Informações',
    startLabel: 'Início',
    endLabel: 'Fim',
    fields: [field('notes', 'Anotações', 'Qualquer informação de referência deste espaço…', 4)]
  }
}
