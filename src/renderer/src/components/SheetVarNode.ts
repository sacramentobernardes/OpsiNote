import { Node, mergeAttributes } from '@tiptap/react'
import { varKey } from '../lib/variables'

/**
 * Variável da ficha dentro de uma nota ou item: `<span data-var="ip">{{ip}}</span>`.
 *
 * O HTML guarda só a chave, então mudar o valor na ficha muda o texto em todas as notas.
 * Na tela aparece o valor atual (ou {{ip}} quando a ficha não tem valor); fora do app
 * (exportação, busca) fica {{ip}}, como nos snippets.
 */
export interface SheetVarStorage {
  /** Valores da ficha do espaço aberto, por chave normalizada; vazio nos modelos e bibliotecas. */
  values: Record<string, string>
  /** Funções que redesenham cada variável na tela quando os valores mudam. */
  views: Set<() => void>
}

declare module '@tiptap/core' {
  interface Storage {
    sheetVar: SheetVarStorage
  }
}

export const SheetVar = Node.create<Record<string, never>, SheetVarStorage>({
  name: 'sheetVar',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addStorage() {
    return { values: {}, views: new Set() }
  },

  addAttributes() {
    return {
      key: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-var') ?? '',
        renderHTML: (attrs) => ({ 'data-var': attrs.key })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-var]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'sheet-var' }), `{{${node.attrs.key}}}`]
  },

  // Copiar como texto leva o valor, como aparece na tela.
  renderText({ node }) {
    const key = node.attrs.key as string
    return this.storage.values[varKey(key)] || `{{${key}}}`
  },

  addNodeView() {
    const storage = this.storage
    return ({ node }) => {
      let current = node
      const dom = document.createElement('span')
      const paint = (): void => {
        const key = current.attrs.key as string
        const value = storage.values[varKey(key)]
        dom.textContent = value || `{{${key}}}`
        dom.className = value ? 'sheet-var' : 'sheet-var missing'
        dom.title = value ? `{{${key}}} da ficha` : `{{${key}}} sem valor na ficha deste espaço`
      }
      paint()
      storage.views.add(paint)
      return {
        dom,
        update: (next) => {
          if (next.type !== current.type) return false
          current = next
          paint()
          return true
        },
        destroy: () => storage.views.delete(paint)
      }
    }
  }
})
