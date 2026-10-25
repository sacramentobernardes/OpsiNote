import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import type { EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Image } from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import {
  Bold,
  Braces,
  Code,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  Rows3,
  SquareCode,
  Strikethrough,
  Table,
  Terminal,
  Trash,
  Underline,
  Undo2,
  Unlink
} from 'lucide-react'
import { cx } from '../lib/util'
import { remoteImagesToLinks } from '../lib/text'
import { slashTrigger, snippetText, type SlashTrigger, type SnippetMatch } from '../lib/snippets'
import type { SheetVariable } from '../lib/variables'
import { SnippetPicker, VariablePicker, useMissingToast, type SnippetPickerHandle } from './SnippetPicker'
import { SheetVar } from './SheetVarNode'

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

/** Grava a imagem como arquivo; se não der, embute no texto como antes. */
async function imageSrc(file: File): Promise<string> {
  try {
    const url = await window.api.saveAsset(new Uint8Array(await file.arrayBuffer()), file.type)
    if (url) return url
  } catch {
    // Segue para a versão embutida.
  }
  return readAsDataUrl(file)
}

function insertImages(view: EditorView, files: File[], pos?: number): void {
  for (const file of files) {
    imageSrc(file).then((src) => {
      const node = view.state.schema.nodes.image.create({ src, alt: file.name })
      const tr = pos === undefined ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(pos, node)
      view.dispatch(tr)
    })
  }
}

const imageFiles = (list: FileList | undefined | null): File[] =>
  Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))

type EditorTrigger = SlashTrigger & { from: number }

/** "s/" ou "/" logo antes do cursor (fora de blocos de código): onde começa e o que foi digitado depois. */
function editorTrigger(editor: Editor): EditorTrigger | null {
  const { selection } = editor.state
  const { $from } = selection
  if (!selection.empty || $from.parent.type.spec.code) return null
  const t = slashTrigger($from.parent.textBetween(0, $from.parentOffset, undefined, '￼'))
  return t && { ...t, from: selection.from - t.length }
}

export function RichEditor({
  content,
  onChange,
  placeholder = 'Escreva aqui… Digite / para uma variável da ficha ou s/ para um snippet.',
  snippetValues,
  variables = []
}: {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  /**
   * Valores da ficha: preenchem os snippets inseridos e as variáveis mostradas no texto.
   * Sem, as {{variáveis}} ficam como estão (modelos e bibliotecas).
   */
  snippetValues?: Record<string, string>
  /** Variáveis oferecidas pelo "/". */
  variables?: SheetVariable[]
}): ReactNode {
  // O callback muda a cada render; a ref evita recriar o editor.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const picker = useRef<SnippetPickerHandle>(null)
  const snippetButton = useRef<HTMLButtonElement>(null)
  const variableButton = useRef<HTMLButtonElement>(null)
  const [slash, setSlash] = useState<EditorTrigger | null>(null)
  // Menu aberto pelo botão da barra (com busca própria).
  const [searching, setSearching] = useState<'snippet' | 'variable' | null>(null)
  // "/" fechado com Esc: não reabre enquanto o cursor continuar nele.
  const dismissed = useRef<number | null>(null)
  const warnMissing = useMissingToast()

  const detectSlash = (e: Editor): void => {
    const found = e.isFocused ? editorTrigger(e) : null
    if (!found) dismissed.current = null
    const next = found && found.from !== dismissed.current ? found : null
    setSlash((prev) => (prev?.from === next?.from && prev?.query === next?.query && prev?.kind === next?.kind ? prev : next))
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder }),
      SheetVar
    ],
    // Notas antigas ou importadas podem ter imagens da internet: viram link ao abrir.
    content: remoteImagesToLinks(content),
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
    onTransaction: ({ editor }) => detectSlash(editor),
    onBlur: () => setSlash(null),
    editorProps: {
      // Com o menu do "/" aberto, setas, Enter e Esc vão para ele.
      handleKeyDown: (_view, event) => picker.current?.onKey(event) ?? false,
      // Colar (ou arrastar) HTML de um site não traz imagens remotas, só o link para elas.
      transformPastedHTML: remoteImagesToLinks,
      // Clique simples continua editando o texto; Ctrl+clique (Cmd no Mac) abre o link no navegador.
      handleClick: (_view, _pos, event) => {
        if (!event.ctrlKey && !event.metaKey) return false
        const link = (event.target as HTMLElement | null)?.closest('a')
        const href = link?.getAttribute('href')
        if (!href) return false
        window.open(href, '_blank')
        return true
      },
      handlePaste:(view, event) => {
        const files = imageFiles(event.clipboardData?.files)
        if (files.length === 0) return false
        insertImages(view, files)
        return true
      },
      handleDrop: (view, event) => {
        const files = imageFiles(event.dataTransfer?.files)
        if (files.length === 0) return false
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        insertImages(view, files, pos)
        return true
      }
    }
  })

  // As variáveis mostram o valor atual da ficha: ao mudar a ficha, todas se redesenham.
  // valuesKey resume snippetValues, que chega como um objeto novo a cada render.
  const valuesKey = JSON.stringify(snippetValues ?? {})
  useEffect(() => {
    const storage = editor.storage.sheetVar
    storage.values = JSON.parse(valuesKey) as Record<string, string>
    for (const paint of storage.views) paint()
  }, [editor, valuesKey])

  /** Entra como bloco de código; com `range`, substitui o "s/busca" digitado. */
  const insertSnippet = (match: SnippetMatch, range?: { from: number; to: number }): void => {
    const { text, missing } = snippetText(match.item.content, snippetValues)
    let chain = editor.chain().focus()
    if (range) chain = chain.deleteRange(range)
    chain.insertContent({ type: 'codeBlock', content: text ? [{ type: 'text', text }] : [] }).run()
    setSlash(null)
    setSearching(null)
    warnMissing(missing)
  }

  /** Entra como variável viva (acompanha a ficha); com `range`, substitui o "/busca" digitado. */
  const insertVariable = (v: SheetVariable, range?: { from: number; to: number }): void => {
    let chain = editor.chain().focus()
    if (range) chain = chain.deleteRange(range)
    chain.insertContent({ type: 'sheetVar', attrs: { key: v.key } }).run()
    setSlash(null)
    setSearching(null)
  }

  const closeSearch = (via: 'key' | 'click'): void => {
    setSearching(null)
    if (via === 'key') editor.commands.focus()
  }
  const closeSlash = (): void => {
    if (slash) dismissed.current = slash.from
    setSlash(null)
  }
  const slashRange = (from: number): { from: number; to: number } => ({ from, to: editor.state.selection.from })

  return (
    <div className="rich-editor">
      <Toolbar
        editor={editor}
        snippetButton={snippetButton}
        variableButton={variableButton}
        open={searching}
        onOpen={(kind) => {
          setSlash(null)
          setSearching((v) => (v === kind ? null : kind))
        }}
      />
      <EditorContent editor={editor} className="editor-content" />
      {searching === 'snippet' ? (
        <SnippetPicker
          anchor={() => snippetButton.current?.getBoundingClientRect()}
          trigger={snippetButton}
          onPick={(m) => insertSnippet(m)}
          onClose={closeSearch}
        />
      ) : searching === 'variable' ? (
        <VariablePicker
          variables={variables}
          anchor={() => variableButton.current?.getBoundingClientRect()}
          trigger={variableButton}
          onPick={(v) => insertVariable(v)}
          onClose={closeSearch}
        />
      ) : slash?.kind === 'snippet' ? (
        <SnippetPicker
          ref={picker}
          query={slash.query}
          anchor={() => editor.view.coordsAtPos(slash.from)}
          onPick={(m) => insertSnippet(m, slashRange(slash.from))}
          onClose={closeSlash}
        />
      ) : (
        slash?.kind === 'variable' && (
          <VariablePicker
            ref={picker}
            variables={variables}
            query={slash.query}
            anchor={() => editor.view.coordsAtPos(slash.from)}
            onPick={(v) => insertVariable(v, slashRange(slash.from))}
            onClose={closeSlash}
          />
        )
      )}
    </div>
  )
}

function Toolbar({
  editor,
  snippetButton,
  variableButton,
  open,
  onOpen
}: {
  editor: Editor
  snippetButton: RefObject<HTMLButtonElement | null>
  variableButton: RefObject<HTMLButtonElement | null>
  open: 'snippet' | 'variable' | null
  onOpen: (kind: 'snippet' | 'variable') => void
}): ReactNode {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo()
    })
  })
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const chain = () => editor.chain().focus()

  const openLink = (): void => {
    setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? 'https://')
    setLinkOpen(true)
  }
  const applyLink = (): void => {
    const url = linkUrl.trim()
    if (!url || url === 'https://') chain().extendMarkRange('link').unsetLink().run()
    else chain().extendMarkRange('link').setLink({ href: url }).run()
    setLinkOpen(false)
  }

  const btn = (
    label: string,
    icon: ReactNode,
    active: boolean,
    onClick: (e: MouseEvent<HTMLButtonElement>) => void,
    disabled = false,
    ref?: RefObject<HTMLButtonElement | null>
  ): ReactNode => (
    <button
      ref={ref}
      type="button"
      className={cx('tool-btn', active && 'active')}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </button>
  )

  const size = 16
  return (
    <div className="toolbar">
      {btn('Desfazer (Ctrl+Z)', <Undo2 size={size} />, false, () => chain().undo().run(), !state.canUndo)}
      {btn('Refazer (Ctrl+Y)', <Redo2 size={size} />, false, () => chain().redo().run(), !state.canRedo)}
      <span className="tool-sep" />
      {btn('Título 1', <Heading1 size={size} />, state.h1, () => chain().toggleHeading({ level: 1 }).run())}
      {btn('Título 2', <Heading2 size={size} />, state.h2, () => chain().toggleHeading({ level: 2 }).run())}
      {btn('Título 3', <Heading3 size={size} />, state.h3, () => chain().toggleHeading({ level: 3 }).run())}
      <span className="tool-sep" />
      {btn('Negrito (Ctrl+B)', <Bold size={size} />, state.bold, () => chain().toggleBold().run())}
      {btn('Itálico (Ctrl+I)', <Italic size={size} />, state.italic, () => chain().toggleItalic().run())}
      {btn('Sublinhado (Ctrl+U)', <Underline size={size} />, state.underline, () => chain().toggleUnderline().run())}
      {btn('Tachado', <Strikethrough size={size} />, state.strike, () => chain().toggleStrike().run())}
      {btn('Código', <Code size={size} />, state.code, () => chain().toggleCode().run())}
      <span className="tool-sep" />
      {btn('Lista', <List size={size} />, state.bullet, () => chain().toggleBulletList().run())}
      {btn('Lista numerada', <ListOrdered size={size} />, state.ordered, () => chain().toggleOrderedList().run())}
      {btn('Lista de tarefas', <ListChecks size={size} />, state.task, () => chain().toggleTaskList().run())}
      {btn('Citação', <Quote size={size} />, state.quote, () => chain().toggleBlockquote().run())}
      {btn('Bloco de código', <SquareCode size={size} />, state.codeBlock, () => chain().toggleCodeBlock().run())}
      <span className="tool-sep" />
      {btn('Link (Ctrl+clique no link para abrir)', <Link size={size} />, state.link, openLink)}
      {state.link && btn('Remover link', <Unlink size={size} />, false, () => chain().extendMarkRange('link').unsetLink().run())}
      {btn('Imagem', <ImageIcon size={size} />, false, () => fileInput.current?.click())}
      {btn('Tabela', <Table size={size} />, state.table, () =>
        chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      )}
      {btn('Inserir variável da ficha (ou digite /)', <Braces size={size} />, open === 'variable', () => onOpen('variable'), false, variableButton)}
      {btn('Inserir snippet (ou digite s/)', <Terminal size={size} />, open === 'snippet', () => onOpen('snippet'), false, snippetButton)}
      {state.table && (
        <>
          {btn('Adicionar linha', <Rows3 size={size} />, false, () => chain().addRowAfter().run())}
          {btn('Adicionar coluna', <Columns3 size={size} />, false, () => chain().addColumnAfter().run())}
          {btn('Excluir tabela', <Trash size={size} />, false, () => chain().deleteTable().run())}
        </>
      )}

      {linkOpen && (
        <div className="link-input">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyLink()
              if (e.key === 'Escape') setLinkOpen(false)
            }}
            onBlur={() => setLinkOpen(false)}
            placeholder="https://"
          />
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const files = imageFiles(e.target.files)
          if (editor.view && files.length) insertImages(editor.view, files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
