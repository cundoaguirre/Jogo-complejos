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
          setValidation({ valid: false, reason: 'error', errorMessage: err.message });
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
    if (!validation || !validation.valid) {
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
      const claimResult = await claimSaasInvitation(token, targetUser, validation.documentId);
      setClaimSuccess(true);
      await reloadCollaboratorData();
      onSuccess(claimResult.complexId, claimResult.complexName);
    } catch (err: any) {
      console.warn('[InviteView] Error claiming invitation:', err);
      setClaimError(err.message || 'Error al vincular el complejo. Intentá nuevamente.');
      setIsClaiming(false);
    }
  };

  const isProcessing = isSigningIn || isClaiming;

  // 1. Estado de carga inicial
  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-950 text-center select-none font-['Plus_Jakarta_Sans',sans-serif]">
        <Loader2 size={32} className="animate-spin text-[#019F3A] mb-3" />
        <p className="text-sm font-medium text-gray-400 dark:text-slate-500">
          Verificando enlace de invitación...
        </p>
      </div>
    );
  }

  // 2. Pantalla sobria cuando el link no es válido o expiró
  if (!validation || !validation.valid) {
    return (
      <div className="min-h-screen w-full relative flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-950 text-center select-none font-['Plus_Jakarta_Sans',sans-serif]">
        <button
          type="button"
          onClick={onNavigateHome}
          aria-label="Volver"
          className="absolute top-6 left-6 p-2 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft size={24} />
        </button>
        <p className="text-base font-medium text-gray-400 dark:text-slate-500">
          Enlace no válido o expirado
        </p>
      </div>
    );
  }

  // 3. Link válido verificado — Pantalla oficial con la foto y tratamiento verde #019F3A al 14%
  const displayComplexName = validation.complexName || complexName || 'tu complejo';

  return (
    <div className="relative w-full min-h-[100dvh] overflow-hidden select-none bg-[#019F3A] flex flex-col justify-between font-['Plus_Jakarta_Sans',sans-serif]">
      {/* 1. FOTO REAL DE FONDO Y TRATAMIENTO CON VERDE #019F3A AL 14% */}
      <div className="absolute top-0 inset-x-0 w-full h-[72%] overflow-hidden pointer-events-none z-0">
        <img
          src="/assets/invite-turf-bg.jpg"
          alt="Cancha de fútbol"
          className="object-cover object-top w-full h-full absolute top-0 inset-x-0"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.src.includes('0be87cd4.jpg')) {
              target.src = '/assets/aistudio/9b17478566e4541d0358a0917f54a00e_0be87cd4.jpg';
            }
          }}
        />
        {/* Capa verde translúcida exacta #019F3A al 14% de opacidad real */}
        <div 
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ backgroundColor: 'rgba(1, 159, 58, 0.14)' }}
        />
        {/* Transición inferior difuminada suave */}
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-b from-transparent to-[#019F3A]/25 pointer-events-none" />
      </div>

      {/* 2. ZONA SUPERIOR: FLECHA Y LOGO AL DOBLE DE TAMAÑO */}
      <div className="relative z-20 w-full pt-6 px-6 max-w-[460px] mx-auto flex flex-col">
        {/* Flecha volver blanca en fila independiente */}
        <div className="w-full flex items-center justify-start">
          <button
            type="button"
            onClick={onNavigateHome}
            aria-label="Volver"
            className="p-1 -ml-1 text-white hover:opacity-80 active:opacity-60 transition-opacity cursor-pointer bg-transparent border-0"
          >
            <ArrowLeft size={28} strokeWidth={2.4} className="text-white" />
          </button>
        </div>

        {/* Logo Jogo blanco centrado, duplicado en tamaño (h-16 sm:h-20 w-auto object-contain mx-auto) */}
        <div className="pt-2 pb-4 flex justify-center items-center w-full">
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
            className="h-16 sm:h-20 w-auto object-contain mx-auto select-none pointer-events-none drop-shadow-sm"
          />
        </div>
      </div>

      {/* 3 & 4. BLOQUE CENTRAL: CÁPSULA COMPACTA, TÍTULOS Y DESCRIPCIÓN */}
      <div className="relative z-20 my-auto px-7 sm:px-8 max-w-[460px] mx-auto w-full flex flex-col items-start text-left">
        {/* Cápsula compacta Link de invitación */}
        <div 
          className="h-[26px] rounded-full bg-white !bg-white pl-0 pr-3 flex items-center gap-2 shadow-xs w-fit mb-5"
          style={{ backgroundColor: '#ffffff' }}
        >
          <span 
            className="w-[26px] h-[26px] rounded-full bg-[#019F3A] !bg-[#019F3A] flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#019F3A' }}
          >
            <Link2 size={13} strokeWidth={2.5} className="text-white -rotate-45" />
          </span>
          <span className="text-xs font-bold text-[#019F3A] tracking-tight">
            Link de invitación
          </span>
        </div>

        {/* Título principal en 2 líneas, blanco puro display */}
        <h1 className="text-[42px] sm:text-[46px] font-black leading-[1.0] tracking-tight text-white">
          ¡Felicidades<br />
          por este gran paso!
        </h1>

        {/* Bienvenida */}
        <p className="text-lg text-white mt-3.5">
          Bienvenido a Jogo, <strong className="font-bold">{displayComplexName}.</strong>
        </p>

        {/* Descripción en 3 líneas exactas en blanco puro */}
        <p className="text-xs sm:text-sm text-white font-normal leading-relaxed mt-2.5 max-w-[340px]">
          Desde hoy, tenés una nueva herramienta que<br />
          te facilitará el trabajo diario y te ayudará a<br />
          tomar mejores decisiones!
        </p>
      </div>

      {/* 5. PANEL BLANCO INFERIOR (ESQUINAS DE 50px) */}
      <div 
        className="rounded-t-[50px] bg-white !bg-white w-full pt-8 pb-6 px-7 sm:px-8 max-w-[460px] mx-auto relative z-20 shadow-none text-left"
        style={{ backgroundColor: '#ffffff' }}
      >
        {/* Título y subtítulo */}
        <h2 className="text-[#4B5563] text-xl font-bold text-left leading-snug">
          Es sencillo...
        </h2>
        <p className="text-xs text-[#9CA3AF] text-left mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
          Ingresá tu correo electrónico para continuar
        </p>

        {/* Banner de error */}
        {claimError && (
          <div className="mt-3.5 w-full p-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs flex items-center gap-2 text-left">
            <AlertCircle size={15} className="shrink-0 text-red-500" />
            <span className="flex-1 font-medium">{claimError}</span>
          </div>
        )}

        {/* Banner de éxito */}
        {claimSuccess && (
          <div className="mt-3.5 w-full p-3.5 bg-emerald-50 border border-[#019F3A]/30 rounded-2xl text-emerald-800 text-xs flex items-center gap-2.5 text-left">
            <CheckCircle2 size={20} className="text-[#019F3A] shrink-0" />
            <div>
              <p className="font-bold text-xs">¡Complejo vinculado con éxito!</p>
              <p className="text-[10.5px] text-emerald-700 mt-0.5">
                Entrando al panel de administración...
              </p>
            </div>
          </div>
        )}

        {/* Botón de Google tipo píldora */}
        {!claimSuccess && (
          <div className="w-full mt-4">
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleAction}
              style={{ backgroundColor: '#ffffff' }}
              className="rounded-full py-3.5 border border-gray-200/90 hover:bg-gray-50 flex items-center justify-center gap-3 w-full cursor-pointer transition-all active:scale-[0.99] disabled:opacity-50 !bg-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={18} className="animate-spin text-gray-500" />
                  <span className="text-sm font-semibold text-gray-700">
                    {isSigningIn ? 'Iniciando sesión...' : 'Vinculando complejo...'}
                  </span>
                </>
              ) : (
                <>
                  <GoogleIcon />
                  <span className="text-sm text-gray-800 font-normal">
                    Inicia sesión con <strong className="font-bold text-gray-800">Google</strong>
                  </span>
                </>
              )}
            </button>

            {user && (
              <div className="mt-2 flex items-center justify-between px-2 text-[11px] text-[#888888]">
                <span className="truncate max-w-[210px] sm:max-w-[250px]">
                  Sesión: <strong className="text-[#555555]">{user.email}</strong>
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="text-[#019F3A] hover:underline cursor-pointer shrink-0 ml-2"
                >
                  Cambiar cuenta
                </button>
              </div>
            )}
          </div>
        )}

        {/* Aviso legal al pie: 3 líneas en gris claro y links en turquesa #249F87 sin cursiva */}
        <div className="mt-4 text-center text-[10.5px] leading-relaxed text-[#A0A0A0]">
          <p>
            Al continuar, tu cuenta de Google quedará<br />
            vinculada con <strong className="font-bold text-[#6B7280]">{displayComplexName}</strong> y aceptas nuestros<br />
            <a 
              href="#terminos" 
              onClick={(e) => { e.preventDefault(); setLegalModal('terms'); }}
              className="font-semibold text-[#249F87] hover:underline cursor-pointer"
            >
              Términos y Condiciones
            </a>
            {' '}y{' '}
            <a 
              href="#privacidad" 
              onClick={(e) => { e.preventDefault(); setLegalModal('privacy'); }}
              className="font-semibold text-[#249F87] hover:underline cursor-pointer"
            >
              Políticas de Privacidad
            </a>
          </p>
        </div>
      </div>

      {/* Modal interactivo de Términos / Privacidad */}
      {legalModal && (
        <div 
          className="fixed inset-0 z-50 !bg-white flex flex-col p-6 overflow-y-auto"
          style={{ backgroundColor: '#ffffff' }}
        >
          <button
            type="button"
            onClick={() => setLegalModal(null)}
            className="absolute top-6 left-6 text-gray-800 p-1 cursor-pointer hover:opacity-75 transition-opacity"
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
                  ? 'Al utilizar la plataforma Jogo para complejos deportivos, usted acepta cumplir con los términos de servicio, confidencialidad y condiciones de administración del complejo.'
                  : 'Jogo se compromete a proteger la privacidad y seguridad de sus datos y los de su complejo deportivo, utilizándolos exclusivamente para la gestión operativa y administrativa.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
