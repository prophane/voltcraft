import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown runtime error',
    }
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('Voltcraft runtime crash:', error, errorInfo)
  }

  override render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-bg-base text-text-primary flex items-center justify-center px-6">
        <div className="max-w-xl w-full rounded-2xl border border-danger/30 bg-bg-surface p-6 shadow-elevated">
          <p className="text-xs uppercase tracking-[0.24em] text-text-muted">Voltcraft</p>
          <h1 className="mt-3 text-2xl font-semibold">Une erreur d interface a interrompu l affichage.</h1>
          <p className="mt-3 text-sm text-text-secondary">
            L application a évité l écran noir complet et a capturé l erreur JavaScript. Recharge la page pour retenter après nettoyage du cache navigateur.
          </p>
          <div className="mt-4 rounded-xl border border-border-subtle bg-bg-overlay/60 p-3 text-xs text-text-muted break-words">
            {this.state.message || 'Aucun détail disponible'}
          </div>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              className="btn-primary"
              onClick={() => window.location.reload()}
            >
              Recharger
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                this.setState({ hasError: false, message: '' })
                window.location.assign('/')
              }}
            >
              Retour a l accueil
            </button>
          </div>
        </div>
      </div>
    )
  }
}