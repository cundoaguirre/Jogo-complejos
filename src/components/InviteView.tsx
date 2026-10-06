import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  Lock, 
  LogOut,
  Calendar,
  Sparkles
} from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { useFirebase } from './FirebaseContext';
import { validateSaasInvitation, claimSaasInvitation, InvitationValidationResult } from '../lib/invitations';

interface InviteViewProps {
  token: string;
  onSuccess: (complexId: string, complexName: string) => void;
  onNavigateHome: () => void;
  isDarkMode?: boolean;
}

export const InviteView: React.FC<InviteViewProps> = ({
  token,
  onSuccess,
  onNavigateHome,
  isDarkMode
}) => {
  const { user, reloadCollaboratorData, logout } = useFirebase();

  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState<InvitationValidationResult | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<boolean>(false);

  // REQUIREMENT 3: Only execute validateSaasInvitation once the user is authenticated!
  useEffect(() => {
    if (!user) {
      setLoading(false);
      setValidation(null);
      return;
    }

    let isMounted = true;
    const checkToken = async () => {
      setLoading(true);
      setClaimError(null);
      const res = await validateSaasInvitation(token);
      if (isMounted) {
        setValidation(res);
        setLoading(false);
      }
    };
    checkToken();
    return () => {
      isMounted = false;
    };
  }, [token, user]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setClaimError(null);
    try {
      googleProvider.setCustomParameters({
        prompt: 'select_account'
      });
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.warn('[InviteView] Login popup error:', err);
      setClaimError('No se pudo completar el inicio de sesión con Google.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleClaim = async () => {
    const currentUser = auth.currentUser || user;
    if (!currentUser) {
      await handleGoogleSignIn();
      return;
    }

    setIsClaiming(true);
    setClaimError(null);

    try {
      // Execute atomic claim in Firestore passing the resolved documentId
      const claimResult = await claimSaasInvitation(token, currentUser, validation?.documentId);

      setClaimSuccess(true);
      await reloadCollaboratorData();

      setTimeout(() => {
        onSuccess(claimResult.complexId, claimResult.complexName);
      }, 1200);

    } catch (err: any) {
      console.warn('[InviteView] Error claiming invitation:', err);
      setClaimError(err.message || 'Error al reclamar la invitación. Reintentá nuevamente.');
      setIsClaiming(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white transition-colors duration-200">
      {/* Top Navbar */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-[#0BA70B] flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <span className="text-white font-black text-xl tracking-tighter">J</span>
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">JOGO</span>
            <span className="ml-1.5 text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">SaaS</span>
          </div>
        </div>

        {user && (
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            <span>Cerrar sesión ({user.email?.split('@')[0]})</span>
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="w-full max-w-lg mx-auto px-4 py-8 flex-1 flex flex-col items-center justify-center">
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-black/40 p-6 sm:p-8 text-center space-y-6">

          {/* STATE: Prompt Google Sign-In first */}
          {!user && (
            <div className="py-4 space-y-6">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                <ShieldCheck size={32} />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  Invitación a Jogo SaaS
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Para acceder a esta invitación y validar tus permisos, por favor continuá con tu cuenta de Google.
                </p>
              </div>

              {claimError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2 text-left">
                  <AlertCircle size={15} className="shrink-0" />
                  <span className="flex-1">{claimError}</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={handleGoogleSignIn}
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-2xl text-xs sm:text-sm shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Conectando con Google...</span>
                    </>
                  ) : (
                    <>
                      <span>Continuar con Google</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STATE: Loading */}
          {user && loading && (
            <div className="py-8 space-y-4">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Verificando enlace de invitación...
              </p>
            </div>
          )}

          {/* STATE: Invalid / Error / Expired / Claimed */}
          {user && !loading && validation && !validation.valid && (
            <div className="py-4 space-y-6">
              <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto shadow-inner">
                <AlertCircle size={32} />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  {validation.reason === 'claimed' && 'Invitación ya utilizada'}
                  {validation.reason === 'expired' && 'Invitación expirada'}
                  {validation.reason === 'revoked' && 'Invitación revocada'}
                  {validation.reason === 'not_found' && 'Invitación no válida'}
                  {validation.reason === 'error' && 'Error al validar invitación'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  {validation.reason === 'claimed' && 'Este enlace de invitación ya fue reclamado por otro usuario. Las invitaciones son de uso único por seguridad.'}
                  {validation.reason === 'expired' && 'El plazo de vigencia de esta invitación ha vencido. Solicitá al administrador que te genere una nueva invitación.'}
                  {validation.reason === 'revoked' && 'Este enlace ha sido cancelado o revocado por el administrador del complejo.'}
                  {validation.reason === 'not_found' && 'El enlace ingresado no corresponde a ninguna invitación activa registrada.'}
                  {validation.reason === 'error' && (validation.errorMessage || 'Ocurrió un error al verificar los datos de la invitación.')}
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onNavigateHome}
                  className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-bold rounded-2xl text-xs sm:text-sm transition-all cursor-pointer shadow-sm"
                >
                  Ir al inicio de Jogo
                </button>
              </div>
            </div>
          )}

          {/* STATE: Valid Invitation Ready to Claim */}
          {user && !loading && validation && validation.valid && (
            <div className="space-y-6">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <ShieldCheck size={13} className="text-emerald-500" />
                <span>Invitación Oficial Verificada</span>
              </div>

              {/* Title & Info */}
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  Unirse a {validation.complexName || 'Complejo Deportivo'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Fuiste invitado para gestionar este complejo como operador autorizado. Vinculá tu cuenta de Google para tomar el control.
                </p>
              </div>

              {/* Complex Card */}
              <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-left">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                      {validation.complexName}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Rol: <span className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">{validation.invitation?.role || 'owner'}</span>
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-mono px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold">
                  1 SOLO USO
                </span>
              </div>

              {/* Error Banner */}
              {claimError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2 text-left">
                  <AlertCircle size={15} className="shrink-0" />
                  <span className="flex-1">{claimError}</span>
                </div>
              )}

              {/* Success Banner */}
              {claimSuccess && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-3 text-left">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-bold">¡Invitación aceptada exitosamente!</p>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Entrando al panel de control de tu complejo...
                    </p>
                  </div>
                </div>
              )}

              {/* Primary Action Button */}
              {!claimSuccess && (
                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    disabled={isClaiming}
                    onClick={handleClaim}
                    className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-2xl text-xs sm:text-sm shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isClaiming ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Vinculando complejo a tu cuenta...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Aceptar Invitación con Google</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>

                  {user && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Se vinculará a la cuenta activa: <span className="font-semibold text-slate-700 dark:text-slate-300">{user.email}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-5 text-[11px] text-slate-400 dark:text-slate-600">
        Jogo SaaS © {new Date().getFullYear()} — Plataforma de Gestión de Canchas Deportivas
      </footer>
    </div>
  );
};
