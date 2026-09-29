import React, { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeGlobalErrorListeners, logCrashReport, CrashReport } from './logger';
import { FirebaseProvider } from './components/FirebaseContext';

// Initialize global window error handlers
initializeGlobalErrorListeners();

interface RootErrorBoundaryProps {
  children: React.ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  crashReport: CrashReport | null;
  showDetails: boolean;
  copied: boolean;
}

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  override state: RootErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    crashReport: null,
    showDetails: false,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<RootErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Generates high-visibility console crash report identifying the offending component
    const report = logCrashReport(error, errorInfo, { section: 'RootErrorBoundary' });
    this.setState({ errorInfo, crashReport: report });
  }

  handleCopyReport = () => {
    const reportData = JSON.stringify(
      {
        message: this.state.error?.message,
        stack: this.state.error?.stack,
        componentStack: this.state.errorInfo?.componentStack,
        timestamp: this.state.crashReport?.timestamp || new Date().toISOString(),
      },
      null,
      2
    );

    navigator.clipboard.writeText(reportData).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 p-4 sm:p-6 text-slate-100 font-sans">
          <div className="bg-slate-800/90 border border-slate-700 p-6 sm:p-8 rounded-3xl shadow-2xl max-w-xl w-full text-center backdrop-blur-md">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4 font-black text-2xl shadow-inner">
              ⚠️
            </div>
            
            <h2 className="text-xl sm:text-2xl font-black text-white mb-2 tracking-tight">
              Reporte de Error Detectado
            </h2>
            
            <p className="text-xs sm:text-sm text-slate-400 mb-4 leading-relaxed">
              Se capturó una excepción en tiempo de ejecución. Los detalles han sido registrados en la consola del navegador.
            </p>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 mb-6 text-left overflow-hidden">
              <div className="text-xs font-bold text-red-400 font-mono mb-1 truncate">
                {this.state.error?.name || 'Error'}: {this.state.error?.message || 'Error no especificado'}
              </div>
              {this.state.errorInfo?.componentStack && (
                <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 max-h-36 overflow-y-auto mt-2 whitespace-pre-wrap leading-tight">
                  <span className="text-emerald-400 font-bold block mb-1">Componentes involucrados:</span>
                  {this.state.errorInfo.componentStack.trim()}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  this.setState({ hasError: false, error: null, errorInfo: null, crashReport: null });
                }}
                className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-slate-950 rounded-xl text-sm font-black shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                Reiniciar Aplicación
              </button>
              <button
                type="button"
                onClick={this.handleCopyReport}
                className="py-3.5 px-5 bg-slate-700 hover:bg-slate-600 active:scale-98 text-white rounded-xl text-sm font-bold border border-slate-600 transition-all cursor-pointer"
              >
                {this.state.copied ? '✓ Reporte Copiado' : 'Copiar Reporte'}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <FirebaseProvider>
        <App />
      </FirebaseProvider>
    </RootErrorBoundary>
  </StrictMode>,
);

