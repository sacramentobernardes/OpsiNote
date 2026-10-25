import type { ReactNode } from 'react'

/** Marca do OpsiNote: uma nota com canto dobrado e um item de checklist. */
export function Logo({ size = 28 }: { size?: number }): ReactNode {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M10 6.5h8.5l5.5 5.5v12.5a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-16a2 2 0 0 1 2-2z"
        fill="var(--accent-text)"
      />
      <path d="M18.5 6.5V11a1 1 0 0 0 1 1H24z" fill="var(--accent)" opacity="0.45" />
      <circle cx="12.5" cy="17" r="2" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
      <path d="M16.5 17h4M11 21.5h9.5" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
