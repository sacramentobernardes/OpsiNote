import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'

interface Props {
  /** Mudar esta chave limpa o erro (ex.: ao navegar para outra tela). */
  resetKey?: string
  /** Tela inteira (sem trilho) ou só a área de conteúdo. */
  scope: 'app' | 'view'
  onGoHome?: () => void
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Impede que um erro em uma tela deixe o app inteiro em branco. Mostra o que houve
 * e oferece um caminho de volta; os dados não são alterados.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erro na interface', error, info.componentStack)
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    const isApp = this.props.scope === 'app'
    return (
      <main className={isApp ? 'fatal' : 'doc doc-empty view-error'} role="alert">
        <div className="error-box">
          <TriangleAlert size={28} />
          <h1>{isApp ? 'O OpsiNote encontrou um erro' : 'Não foi possível mostrar esta tela'}</h1>
          <p>Seus dados não foram alterados.</p>
          <code className="error-detail">{error.message}</code>
          <div className="error-actions">
            {!isApp && this.props.onGoHome && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  this.props.onGoHome?.()
                  this.setState({ error: null })
                }}
              >
                Ir para o Início
              </button>
            )}
            <button type="button" className="btn primary" onClick={() => (isApp ? window.location.reload() : this.setState({ error: null }))}>
              {isApp ? 'Recarregar' : 'Tentar de novo'}
            </button>
          </div>
        </div>
      </main>
    )
  }
}
