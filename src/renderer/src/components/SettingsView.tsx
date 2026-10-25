import { useEffect, useState, type ReactNode } from 'react'
import {
  CircleHelp,
  Database,
  Download,
  FolderOpen,
  Info,
  Keyboard,
  Monitor,
  Moon,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload
} from 'lucide-react'
import { useBinding, useStore } from '../store'
import type { SettingsTab, Theme } from '../types'
import { cx } from '../lib/util'
import { comboHint } from '../lib/shortcuts'
import {
  ACCENTS,
  CARD_LABELS,
  CARD_STYLES,
  DEFAULT_ACCENT,
  DENSITIES,
  DENSITY_LABELS,
  RADII,
  RADIUS_LABELS
} from '../lib/appearance'
import { TRASH_DAYS } from '../lib/trash'
import { Logo } from './Logo'
import { ShortcutList } from './Shortcuts'
import { HelpGuide } from './HelpGuide'
import { useImport } from './useImport'

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'Geral', icon: <SlidersHorizontal size={16} /> },
  { id: 'data', label: 'Dados e backup', icon: <Database size={16} /> },
  { id: 'shortcuts', label: 'Atalhos', icon: <Keyboard size={16} /> },
  { id: 'help', label: 'Ajuda', icon: <CircleHelp size={16} /> },
  { id: 'about', label: 'Sobre', icon: <Info size={16} /> }
]

const THEMES: { id: Theme; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'system', label: 'Sistema', hint: 'Segue o Windows', icon: <Monitor size={18} /> },
  { id: 'light', label: 'Claro', hint: 'Sempre claro', icon: <Sun size={18} /> },
  { id: 'dark', label: 'Escuro', hint: 'Sempre escuro', icon: <Moon size={18} /> }
]

type AppInfo = Awaited<ReturnType<Window['api']['appInfo']>>

/** Versão e caminho do arquivo de dados, vindos do processo principal. */
function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    window.api.appInfo().then(setInfo, () => setInfo(null))
  }, [])
  return info
}

/** Configurações do app, com abas para dados, atalhos, ajuda e sobre. */
export function SettingsView(): ReactNode {
  const view = useStore((s) => s.view)
  const open = useStore((s) => s.open)
  const tab: SettingsTab = (view.type === 'settings' && view.tab) || 'general'

  return (
    <main className="hub settings">
      <div className="settings-inner">
        <nav className="settings-tabs" aria-label="Seções das configurações">
          <h1>Configurações</h1>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cx('settings-tab', tab === t.id && 'active')}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => open({ type: 'settings', tab: t.id })}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'general' && <GeneralTab />}
          {tab === 'data' && <DataTab />}
          {tab === 'shortcuts' && <ShortcutsTab />}
          {tab === 'help' && <HelpGuide />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </main>
  )
}

function SettingsGroup({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <section className="settings-group">
      <header>
        <h2>{title}</h2>
        {hint && <p className="muted">{hint}</p>}
      </header>
      {children}
    </section>
  )
}

function GeneralTab(): ReactNode {
  const theme = useStore((s) => s.data!.settings.theme)
  const setTheme = useStore((s) => s.setTheme)
  const railExpanded = useStore((s) => s.railExpanded)
  const toggleRail = useStore((s) => s.toggleRail)
  const customWidths = useStore((s) => s.railWidth !== null || s.panelWidth !== null)
  const setRailWidth = useStore((s) => s.setRailWidth)
  const setPanelWidth = useStore((s) => s.setPanelWidth)
  const workspaces = useStore((s) => s.data!.workspaces)
  const snippetContextId = useStore((s) => s.snippetContextId)
  const setSnippetContext = useStore((s) => s.setSnippetContext)
  const showToast = useStore((s) => s.showToast)
  const railKeys = useBinding('toggleRail')

  return (
    <>
      <header className="settings-head">
        <h2>Geral</h2>
        <p className="muted">Aparência e comportamento do app. Tudo é aplicado na hora.</p>
      </header>

      <SettingsGroup title="Tema">
        <div className="theme-options" role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              className={cx('theme-option', theme === t.id && 'active')}
              onClick={() => setTheme(t.id)}
            >
              <span className={cx('theme-swatch', t.id)}>{t.icon}</span>
              <strong>{t.label}</strong>
              <span className="muted small">{t.hint}</span>
            </button>
          ))}
        </div>
      </SettingsGroup>

      <AppearanceGroup />

      <SettingsGroup title="Menu lateral">
        <label className="settings-row">
          <span>
            <strong>Menu expandido</strong>
            <span className="muted small">Mostra os nomes ao lado dos ícones.{railKeys && ` Também com ${comboHint(railKeys)}.`}</span>
          </span>
          <input type="checkbox" className="switch" checked={railExpanded} onChange={toggleRail} />
        </label>
        <div className="settings-row">
          <span>
            <strong>Larguras do menu e do painel</strong>
            <span className="muted small">
              {customWidths ? 'Você ajustou arrastando as bordas.' : 'Usando as larguras padrão. Arraste as bordas para ajustar.'}
            </span>
          </span>
          <button
            type="button"
            className="btn small"
            disabled={!customWidths}
            onClick={() => {
              setRailWidth(null)
              setPanelWidth(null)
              showToast('Larguras restauradas')
            }}
          >
            Restaurar padrão
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Snippets" hint="De onde vêm os valores das {{variáveis}} ao copiar um snippet pela tela de Snippets.">
        <label className="settings-row">
          <span>
            <strong>Preencher com a ficha de</strong>
            <span className="muted small">Nas notas, o snippet inserido com s/ e as variáveis inseridas com / sempre usam a ficha do próprio espaço.</span>
          </span>
          <select value={snippetContextId ?? ''} onChange={(e) => setSnippetContext(e.target.value || null)}>
            <option value="">Último espaço aberto</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </label>
      </SettingsGroup>
    </>
  )
}

/** Uma escolha entre opções de texto (densidade, cartões, cantos). */
function ChoiceRow<T extends string>({
  label,
  options,
  labels,
  value,
  onChange
}: {
  label: string
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onChange: (v: T) => void
}): ReactNode {
  return (
    <div className="appearance-row">
      <strong>{label}</strong>
      <div className="appearance-choices" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            className={cx('appearance-choice', value === o && 'active')}
            onClick={() => onChange(o)}
          >
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Cor de destaque, densidade, cartões e cantos. Tudo aplicado na hora. */
function AppearanceGroup(): ReactNode {
  const appearance = useStore((s) => s.data!.settings.appearance)
  const setAppearance = useStore((s) => s.setAppearance)
  const resetAppearance = useStore((s) => s.resetAppearance)
  const accent = appearance?.accent ?? DEFAULT_ACCENT
  const isPreset = ACCENTS.some((a) => a.color === accent)

  return (
    <SettingsGroup title="Aparência" hint="Personalize a cor de destaque, o espaçamento e o jeito dos cartões. Vale para o tema claro e o escuro.">
      <div className="appearance-row">
        <strong>Cor de destaque</strong>
        <div className="accent-swatches" role="radiogroup" aria-label="Cor de destaque">
          {ACCENTS.map((a) => (
            <button
              key={a.color}
              type="button"
              role="radio"
              aria-checked={accent === a.color}
              aria-label={a.name}
              title={a.name}
              className={cx('accent-swatch', accent === a.color && 'active')}
              style={{ background: a.color }}
              onClick={() => setAppearance({ accent: a.color })}
            />
          ))}
          <label className="accent-custom" title="Escolher qualquer cor">
            <input
              type="color"
              value={accent}
              aria-label="Outra cor de destaque"
              className={cx(!isPreset && 'active')}
              onChange={(e) => setAppearance({ accent: e.target.value })}
            />
            {isPreset ? 'Outra…' : accent}
          </label>
        </div>
      </div>
      <ChoiceRow
        label="Densidade"
        options={DENSITIES}
        labels={DENSITY_LABELS}
        value={appearance?.density ?? 'comfortable'}
        onChange={(v) => setAppearance({ density: v })}
      />
      <ChoiceRow
        label="Cartões"
        options={CARD_STYLES}
        labels={CARD_LABELS}
        value={appearance?.cards ?? 'bordered'}
        onChange={(v) => setAppearance({ cards: v })}
      />
      <ChoiceRow label="Cantos" options={RADII} labels={RADIUS_LABELS} value={appearance?.radius ?? 'medium'} onChange={(v) => setAppearance({ radius: v })} />
      <div className="settings-actions">
        <button type="button" className="btn small" disabled={!appearance} onClick={resetAppearance}>
          <RotateCcw size={14} /> Restaurar aparência padrão
        </button>
      </div>
    </SettingsGroup>
  )
}

function DataTab(): ReactNode {
  const info = useAppInfo()
  const setModal = useStore((s) => s.setModal)
  const open = useStore((s) => s.open)
  const trashCount = useStore((s) => s.data!.trash.length)
  const runImport = useImport()

  return (
    <>
      <header className="settings-head">
        <h2>Dados e backup</h2>
        <p className="muted">Tudo fica no seu computador e é salvo sozinho a cada alteração. Nada é enviado para a internet.</p>
      </header>

      <SettingsGroup title="Arquivo de dados" hint="A cada gravação, a versão anterior é guardada como cópia .bak ao lado.">
        <div className="settings-row">
          <code className="settings-path">{info?.dataFile ?? '%APPDATA%\\OpsiNote\\opsinote-data.json'}</code>
          <button type="button" className="btn small" onClick={() => void window.api.openDataFolder()}>
            <FolderOpen size={14} /> Abrir pasta
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Exportar e importar"
        hint="Exporte como backup do OpsiNote (.json), página HTML, Markdown, planilha CSV ou texto simples. Importar aceita esses mesmos formatos, inclusive vários arquivos de uma vez (como notas do Obsidian), e acrescenta o conteúdo ao que já existe, sem apagar nada."
      >
        <div className="settings-actions">
          <button type="button" className="btn primary" onClick={() => setModal({ type: 'export' })}>
            <Upload size={14} /> Exportar…
          </button>
          <button type="button" className="btn" onClick={() => void runImport()}>
            <Download size={14} /> Importar arquivos…
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Lixeira" hint={`O que você exclui fica na lixeira por ${TRASH_DAYS} dias e pode ser restaurado.`}>
        <div className="settings-row">
          <span>
            <strong>{trashCount === 0 ? 'Lixeira vazia' : `${trashCount} ${trashCount === 1 ? 'item' : 'itens'} na lixeira`}</strong>
          </span>
          <button type="button" className="btn small" onClick={() => open({ type: 'trash' })}>
            <Trash2 size={14} /> Abrir lixeira
          </button>
        </div>
      </SettingsGroup>
    </>
  )
}

function ShortcutsTab(): ReactNode {
  const customized = useStore((s) => Object.keys(s.data!.settings.shortcuts ?? {}).length)
  const resetShortcuts = useStore((s) => s.resetShortcuts)
  const showToast = useStore((s) => s.showToast)
  const listKeys = useBinding('shortcuts')
  return (
    <>
      <header className="settings-head">
        <h2>Atalhos de teclado</h2>
        <p className="muted">
          Clique num atalho e pressione a nova combinação; <kbd>Esc</kbd> cancela. Duas ações nunca ficam com a mesma combinação, e as
          teclas que o editor e o sistema já usam (como Ctrl+C e Ctrl+Z) não podem ser escolhidas.
          {listKeys && ` A lista também abre com ${comboHint(listKeys)} de qualquer lugar.`} No Mac, use Cmd no lugar de Ctrl.
        </p>
      </header>
      <div className="settings-shortcuts">
        <ShortcutList editable />
      </div>
      <div className="settings-actions">
        <button
          type="button"
          className="btn"
          disabled={customized === 0}
          onClick={() => {
            resetShortcuts()
            showToast('Atalhos restaurados para o padrão')
          }}
        >
          <RotateCcw size={14} /> Restaurar todos os padrões
        </button>
        {customized > 0 && <span className="muted small">{customized === 1 ? '1 atalho personalizado' : `${customized} atalhos personalizados`}</span>}
      </div>
    </>
  )
}

function AboutTab(): ReactNode {
  const info = useAppInfo()
  const open = useStore((s) => s.open)
  return (
    <>
      <div className="about">
        <Logo size={56} />
        <div>
          <h2>OpsiNote</h2>
          <p className="muted">{info ? `Versão ${info.version}` : 'Versão…'}</p>
        </div>
      </div>
      <p>Notas, checklists e acompanhamento de alvos de pentest, estudos, projetos e tarefas. Funciona offline, com tudo salvo no seu computador.</p>
      <p className="muted">
        Software livre sob a licença GPL-3.0. Quando uma versão nova estiver disponível, o app baixa sozinho e avisa para reiniciar.
      </p>
      <div className="settings-actions">
        <button type="button" className="btn" onClick={() => open({ type: 'settings', tab: 'help' })}>
          <CircleHelp size={14} /> Como usar
        </button>
      </div>
    </>
  )
}
