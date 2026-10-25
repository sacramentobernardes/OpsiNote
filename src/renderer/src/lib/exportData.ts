import type { AppData, Board } from '../types'

export interface ExportSelection {
  workspaces: Set<string>
  libraries: Set<string>
  templates: Set<string>
  snippetGroups: Set<string>
}

/**
 * Monta o arquivo só com o que foi marcado. O formato é o mesmo do backup completo,
 * sem a lixeira (que é local de cada instalação).
 */
export function buildExport(data: AppData, sel: ExportSelection, resetChecklists: boolean): AppData {
  const reset = (b: Board): Board =>
    resetChecklists
      ? { ...b, sections: b.sections.map((s) => ({ ...s, checklist: s.checklist.map((e) => ({ ...e, done: false })) })) }
      : b
  return {
    version: 1,
    workspaces: data.workspaces.filter((b) => sel.workspaces.has(b.id)).map(reset),
    libraries: data.libraries.filter((b) => sel.libraries.has(b.id)).map(reset),
    templates: data.templates.filter((t) => sel.templates.has(t.id)),
    snippetGroups: data.snippetGroups.filter((g) => sel.snippetGroups.has(g.id)),
    trash: [],
    settings: data.settings
  }
}
