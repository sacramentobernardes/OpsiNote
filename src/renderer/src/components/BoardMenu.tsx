import { BookCopy, Copy, ExternalLink, Layers, Pencil, Pin, PinOff, Trash, Upload } from 'lucide-react'
import { useStore } from '../store'
import type { Board, BoardType, Kind } from '../types'
import { COLORS, KINDS, KIND_LABELS } from '../lib/util'
import { KindIcon } from './KindIcon'
import type { MenuEntry } from './ui'

const COLOR_NAMES = ['Vermelho', 'Laranja', 'Amarelo', 'Verde', 'Turquesa', 'Azul', 'Roxo', 'Rosa']
const NO_COLOR = 'none'

/** Foca o título do espaço aberto, já selecionado, para renomear digitando. */
function focusTitle(): void {
  // Dois quadros: o primeiro monta o painel do espaço recém-aberto, o segundo já tem o campo.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>('.panel-header input.panel-title')
      input?.focus()
      input?.select()
    })
  )
}

/**
 * Ações de um espaço ou biblioteca, iguais no botão direito (trilho, Início, Bibliotecas)
 * e no "⋯" do cabeçalho. `inHeader` tira o que o cabeçalho já mostra (abrir, renomear).
 */
export function useBoardMenu(): (type: BoardType, board: Board, options?: { inHeader?: boolean }) => MenuEntry[] {
  const open = useStore((s) => s.open)
  const updateBoard = useStore((s) => s.updateBoard)
  const duplicateBoard = useStore((s) => s.duplicateBoard)
  const removeBoard = useStore((s) => s.removeBoard)
  const saveAsLibrary = useStore((s) => s.saveAsLibrary)
  const addBoard = useStore((s) => s.addBoard)
  const setModal = useStore((s) => s.setModal)
  const togglePin = useStore((s) => s.togglePin)

  return (type, board, options = {}) => {
    const noun = type === 'workspace' ? 'espaço' : 'biblioteca'
    const openIt = (): void => open({ type, id: board.id })
    const entries: (MenuEntry | null)[] = [
      options.inHeader ? null : { label: 'Abrir', icon: <ExternalLink size={14} />, onSelect: openIt },
      options.inHeader
        ? null
        : {
            label: 'Renomear',
            icon: <Pencil size={14} />,
            onSelect: () => {
              openIt()
              focusTitle()
            }
          },
      {
        type: 'choices',
        label: 'Cor',
        options: [
          ...COLORS.map((c, i) => ({
            id: c,
            title: COLOR_NAMES[i] ?? c,
            node: <span className="menu-swatch" style={{ background: c }} />,
            active: board.color === c
          })),
          { id: NO_COLOR, title: 'Sem cor', node: <span className="menu-swatch none" />, active: !board.color }
        ],
        onPick: (id) => updateBoard(type, board.id, { color: id === NO_COLOR ? undefined : id })
      },
      {
        type: 'choices',
        label: 'Categoria',
        options: KINDS.map((k) => ({ id: k, title: KIND_LABELS[k], node: <KindIcon kind={k} size={14} />, active: board.kind === k })),
        onPick: (id) => updateBoard(type, board.id, { kind: id as Kind })
      },
      { type: 'separator' },
      board.pinned
        ? { label: 'Desafixar', icon: <PinOff size={14} />, onSelect: () => togglePin({ kind: 'board', type, id: board.id }) }
        : { label: 'Fixar no topo', icon: <Pin size={14} />, onSelect: () => togglePin({ kind: 'board', type, id: board.id }) },
      { label: `Duplicar ${noun}`, icon: <Copy size={14} />, onSelect: () => duplicateBoard(type, board.id) },
      type === 'workspace'
        ? { label: 'Salvar como biblioteca', icon: <BookCopy size={14} />, onSelect: () => saveAsLibrary(board.id) }
        : { label: 'Criar espaço a partir desta', icon: <Layers size={14} />, onSelect: () => addBoard('workspace', board.kind, board.id) },
      { label: `Exportar só ${type === 'workspace' ? 'este espaço' : 'esta biblioteca'}…`, icon: <Upload size={14} />, onSelect: () => setModal({ type: 'export', only: { type, id: board.id } }) },
      { type: 'separator' },
      { label: `Excluir ${noun}`, icon: <Trash size={14} />, danger: true, onSelect: () => removeBoard(type, board.id) }
    ]
    return entries.filter((e): e is MenuEntry => e !== null)
  }
}
