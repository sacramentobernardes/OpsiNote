import type { ReactNode } from 'react'
import { Folder, FolderKanban, GraduationCap, ListTodo, ShieldAlert } from 'lucide-react'
import type { Kind } from '../types'

const ICONS = {
  pentest: ShieldAlert,
  study: GraduationCap,
  project: FolderKanban,
  task: ListTodo,
  other: Folder
} satisfies Record<Kind, unknown>

export function KindIcon({ kind, size = 16 }: { kind: Kind; size?: number }): ReactNode {
  const Icon = ICONS[kind] ?? Folder
  return <Icon size={size} aria-hidden />
}
