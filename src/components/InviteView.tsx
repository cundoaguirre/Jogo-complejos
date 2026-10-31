import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Link2, 
  AlertCircle, 
  CheckCircle2, 
  Loader2 
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

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

export const InviteView: React.FC<InviteViewProps> = ({
  token,
  onSuccess,
  onNavigateHome
}) => {
  const { user, reloadCollaboratorData, logout } = useFirebase();

  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<InvitationValidationResult | null>(null);
  const [complexName, setComplexName] = useState<string>('tu complejo');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<boolean>(false);

  // Validate invitation token and fetch complex name on load
  useEffect(() => {
    let isMounted = true;
    const checkToken = async () => {
      setLoading(true);
      setClaimError(null);
      try {
        const res = await validateSaasInvitation(token);
        if (isMounted) {
          setValidation(res);
          if (res.complexName) {
            setComplexName(res.complexName);
          }
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('[InviteView] Token pre-check error:', err);
          setLoading(false);
        }
      }
    };

    checkToken();
    return () => {
      isMounted = false;
    };
  }, [token]);

  // Handle Google Login & Claim flow
  const handleAction = async () => {
    setClaimError(null);

    // If already validated as invalid, do not proceed
    if (validation && !validation.valid) {
      return;
    }

    let targetUser = auth.currentUser || user;

    // 1. If not authenticated, initiate Google popup sign-in
    if (!targetUser) {
      setIsSigningIn(true);
      try {
        googleProvider.setCustomParameters({
          prompt: 'select_account'
        });
        const cred = await signInWithPopup(auth, googleProvider);
        targetUser = cred.user;
      } catch (err: any) {
        setIsSigningIn(false);
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
          setClaimError('El inicio de sesión con Google fue cancelado.');
        } else {
          setClaimError('No se pudo completar el inicio de sesión con Google.');
        }
        return;
      } finally {
        setIsSigningIn(false);
      }
    }

    if (!targetUser) return;

    // 2. Claim invitation with current user
    setIsClaiming(true);
    try {
      const claimResult = await claimSaasInvitation(token, targetUser, validation?.documentId);
      setClaimSuccess(true);
      await reloadCollaboratorData();

      setTimeout(() => {
        onSuccess(claimResult.complexId, claimResult.complexName);
      }, 1300);
    } catch (err: any) {
      console.warn('[InviteView] Error claiming invitation:', err);
      setClaimError(err.message || 'Error al vincular el complejo. Intentá nuevamente.');
      setIsClaiming(false);
    }
  };

  const isProcessing = isSigningIn || isClaiming;
  const isInvalidToken = validation && !validation.valid;

  // Error messaging for invalid tokens
  const getInvalidReasonMessage = () => {
    if (!validation) return null;
    switch (validation.reason) {
      case 'claimed':
        return {
          title: 'Invitación ya utilizada',
          description: 'Este enlace de invitación ya fue utilizado. Cada enlace es de uso único.'
        };
      case 'expired':
        return {
          title: 'Invitación expirada',
          description: 'El plazo de vigencia de esta invitación ha vencido. Solicitá al administrador un nuevo enlace.'
        };
      case 'revoked':
        return {
          title: 'Invitación revocada',
          description: 'Este enlace fue cancelado por el administrador del complejo.'
        };
      case 'not_found':
        return {
          title: 'Invitación no válida',
          description: 'El enlace ingresado no corresponde a ninguna invitación activa registrada.'
        };
      default:
        return {
          title: 'Error de verificación',
          description: validation.errorMessage || 'No se pudo verificar el enlace de invitación.'
        };
    }
  };

  const invalidInfo = isInvalidToken ? getInvalidReasonMessage() : null;

  return (
    <div className="min-h-[100dvh] w-full relative flex flex-col justify-between overflow-x-hidden bg-[#0BA70B] select-none">
      {/* Capa de Imagen de Césped con Filtro y Difuminado Inferior */}
      <div className="absolute top-0 left-0 right-0 h-[68%] sm:h-[72%] overflow-hidden pointer-events-none">
        <img
          src="/assets/turf-bg.jpg"
          alt="Césped sintético"
          className="object-cover w-full h-full absolute top-0 left-0 right-0"
        />
        <div className="absolute inset-0 bg-[#0BA70B]/75 mix-blend-multiply" />
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-[#0BA70B]" />
      </div>

      {/* Zona Verde Superior */}
      <div className="relative z-10 px-6 pt-6 sm:pt-8 pb-4 flex-1 flex flex-col justify-between max-w-lg mx-auto w-full">
        {/* Fila Superior */}
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={onNavigateHome}
            aria-label="Volver"
            className="w-10 h-10 flex items-center justify-center text-white hover:opacity-80 transition-opacity cursor-pointer -ml-2 rounded-full active:bg-white/10"
          >
            <ArrowLeft size={24} />
          </button>

          <img
            src="/logo-white.png"
            alt="Jogo"
            className="h-7 object-contain mx-auto"
          />

          <div className="w-10" />
        </div>

        {/* Bloque de Mensaje de Invitación */}
        <div className="my-auto py-8 sm:py-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#0BA70B] text-xs font-bold shadow-xs w-fit mb-4">
            <Link2 size={13} className="shrink-0" />
            <span>Link de invitación</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight tracking-tight whitespace-pre-line">
            Felicidades{'\n'}por este gran paso!
          </h1>

          <p className="text-white/95 text-base sm:text-lg font-medium mt-3">
            Bienvenido a Jogo, <strong className="font-bold">{complexName}</strong>.
          </p>

          <p className="text-white/80 text-sm mt-2 leading-relaxed">
            Fuiste invitado a ser el administrador de este complejo. Podrás gestionar turnos, canchas, cobros y mucho más de forma simple y ágil.
          </p>
        </div>
      </div>

      {/* Tarjeta Inferior Blanca (Acciones) */}
      <div className="bg-white rounded-t-[36px] w-full p-6 sm:p-8 space-y-5 shadow-2xl max-w-lg mx-auto relative z-10">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">
            Es sencillo...
          </h2>
          <p className="text-gray-500 text-sm leading-snug">
            Solo tenés que iniciar sesión con tu cuenta de Google para vincular tu complejo.
          </p>
        </div>

        {/* Error de reclamo o popup */}
        {claimError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs flex items-center gap-2 text-left">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1 font-medium">{claimError}</span>
          </div>
        )}

        {/* Mensaje de invitación inválida o expirada */}
        {invalidInfo && !claimSuccess && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left space-y-1">
            <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              <span>{invalidInfo.title}</span>
            </div>
            <p className="text-amber-700 text-xs leading-relaxed pl-6">
              {invalidInfo.description}
            </p>
          </div>
        )}

        {/* Banner de éxito */}
        {claimSuccess && (
          <div className="p-4 bg-emerald-50 border border-[#0BA70B]/30 rounded-2xl text-emerald-800 text-xs flex items-center gap-3 text-left">
            <CheckCircle2 size={24} className="text-[#0BA70B] shrink-0" />
            <div>
              <p className="font-bold text-sm">¡Complejo vinculado con éxito!</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Entrando al panel de administración...
              </p>
            </div>
          </div>
        )}

        {/* Acciones principales */}
        {!claimSuccess && (
          <>
            {isInvalidToken ? (
              <button
                type="button"
                onClick={onNavigateHome}
                className="w-full py-3 px-4 rounded-full bg-gray-900 hover:bg-black text-white font-semibold text-sm transition-colors cursor-pointer shadow-xs"
              >
                Ir al inicio de Jogo
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={isProcessing || loading}
                  onClick={handleAction}
                  className="w-full py-2.5 px-4 rounded-full border border-gray-200 hover:bg-gray-50 active:scale-[0.99] flex items-center justify-center gap-3 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={18} className="animate-spin text-gray-500" />
                      <span className="text-gray-700 font-semibold text-sm">
                        {isSigningIn ? 'Iniciando sesión...' : 'Vinculando complejo...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <GoogleIcon />
                      <span className="text-gray-700 font-semibold text-sm">
                        Inicia sesión con Google
                      </span>
                    </>
                  )}
                </button>

                {user && (
                  <div className="flex items-center justify-between px-2 text-[11px] text-gray-500">
                    <span className="truncate max-w-[200px] sm:max-w-[240px]">
                      Sesión: <strong className="text-gray-700">{user.email}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={logout}
                      className="text-gray-400 hover:text-gray-600 underline cursor-pointer shrink-0"
                    >
                      Cambiar cuenta
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Términos y condiciones */}
        <p className="text-[11px] text-gray-400 text-center leading-tight pt-1">
          Al continuar, aceptas nuestros{' '}
          <span className="underline hover:text-gray-600 cursor-pointer">términos y condiciones</span>{' '}
          y{' '}
          <span className="underline hover:text-gray-600 cursor-pointer">políticas de privacidad</span>.
        </p>
      </div>
    </div>
  );
};
