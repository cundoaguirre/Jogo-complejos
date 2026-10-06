import React, { useState } from 'react';
import { 
  Lock, 
  Calendar, 
  Users, 
  TrendingUp, 
  Sun, 
  Moon, 
  AlertCircle, 
  Loader2 
} from 'lucide-react';
import { useFirebase } from './FirebaseContext';

interface LandingAuthViewProps {
  onSignInWithGoogle: () => Promise<any>;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export const LandingAuthView: React.FC<LandingAuthViewProps> = ({
  onSignInWithGoogle,
  isDarkMode = false,
  onToggleDarkMode
}) => {
  const { authError, clearAuthError } = useFirebase();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleProceedGoogle = async () => {
    setIsSigningIn(true);
    clearAuthError();
    try {
      await onSignInWithGoogle();
    } catch (err) {
      console.warn('[LandingAuth] Proceed error:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white transition-colors duration-200">
      {/* Top Navbar */}
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-[#0BA70B] flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <span className="text-white font-black text-xl tracking-tighter">J</span>
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">JOGO</span>
            <span className="ml-1.5 text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">SaaS</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onToggleDarkMode && (
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors cursor-pointer"
              title={isDarkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              aria-label="Toggle tema"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
        </div>
      </header>

      {/* Main Hero & Auth Card */}
      <main className="w-full max-w-4xl mx-auto px-4 py-8 flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-black/40 p-6 sm:p-8">
          {/* Card Header */}
          <div className="text-center space-y-2 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              <Lock size={12} className="text-emerald-500" />
              <span>Acceso Seguro Multi-Tenant</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Gestión para Complejos
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Ingresá con tu cuenta para acceder a la agenda, analíticas y finanzas de tu sede deportiva.
            </p>
          </div>

          {/* Primary Action: Google Auth */}
          <div className="space-y-4">
            <button
              type="button"
              disabled={isSigningIn}
              onClick={handleProceedGoogle}
              className="w-full py-3.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-100 font-bold rounded-2xl border border-slate-300 dark:border-slate-700 shadow-xs hover:shadow transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
            >
              {isSigningIn ? (
                <Loader2 size={18} className="animate-spin text-emerald-600" />
              ) : (
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              )}
              <span>{isSigningIn ? 'Iniciando sesión...' : 'Iniciar sesión con Google'}</span>
            </button>

            {/* Error Notification */}
            {authError && authError !== 'popup-closed' && (
              <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{authError}</span>
                </div>
                <button
                  type="button"
                  onClick={clearAuthError}
                  className="text-[10px] text-red-500 hover:text-red-700 underline cursor-pointer"
                >
                  Descartar
                </button>
              </div>
            )}
          </div>

          {/* Privacy Note */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              Cada complejo opera en aislamiento estricto sobre Firestore. La vinculación y autorización se gestionan de forma segura mediante credenciales oficiales.
            </p>
          </div>
        </div>

        {/* Feature Highlights beneath */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl mt-8">
          <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Calendar size={18} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Agenda en Vivo</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Disponibilidad en tiempo real</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <Users size={18} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Matriz de Clientes</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Métricas TTV, cohortes y ciclo</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
              <TrendingUp size={18} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Finanzas Claras</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Cobros, señas y balances</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-4 text-[11px] text-slate-400 dark:text-slate-600">
        Jogo SaaS © {new Date().getFullYear()} — Plataforma de Gestión de Canchas Deportivas
      </footer>
    </div>
  );
};
