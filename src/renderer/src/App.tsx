import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useStore } from './store'
import { createSeedData } from './lib/seed'
import { GraphView } from './components/GraphView'
import { FocusTimerPill, useFocusTimerWatcher } from './components/FocusTimer'
import { textOn } from './lib/appearance'
import { normalizeData } from './lib/importData'
import { buildIndex } from './lib/search'
import { Rail } from './components/Rail'
import { BoardView } from './components/BoardView'
import { TemplatesView } from './components/TemplatesView'
import { SnippetsView } from './components/SnippetsView'
import { HomeView } from './components/HomeView'
import { LibrariesView } from './components/LibrariesView'
import { TrashView } from './components/TrashView'
import { SettingsView } from './components/SettingsView'
import { CommandPalette } from './components/CommandPalette'
import { MoveDialog } from './components/MoveDialog'
import { ExportDialog } from './components/ExportDialog'
import { ShortcutsDialog, useShortcuts } from './components/Shortcuts'
import { Toast, commitPendingEdits } from './components/ui'
import { cx } from './lib/util'
import { Minimize2, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { ErrorBoundary } from './components/ErrorBoundary'
import type { View } from './types'

type SaveResult = Awaited<ReturnType<Window['api']['saveData']>>

const SAVE_DELAY_MS = 400
/** Enquanto a gravação falhar, tenta de novo sozinho neste intervalo. */
const RETRY_MS = 10_000

interface Persistence {
  /** Erro ao carregar: o app não abre. */
  error: string | null
  /** Última gravação falhou; as alterações estão só na memória. */
  saveError: string | null
  retrySave: () => void
}

/** Carrega os dados uma vez e salva automaticamente a cada alteração. */
function usePersistence(): Persistence {
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const retryRef = useRef<() => void>(() => {})

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    // Só marca que há mudança; o JSON é montado na hora de gravar, não a cada tecla.
    let dirty = false
    let failing = false
    let unsubscribe = (): void => {}
    let cancelled = false

    const pendingJson = (): string | null => {
      const data = useStore.getState().data
      if (!dirty || !data) return null
      dirty = false
      return JSON.stringify(data)
    }

    const handleResult = (result: SaveResult): void => {
      if (result.ok) {
        if (failing) {
          failing = false
          clearTimeout(retryTimer)
          setSaveError(null)
          useStore.getState().showToast('Alterações salvas')
        }
        return
      }
      // Continua pendente: a próxima tentativa grava tudo de novo.
      dirty = true
      failing = true
      setSaveError(result.error)
      clearTimeout(retryTimer)
      retryTimer = setTimeout(save, RETRY_MS)
    }

    const save = (): void => {
      clearTimeout(timer)
      const json = pendingJson()
      if (json === null) return
      window.api.saveData(json).then(handleResult, (err: Error) => handleResult({ ok: false, error: err.message }))
    }
    retryRef.current = save

    const flush = (event?: BeforeUnloadEvent): void => {
      clearTimeout(timer)
      clearTimeout(retryTimer)
      commitPendingEdits()
      const json = pendingJson()
      if (json === null) return
      const result = window.api.saveDataSync(json)
      if (!result.ok) {
        dirty = true
        failing = true
        setSaveError(result.error)
        // Cancela o fechamento; o processo principal pergunta se a pessoa quer fechar mesmo assim.
        if (event) {
          event.preventDefault()
          event.returnValue = ''
        }
      }
    }

    window.api
      .loadData()
      .then((raw) => {
        if (cancelled) return
        const data = raw === null ? createSeedData() : normalizeData(raw)
        if (!data) {
          // Arquivo existe mas não é de um formato conhecido (ex.: de uma versão mais nova do app).
          // Não carrega os exemplos no lugar, senão o salvamento automático apagaria os dados.
          const version = typeof raw === 'object' && raw && 'version' in raw ? String((raw as { version: unknown }).version) : null
          setError(
            version
              ? `O arquivo de dados está em um formato que esta versão não reconhece (versão ${version}). ` +
                  'Nada foi alterado. Atualize o OpsiNote ou restaure um backup.'
              : 'O arquivo de dados não está no formato do OpsiNote. Nada foi alterado. Restaure um backup.'
          )
          return
        }
        useStore.getState().load(data)
        // Monta o índice da busca com o app ocioso: o primeiro Ctrl+K abre sem travar.
        requestIdleCallback(() => buildIndex(data), { timeout: 5000 })
        if (raw === null) {
          dirty = true
          save()
        }

        unsubscribe = useStore.subscribe((state, prev) => {
          if (!state.data || state.data === prev.data) return
          dirty = true
          clearTimeout(timer)
          timer = setTimeout(save, SAVE_DELAY_MS)
        })
      })
      .catch((err: Error) => setError(err.message))

    window.addEventListener('beforeunload', flush)
    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', flush)
      unsubscribe()
      flush()
    }
  }, [])

  return { error, saveError, retrySave: () => retryRef.current() }
}

/** Aparência personalizada: atributos e variáveis no <html>, lidos pelo CSS. */
function useAppearance(): void {
  const appearance = useStore((s) => s.data?.settings.appearance)
  useEffect(() => {
    const root = document.documentElement
    root.dataset.density = appearance?.density ?? 'comfortable'
    root.dataset.cards = appearance?.cards ?? 'bordered'
    root.dataset.radius = appearance?.radius ?? 'medium'
    if (appearance?.accent) {
      root.dataset.accent = 'custom'
      root.style.setProperty('--user-accent', appearance.accent)
      root.style.setProperty('--user-accent-text', textOn(appearance.accent))
    } else {
      delete root.dataset.accent
      root.style.removeProperty('--user-accent')
      root.style.removeProperty('--user-accent-text')
    }
  }, [appearance])
}

function useTheme(): void {
  const theme = useStore((s) => s.data?.settings.theme ?? 'system')
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

export function App(): ReactNode {
  const { error, saveError, retrySave } = usePersistence()
  const open = useStore((s) => s.open)
  useTheme()
  useAppearance()
  useShortcuts()
  useFocusTimerWatcher()
  const loaded = useStore((s) => s.data !== null)
  const view = useStore((s) => s.view)
  const hasEntry = useStore((s) => s.entryId !== null || s.sheetOpen)
  const focusMode = useStore((s) => s.focusMode)
  const toggleFocus = useStore((s) => s.toggleFocus)
  const railExpanded = useStore((s) => s.railExpanded)
  const railWidth = useStore((s) => s.railWidth)
  const panelWidth = useStore((s) => s.panelWidth)
  const toggleRail = useStore((s) => s.toggleRail)

  if (error) {
    return (
      <div className="fatal">
        <h1>Não foi possível carregar seus dados</h1>
        <p>{error}</p>
      </div>
    )
  }
  if (!loaded) return <div className="loading">Carregando…</div>

  let main: ReactNode
  switch (view.type) {
    case 'workspace':
    case 'library':
      main = <BoardView />
      break
    case 'graph':
      main = <GraphView />
      break
    case 'libraries':
      main = <LibrariesView />
      break
    case 'templates':
      main = <TemplatesView />
      break
    case 'snippets':
      main = <SnippetsView />
      break
    case 'trash':
      main = <TrashView />
      break
    case 'settings':
      main = <SettingsView />
      break
    default:
      main = <HomeView />
  }

  // Início, Bibliotecas, Lixeira, Grafo e Configurações ocupam a área toda; as demais visões têm painel + documento.
  const noPanel = view.type === 'home' || view.type === 'libraries' || view.type === 'trash' || view.type === 'settings' || view.type === 'graph'

  // Larguras escolhidas arrastando as bordas; sem elas, valem os padrões do CSS.
  const sizes = {
    ...(railWidth !== null && { '--rail-expanded-w': `${railWidth}px` }),
    ...(panelWidth !== null && { '--panel-w': `${panelWidth}px` })
  } as CSSProperties

  return (
    <div
      className={cx(
        'layout',
        noPanel && 'no-panel',
        hasEntry && 'has-entry',
        railExpanded && 'rail-expanded',
        focusMode && 'focus-mode'
      )}
      style={sizes}
    >
      <Rail />
      {/* Em janelas estreitas o trilho expandido fica por cima do conteúdo; clicar fora recolhe. */}
      {railExpanded && <div className="rail-backdrop" onClick={toggleRail} />}
      <ErrorBoundary scope="view" resetKey={viewKey(view)} onGoHome={() => open({ type: 'home' })}>
        {main}
      </ErrorBoundary>
      {focusMode && (
        <button type="button" className="focus-exit" onClick={() => toggleFocus(false)}>
          <Minimize2 size={14} /> Sair do modo foco <kbd>Esc</kbd>
        </button>
      )}
      <ModalHost />
      <UpdateBanner />
      {saveError && <SaveErrorBanner message={saveError} onRetry={retrySave} />}
      <FocusTimerPill />
      <Toast />
    </div>
  )
}

/** Renderiza a janela aberta no momento (uma por vez). */
function ModalHost(): ReactNode {
  const modal = useStore((s) => s.modal)
  const setModal = useStore((s) => s.setModal)
  if (!modal) return null
  switch (modal.type) {
    case 'palette':
      return <CommandPalette />
    case 'shortcuts':
      return <ShortcutsDialog />
    case 'export':
      return <ExportDialog only={modal.only} onClose={() => setModal(null)} />
    case 'move':
      return <MoveDialog target={modal.target} />
  }
}

const viewKey = (v: View): string => ('id' in v ? `${v.type}:${v.id}` : v.type)

/** Fica visível enquanto as alterações não conseguem ser gravadas no disco. */
function SaveErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }): ReactNode {
  return (
    <div className="save-error-banner" role="alert">
      <TriangleAlert size={16} />
      <span>
        <strong>Não foi possível salvar</strong> ({message}). Suas alterações continuam aqui; o app tenta de novo sozinho.
      </span>
      <button type="button" className="btn small" onClick={onRetry}>
        Tentar agora
      </button>
    </div>
  )
}

/** Aparece quando uma atualização já foi baixada e só falta reiniciar. */
function UpdateBanner(): ReactNode {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => window.api.onUpdateReady(setVersion), [])
  if (!version) return null
  return (
    <div className="update-banner" role="status">
      <RefreshCw size={15} />
      <span>A versão {version} está pronta.</span>
      <button type="button" className="btn small primary" onClick={() => void window.api.installUpdate()}>
        Reiniciar e atualizar
      </button>
      <button type="button" className="icon-btn" aria-label="Depois" title="Depois (instala ao fechar o app)" onClick={() => setVersion(null)}>
        <X size={14} />
      </button>
    </div>
  )
}
