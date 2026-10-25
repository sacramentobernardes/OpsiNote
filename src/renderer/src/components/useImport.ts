import { useStore } from '../store'
import type { ImportResult } from '../lib/importData'
import { importTotal, parseImportFile } from '../lib/importFormats'

/**
 * Abre o seletor de arquivos (backup .json, HTML, Markdown, CSV ou texto; um ou vários)
 * e acrescenta o conteúdo aos dados atuais. Um arquivo com problema não impede os outros.
 */
export function useImport(): () => Promise<void> {
  const importData = useStore((s) => s.importData)
  const showToast = useStore((s) => s.showToast)
  return async () => {
    const files = await window.api.importFile()
    if (files === null) return
    const merged: ImportResult = { workspaces: [], libraries: [], templates: [], snippetGroups: [] }
    const errors: string[] = []
    for (const file of files) {
      if ('error' in file) {
        errors.push(`${file.name}: ${file.error}`)
        continue
      }
      try {
        const r = parseImportFile(file.name, file.text)
        merged.workspaces.push(...r.workspaces)
        merged.libraries.push(...r.libraries)
        merged.templates.push(...r.templates)
        merged.snippetGroups.push(...r.snippetGroups)
      } catch (err) {
        errors.push(files.length > 1 ? `${file.name}: ${(err as Error).message}` : (err as Error).message)
      }
    }
    const total = importTotal(merged)
    if (total > 0) importData(merged)
    const done = total > 0 ? `${total} ${total === 1 ? 'item importado' : 'itens importados'}` : ''
    if (errors.length === 0) showToast(done)
    else if (!done) showToast(errors.join(' · '))
    else showToast(`${done}. Não deu para ler: ${errors.join(' · ')}`)
  }
}
