import React, { useState, useEffect } from 'react';
import { 
  Link2,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2
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

const GoogleIcon: React.FC = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.96 6.72-4.96z"
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
  const [complexName, setComplexName] = useState<string>('El Colo Loco');
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
          src="/assets/invite-turf-bg.jpg"
          alt="Césped sintético"
          className="object-cover object-top w-full h-full absolute top-0 left-0 right-0"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.src.includes('turf-bg.jpg')) {
              target.src = '/assets/turf-bg.jpg';
            }
          }}
        />
        {/* Capa verde oficial con mezcla suave para resaltar líneas y red */}
        <div className="absolute inset-0 bg-[#0BA70B]/75 mix-blend-multiply" />
        <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-b from-transparent via-[#0BA70B]/40 to-[#0BA70B]" />
      </div>

      {/* Zona Verde Superior */}
      <div className="relative z-10 px-6 pt-7 sm:pt-9 pb-6 flex-1 flex flex-col justify-between max-w-lg mx-auto w-full">
        {/* Cabecera con Botón Volver y Logo Jogo Centrado */}
        <div className="flex items-center justify-between w-full relative">
          <button
            type="button"
            onClick={onNavigateHome}
            aria-label="Volver"
            className="w-11 h-11 flex items-center justify-center text-white hover:opacity-85 transition-opacity cursor-pointer -ml-2 rounded-full active:bg-white/10 z-10"
          >
            <ArrowLeft size={30} strokeWidth={2.4} />
          </button>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <img
              src="/assets/jogo-logo-white.png"
              onError={(e) => {
                e.currentTarget.src = '/logo-white.png';
              }}
              alt="Jogo"
              className="h-16 sm:h-20 object-contain drop-shadow-sm"
            />
          </div>

          <div className="w-11" />
        </div>

        {/* Bloque Central de Textos de Bienvenida */}
        <div className="my-auto pt-8 pb-4">
          {/* Badge Link de Invitación */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white shadow-xs w-fit mb-5">
            <span className="w-6 h-6 rounded-full bg-[#0BA70B] flex items-center justify-center text-white shrink-0">
              <Link2 size={13} className="text-white -rotate-45" strokeWidth={2.6} />
            </span>
            <span className="text-[#15803d] text-xs font-bold tracking-tight">
              Link de invitación
            </span>
          </div>

          {/* Gran Título en 2 renglones */}
          <h1 className="text-4xl sm:text-5xl font-black text-white leading-[1.08] tracking-tight mb-4">
            Felicidades<br />
            por este gran paso!
          </h1>

          {/* Subtítulo con nombre del complejo */}
          <p className="text-white text-lg sm:text-xl font-normal mb-3">
            Bienvenido a Jogo, <strong className="font-bold">{complexName || 'El Colo Loco'}.</strong>
          </p>

          {/* Descripción */}
          <p className="text-white/95 text-sm sm:text-[15px] font-normal leading-relaxed max-w-md">
            Desde hoy, tenés una nueva herramienta que te facilitará el trabajo diario y te ayudará a tomar mejores decisiones!
          </p>
        </div>
      </div>

      {/* Tarjeta Inferior Blanca (Acciones y Legal) */}
      <div className="bg-white rounded-t-[50px] sm:rounded-t-[55px] w-full pt-8 pb-8 px-7 sm:px-9 shadow-2xl max-w-lg mx-auto relative z-10 flex flex-col items-center text-center">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">
            Es sencillo...
          </h2>
          <p className="text-gray-400 text-sm font-normal mt-1.5">
            Ingresá tu correo electrónico para continuar
          </p>
        </div>

        {/* Error de reclamo o popup */}
        {claimError && (
          <div className="mt-4 w-full p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs flex items-center gap-2.5 text-left">
            <AlertCircle size={16} className="shrink-0 text-red-500" />
            <span className="flex-1 font-medium">{claimError}</span>
          </div>
        )}

        {/* Mensaje de invitación inválida o expirada */}
        {invalidInfo && !claimSuccess && (
          <div className="mt-4 w-full p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left space-y-1">
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
          <div className="mt-4 w-full p-4 bg-emerald-50 border border-[#0BA70B]/30 rounded-2xl text-emerald-800 text-xs flex items-center gap-3 text-left">
            <CheckCircle2 size={24} className="text-[#0BA70B] shrink-0" />
            <div>
              <p className="font-bold text-sm">¡Complejo vinculado con éxito!</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Entrando al panel de administración...
              </p>
            </div>
          </div>
        )}

        {/* Botón de acción */}
        {!claimSuccess && (
          <>
            {isInvalidToken ? (
              <button
                type="button"
                onClick={onNavigateHome}
                className="w-full mt-6 py-3.5 px-6 rounded-full bg-gray-900 hover:bg-black text-white font-semibold text-sm transition-colors cursor-pointer shadow-xs"
              >
                Ir al inicio de Jogo
              </button>
            ) : (
              <div className="w-full mt-6 space-y-3">
                <button
                  type="button"
                  disabled={isProcessing || loading}
                  onClick={handleAction}
                  className="w-full py-3.5 px-6 rounded-full border border-gray-200 hover:border-gray-300 bg-white shadow-xs active:scale-[0.99] flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={19} className="animate-spin text-gray-500" />
                      <span className="text-gray-700 font-semibold text-base">
                        {isSigningIn ? 'Iniciando sesión...' : 'Vinculando complejo...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <GoogleIcon />
                      <span className="text-gray-800 text-base font-normal">
                        Inicia sesión con <strong className="font-bold">Google</strong>
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

        {/* Términos y condiciones con color turquesa #249F87 */}
        <div className="text-center text-[11px] sm:text-xs text-[#94a3b8] mt-6 leading-relaxed max-w-sm mx-auto">
          <p>
            Al continuar, tu cuenta de Google quedará vinculada con{' '}
            <strong className="text-[#64748b] font-semibold">{complexName || 'El Colo Loco'}</strong> y aceptas nuestros
          </p>
          <p className="mt-0.5">
            <span className="text-[#249F87] font-semibold hover:underline cursor-pointer">
              Términos y Condiciones
            </span>{' '}
            y{' '}
            <span className="text-[#249F87] font-semibold hover:underline cursor-pointer">
              Políticas de Privacidad
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
