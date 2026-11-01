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
  <svg className="w-[19px] h-[19px] shrink-0" viewBox="0 0 24 24">
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
  const [complexName, setComplexName] = useState<string>('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<boolean>(false);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

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
  const displayComplexName = validation?.complexName || complexName || '';

  return (
    <div translate="no" className="notranslate relative w-full min-h-[100dvh] overflow-hidden select-none">
      {/* CAPA 0: Fondo fotográfico de la cancha al 100% de alto y ancho (z-0) */}
      <img
        src="/assets/invite-turf-bg.jpg"
        alt="Cancha de fútbol"
        className="absolute inset-0 w-full h-full object-cover object-center opacity-100 pointer-events-none z-0"
        onError={(e) => {
          const target = e.currentTarget;
          if (!target.src.includes('0be87cd4.jpg')) {
            target.src = '/assets/aistudio/9b17478566e4541d0358a0917f54a00e_0be87cd4.jpg';
          }
        }}
      />

      {/* CAPA 1: Superposición verde #019F3A al 86% de fuerza (14% transparencia) (z-10) */}
      <div 
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ backgroundColor: 'rgba(1, 159, 58, 0.86)' }}
      />

      {/* CAPA 2: Contenido interactivo y textos (z-20) */}
      <div className="relative z-20 min-h-[100dvh] w-full flex flex-col justify-between overflow-x-hidden">
        {/* Flecha de retroceso arriba a la izquierda */}
        <button
          type="button"
          onClick={onNavigateHome}
          aria-label="Volver"
          className="absolute top-[22px] left-[20px] z-30 p-1 text-white hover:opacity-80 active:opacity-60 transition-opacity cursor-pointer bg-transparent border-0"
        >
          <ArrowLeft size={24} strokeWidth={2.2} className="text-white" />
        </button>

        {/* Zona superior: Logo oficial de Jogo en blanco (125px, centrado) */}
        <div className="pt-[56px] pb-[18px] flex justify-center items-center w-full">
          <img
            src="/assets/aistudio/Photoroom-20261027_123311_8fbc6431.png"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.src.includes('jogo-logo-white.png')) {
                target.src = '/assets/jogo-logo-white.png';
              } else if (!target.src.includes('logo-white.png')) {
                target.src = '/logo-white.png';
              }
            }}
            alt="Jogo"
            className="w-[125px] h-auto object-contain mx-auto select-none pointer-events-none drop-shadow-xs"
          />
        </div>

        {/* Bloque Central de Textos (gap uniforme de 18px entre elementos y mayor separación con la tarjeta inferior) */}
        <div className="my-auto mb-[40px] px-[32px] sm:px-[36px] flex flex-col items-start text-left gap-[18px] max-w-[460px] mx-auto w-full">
          {/* Bloque 1: Cápsula Link de invitación (22px de alto total, círculo de 22px de alto total) */}
          <div 
            className="h-[22px] rounded-full !bg-[#EAFBEA] pl-0 pr-[10px] flex items-center gap-[6px] w-fit shadow-xs"
            style={{ backgroundColor: '#EAFBEA' }}
          >
            <span 
              className="w-[22px] h-[22px] rounded-full !bg-[#129D44] flex items-center justify-center shrink-0"
              style={{ backgroundColor: '#129D44' }}
            >
              <Link2 size={11} strokeWidth={2.5} className="!text-[#EAFBEA] -rotate-45" />
            </span>
            <span className="text-[10.5px] sm:text-[11px] font-bold !text-[#129D44] leading-none tracking-[-0.01em]">
              Link de invitación
            </span>
          </div>

          {/* Bloque 2: Título en 2 renglones */}
          <h1 className="text-[37px] xs:text-[39px] sm:text-[43px] font-extrabold text-white leading-[1.0] tracking-[-0.03em]">
            Felicidades<br />
            por este gran paso!
          </h1>

          {/* Bloque 3: Línea de bienvenida con nombre dinámico del complejo (sin Colo Loco por defecto) */}
          <p translate="no" className="notranslate text-[19px] sm:text-[20px] leading-[1.2] tracking-[-0.015em] font-normal text-white">
            <span>Bienvenido a Jogo, </span><span className="font-extrabold text-white">{displayComplexName}.</span>
          </p>

          {/* Bloque 4: Párrafo explicativo */}
          <p className="text-[14px] sm:text-[15px] leading-[1.32] tracking-[-0.01em] text-white font-normal">
            Desde hoy, tenés una nueva herramienta que<br />
            te facilitará el trabajo diario y te ayudará a<br />
            tomar mejores decisiones!
          </p>
        </div>

        {/* Tarjeta Inferior Blanca (con pb-[34px] sm:pb-[40px] para franja blanca inferior holgada) */}
        <div 
          className="rounded-t-[34px] !bg-[#FFFFFF] w-full pt-[22px] pb-[34px] sm:pb-[40px] px-[32px] sm:px-[36px] max-w-[460px] mx-auto relative z-20 shadow-none text-left"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          {/* Cabecera de la tarjeta */}
          <h2 className="text-[19px] sm:text-[20px] font-bold !text-[#707070] text-left leading-[1.15] tracking-[-0.015em]">
            Es sencillo...
          </h2>
          <p className="text-[12.5px] sm:text-[13.5px] font-normal !text-[#9E9E9E] text-left mt-[2px] whitespace-nowrap leading-[1.25]">
            Ingresá tu correo electrónico para continuar
          </p>

          {/* Banner de error */}
          {claimError && (
            <div className="mt-3.5 w-full p-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs flex items-center gap-2 text-left">
              <AlertCircle size={15} className="shrink-0 text-red-500" />
              <span className="flex-1 font-medium">{claimError}</span>
            </div>
          )}

          {/* Banner de invitación inválida o expirada */}
          {invalidInfo && !claimSuccess && (
            <div className="mt-3.5 w-full p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-left space-y-1">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                <AlertCircle size={15} className="text-amber-600 shrink-0" />
                <span>{invalidInfo.title}</span>
              </div>
              <p className="text-amber-700 text-[11px] leading-relaxed pl-5">
                {invalidInfo.description}
              </p>
            </div>
          )}

          {/* Banner de éxito */}
          {claimSuccess && (
            <div className="mt-3.5 w-full p-3.5 bg-emerald-50 border border-[#129D44]/30 rounded-2xl text-emerald-800 text-xs flex items-center gap-2.5 text-left">
              <CheckCircle2 size={20} className="text-[#129D44] shrink-0" />
              <div>
                <p className="font-bold text-xs">¡Complejo vinculado con éxito!</p>
                <p className="text-[10.5px] text-emerald-700 mt-0.5">
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
                  className="w-full mt-[16px] h-[48px] sm:h-[52px] rounded-full bg-gray-900 hover:bg-black text-white font-semibold text-sm transition-colors cursor-pointer shadow-xs"
                >
                  Ir al inicio de Jogo
                </button>
              ) : (
                <div className="w-full">
                  <button
                    type="button"
                    disabled={isProcessing || loading}
                    onClick={handleAction}
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="mt-[16px] rounded-full w-full h-[48px] sm:h-[52px] !bg-[#FFFFFF] border border-[#E4E4E4] flex items-center justify-center gap-[10px] cursor-pointer hover:bg-gray-50 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 size={18} className="animate-spin text-gray-500" />
                        <span className="text-[14.5px] sm:text-[15px] font-semibold text-gray-700">
                          {isSigningIn ? 'Iniciando sesión...' : 'Vinculando complejo...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <GoogleIcon />
                        <span className="text-[14.5px] sm:text-[15px] font-normal !text-[#1A1A1A]">
                          <span>Inicia sesión con </span><span className="font-bold !text-[#1A1A1A]">Google</span>
                        </span>
                      </>
                    )}
                  </button>

                  {user && (
                    <div className="mt-2 flex items-center justify-between px-2 text-[11px] !text-[#888888]">
                      <span className="truncate max-w-[210px] sm:max-w-[250px]">
                        <span>Sesión: </span><span className="font-bold !text-[#555555]">{user.email}</span>
                      </span>
                      <button
                        type="button"
                        onClick={logout}
                        className="!text-[#129D44] hover:underline cursor-pointer shrink-0 ml-2"
                      >
                        Cambiar cuenta
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Bloque Legal Inferior: Color original #249F87 y franja blanca inferior holgada */}
          <div className="mt-[14px] text-center text-[9.5px] sm:text-[10px] leading-[1.35] !text-[#A0A0A0]">
            <p>
              <span>Al continuar, tu cuenta de Google quedará</span><br />
              <span>vinculada con </span>
              <span className="font-bold !text-[#888888]">{displayComplexName || 'tu complejo'}</span>
              <span> y aceptas nuestros</span><br />
              <button 
                type="button" 
                onClick={() => setLegalModal('terms')} 
                className="font-bold italic !text-[#249F87] cursor-pointer bg-transparent border-0 p-0 inline hover:underline"
              >
                Términos y Condiciones
              </button>
              {' '}y{' '}
              <button 
                type="button" 
                onClick={() => setLegalModal('privacy')} 
                className="font-bold italic !text-[#249F87] cursor-pointer bg-transparent border-0 p-0 inline hover:underline"
              >
                Políticas de Privacidad
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Modal de Términos / Privacidad */}
      {legalModal && (
        <div 
          className="fixed inset-0 z-50 !bg-[#FFFFFF] flex flex-col p-6 overflow-y-auto"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <button
            type="button"
            onClick={() => setLegalModal(null)}
            className="absolute top-[22px] left-[20px] text-gray-800 p-1 cursor-pointer hover:opacity-75 transition-opacity"
            aria-label="Volver"
          >
            <ArrowLeft size={24} strokeWidth={2.2} />
          </button>
          <div className="pt-16 max-w-lg mx-auto w-full text-left">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {legalModal === 'terms' ? 'Términos y Condiciones' : 'Políticas de Privacidad'}
            </h3>
            <div className="text-sm text-gray-600 leading-relaxed space-y-3">
              <p>
                {legalModal === 'terms'
                  ? 'La aplicación se está actualizando constantemente...'
                  : 'Seguimos trabajando, la aplicación se está actualizando constantemente...'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
