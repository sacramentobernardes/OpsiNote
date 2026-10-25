import { useState, type ReactNode } from 'react'
import { FolderInput } from 'lucide-react'
import { useStore, type MoveTarget } from '../store'
import type { Board, BoardType, ListType } from '../types'
import { Modal } from './ui'

/** Valor dos <select> de destino: "workspace:<id>" ou "library:<id>". */
const boardValue = (type: BoardType, id: string): string => `${type}:${id}`
const parseBoard = (value: string): { boardType: BoardType; boardId: string } => {
  const [boardType, boardId] = value.split(':') as [BoardType, string]
  return { boardType, boardId }
}

function BoardOptions({ workspaces, libraries }: { workspaces: Board[]; libraries: Board[] }): ReactNode {
  return (
    <>
      {workspaces.length > 0 && (
        <optgroup label="Espaços">
          {workspaces.map((b) => (
            <option key={b.id} value={boardValue('workspace', b.id)}>
              {b.title}
            </option>
          ))}
        </optgroup>
      )}
      {libraries.length > 0 && (
        <optgroup label="Bibliotecas">
          {libraries.map((b) => (
            <option key={b.id} value={boardValue('library', b.id)}>
              {b.title}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}

/** "Mover para…" de itens/notas, seções e snippets. */
export function MoveDialog({ target }: { target: MoveTarget }): ReactNode {
  const setModal = useStore((s) => s.setModal)
  const close = (): void => setModal(null)
  return (
    <Modal labelledBy="move-title" className="small-modal" onClose={close}>
      <div className="modal-box">
        {target.kind === 'entry' && <MoveEntry target={target} close={close} />}
        {target.kind === 'section' && <MoveSection target={target} close={close} />}
        {target.kind === 'snippet' && <MoveSnippet target={target} close={close} />}
      </div>
    </Modal>
  )
}

function Footer({ close, disabled, onConfirm }: { close: () => void; disabled: boolean; onConfirm: () => void }): ReactNode {
  return (
    <footer className="modal-footer">
      <button type="button" className="btn" onClick={close}>
        Cancelar
      </button>
      <button type="button" className="btn primary" disabled={disabled} onClick={onConfirm}>
        <FolderInput size={14} /> Mover
      </button>
    </footer>
  )
}

function MoveEntry({ target, close }: { target: Extract<MoveTarget, { kind: 'entry' }>; close: () => void }): ReactNode {
  const data = useStore((s) => s.data!)
  const moveEntryTo = useStore((s) => s.moveEntryTo)
  const { ref } = target
  const source = (ref.boardType === 'workspace' ? data.workspaces : data.libraries).find((b) => b.id === ref.boardId)
  const entry = source?.sections.find((s) => s.id === ref.sectionId)?.[ref.list].find((e) => e.id === ref.entryId)

  const [board, setBoard] = useState(boardValue(ref.boardType, ref.boardId))
  const dest = parseBoard(board)
  const destBoard = (dest.boardType === 'workspace' ? data.workspaces : data.libraries).find((b) => b.id === dest.boardId)
  const sections = destBoard?.sections ?? []
  // Sugere outra seção quando o destino é o mesmo espaço.
  const firstOther = sections.find((s) => s.id !== ref.sectionId) ?? sections[0]
  const [sectionId, setSectionId] = useState(firstOther?.id ?? '')
  const [list, setList] = useState<ListType>(ref.list)
  const validSection = sections.some((s) => s.id === sectionId) ? sectionId : (firstOther?.id ?? '')
  const same = dest.boardId === ref.boardId && validSection === ref.sectionId && list === ref.list

  return (
    <>
      <header className="modal-header">
        <h2 id="move-title">Mover “{entry?.title}”</h2>
        <p>Escolha o espaço ou biblioteca, a seção e a lista de destino.</p>
      </header>
      <div className="form-grid">
        <label>
          <span>Destino</span>
          <select
            id="move-board"
            value={board}
            onChange={(e) => {
              setBoard(e.target.value)
              setSectionId('')
            }}
          >
            <BoardOptions workspaces={data.workspaces} libraries={data.libraries} />
          </select>
        </label>
        <label>
          <span>Seção</span>
          <select id="move-section" value={validSection} onChange={(e) => setSectionId(e.target.value)} disabled={sections.length === 0}>
            {sections.length === 0 && <option value="">Sem seções</option>}
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {s.id === ref.sectionId && dest.boardId === ref.boardId ? ' (atual)' : ''}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="radio-row">
          <legend>Lista</legend>
          {(['checklist', 'notes'] as const).map((l) => (
            <label key={l}>
              <input type="radio" name="move-list" id={`move-list-${l}`} checked={list === l} onChange={() => setList(l)} />
              {l === 'checklist' ? 'Checklist' : 'Notas'}
            </label>
          ))}
        </fieldset>
        {list !== ref.list ? (
          <p className="form-note">
            {list === 'notes' ? 'Como nota, o item perde a marcação de concluído.' : 'No checklist, a nota começa como pendente.'}
          </p>
        ) : (
          list === 'checklist' &&
          dest.boardType === 'library' &&
          entry?.done && <p className="form-note">Em uma biblioteca o progresso não é guardado: o item fica pendente.</p>
        )}
      </div>
      <Footer
        close={close}
        disabled={!validSection || same}
        onConfirm={() => {
          moveEntryTo(ref, { ...dest, sectionId: validSection, list })
          close()
        }}
      />
    </>
  )
}

function MoveSection({ target, close }: { target: Extract<MoveTarget, { kind: 'section' }>; close: () => void }): ReactNode {
  const data = useStore((s) => s.data!)
  const moveSectionTo = useStore((s) => s.moveSectionTo)
  const others = (list: Board[], type: BoardType): Board[] =>
    list.filter((b) => !(type === target.boardType && b.id === target.boardId))
  const workspaces = others(data.workspaces, 'workspace')
  const libraries = others(data.libraries, 'library')
  const first = workspaces[0] ? boardValue('workspace', workspaces[0].id) : libraries[0] ? boardValue('library', libraries[0].id) : ''
  const [board, setBoard] = useState(first)
  const source = (target.boardType === 'workspace' ? data.workspaces : data.libraries).find((b) => b.id === target.boardId)
  const section = source?.sections.find((s) => s.id === target.sectionId)

  return (
    <>
      <header className="modal-header">
        <h2 id="move-title">Mover a seção “{section?.title}”</h2>
        <p>A seção vai com todos os itens e notas para o fim do destino.</p>
      </header>
      <div className="form-grid">
        {first ? (
          <label>
            <span>Destino</span>
            <select id="move-board" value={board} onChange={(e) => setBoard(e.target.value)}>
              <BoardOptions workspaces={workspaces} libraries={libraries} />
            </select>
          </label>
        ) : (
          <p className="form-note">Não há outro espaço ou biblioteca para onde mover. Crie um primeiro.</p>
        )}
        {board.startsWith('library:') && target.boardType === 'workspace' && (
          <p className="form-note">Em uma biblioteca o progresso não é guardado: os itens ficam pendentes.</p>
        )}
      </div>
      <Footer
        close={close}
        disabled={!board}
        onConfirm={() => {
          moveSectionTo({ boardType: target.boardType, boardId: target.boardId, sectionId: target.sectionId }, parseBoard(board))
          close()
        }}
      />
    </>
  )
}

function MoveSnippet({ target, close }: { target: Extract<MoveTarget, { kind: 'snippet' }>; close: () => void }): ReactNode {
  const groups = useStore((s) => s.data!.snippetGroups)
  const moveSnippetTo = useStore((s) => s.moveSnippetTo)
  const others = groups.filter((g) => g.id !== target.groupId)
  const [groupId, setGroupId] = useState(others[0]?.id ?? '')
  const item = groups.find((g) => g.id === target.groupId)?.items.find((i) => i.id === target.id)

  return (
    <>
      <header className="modal-header">
        <h2 id="move-title">Mover “{item?.title}”</h2>
        <p>Escolha o grupo de snippets de destino.</p>
      </header>
      <div className="form-grid">
        <label>
          <span>Grupo</span>
          <select id="move-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {others.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Footer
        close={close}
        disabled={!groupId}
        onConfirm={() => {
          moveSnippetTo(target.groupId, target.id, groupId)
          close()
        }}
      />
    </>
  )
}
