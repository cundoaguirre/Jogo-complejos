import React, { useState, useEffect } from 'react';
import { 
  Link2,
  ArrowLeft,
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
  const { user, reloadCollaboratorData } = useFirebase();

  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<InvitationValidationResult | null>(null);
  const [resolvedComplexName, setResolvedComplexName] = useState<string>('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkToken = async () => {
      setLoading(true);
      setClaimError(null);
      try {
        const res = await validateSaasInvitation(token);
        if (isMounted) {
          setValidation(res);
          const name = res.complexName || (res as any).complejoName || (res.invitation as any)?.complexName || (res.invitation as any)?.complejoName || '';
          if (name) {
            setResolvedComplexName(name);
          }
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('[InviteView] Error validando token:', err);
          setLoading(false);
        }
      }
    };

    checkToken();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleAction = async () => {
    setClaimError(null);
    if (validation && !validation.valid) return;

    let targetUser = auth.currentUser || user;

    if (!targetUser) {
      setIsSigningIn(true);
      try {
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        const cred = await signInWithPopup(auth, googleProvider);
        targetUser = cred.user;
      } catch (err: any) {
        setIsSigningIn(false);
        if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
          setClaimError('No se pudo completar el inicio de sesión con Google.');
        }
        return;
      } finally {
        setIsSigningIn(false);
      }
    }

    if (!targetUser) return;

    setIsClaiming(true);
    try {
      const claimResult = await claimSaasInvitation(token, targetUser, validation?.documentId);
      await reloadCollaboratorData();
      setTimeout(() => {
        onSuccess(claimResult.complexId, claimResult.complexName || resolvedComplexName || 'Complejo');
      }, 900);
    } catch (err: any) {
      console.warn('[InviteView] Error al reclamar invitación:', err);
      setClaimError(err.message || 'Error al vincular el complejo. Intentá nuevamente.');
      setIsClaiming(false);
    }
  };

  const isProcessing = isSigningIn || isClaiming;

  // ---------------------------------------------------------------------------
  // PANTALLA SOBRIA SI EL ENLACE ES INVÁLIDO O EXPIRÓ (SIN NOMBRES INVENTADOS)
  // ---------------------------------------------------------------------------
  if (!loading && validation && !validation.valid) {
    return (
      <div className="min-h-[100dvh] w-full relative flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-950 text-center select-none">
        <button
          type="button"
          onClick={onNavigateHome}
          aria-label="Volver"
          className="absolute top-6 left-6 p-2 text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft size={24} strokeWidth={2.2} />
        </button>

        <p className="text-base sm:text-lg font-medium text-gray-400 dark:text-slate-500">
          Enlace no válido o expirado
        </p>
      </div>
    );
  }

  const displayComplexName = (resolvedComplexName || validation?.complexName || '').trim();

  return (
    <div className="min-h-[100dvh] w-full relative flex flex-col justify-between overflow-x-hidden bg-[#019F3A] select-none font-sans">
      
      {/* 1. SECCIÓN SUPERIOR: FOTO AL NATURAL + OVERLAY VERDE #019F3A AL 14% + DIFUMINADO */}
      <div className="absolute top-0 left-0 right-0 h-[72%] w-full overflow-hidden pointer-events-none z-0">
        <img
          src="/assets/invite-turf-bg.jpg"
          alt="Cancha de fútbol"
          className="w-full h-full object-cover object-top"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.src.includes('0be87cd4.jpg')) {
              target.src = '/assets/aistudio/9b17478566e4541d0358a0917f54a00e_0be87cd4.jpg';
            }
          }}
        />

        {/* Rectángulo verde #019F3A translúcido con pointer-events-none */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: 'rgba(1, 159, 58, 0.16)' }}
        />

        {/* Difuminado suave en la base hacia el verde #019F3A */}
        <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-b from-transparent to-[#019F3A]" />
      </div>

      {/* 2. FLECHA BLANCA DE REGRESO INDEPENDIENTE ARRIBA A LA IZQUIERDA */}
      <button
        type="button"
        onClick={onNavigateHome}
        aria-label="Volver"
        className="absolute top-6 left-6 z-30 text-white hover:opacity-85 transition-opacity p-1 cursor-pointer bg-transparent border-0"
      >
        <ArrowLeft size={26} strokeWidth={2.4} className="text-white" />
      </button>

      {/* 3. LOGO JOGO BLANCO CENTRADO EN 120px EN SU PROPIA FILA */}
      <header className="relative z-20 w-full max-w-md mx-auto pt-10 sm:pt-12 pb-2 flex justify-center items-center">
        <img
          src="/assets/jogo-logo-white.png"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.src.includes('Photoroom')) {
              target.src = '/assets/aistudio/Photoroom-20261027_123311_8fbc6431.png';
            }
          }}
          alt="Jogo"
          className="w-[125px] h-auto object-contain block drop-shadow-xs"
        />
      </header>

      {/* 4. CONTENIDO: CÁPSULA 22px VERDE CLARO, TÍTULO EN 2 LÍNEAS Y TEXTOS BLANCOS */}
      <div className="relative z-10 w-full max-w-md mx-auto px-7 sm:px-8 pt-4 pb-5 flex-1 flex flex-col justify-end">
        {/* Cápsula de 22px de alto en fondo verde claro #EAFBEA */}
        <div className="h-[22px] rounded-full bg-[#EAFBEA] pl-0 pr-2.5 flex items-center gap-1.5 shadow-xs w-fit mb-4">
          <div className="w-[22px] h-[22px] rounded-full bg-[#019F3A] flex items-center justify-center shrink-0">
            <Link2 size={11} strokeWidth={2.5} className="text-white -rotate-45" />
          </div>
          <span className="text-[11px] font-bold text-[#019F3A] tracking-tight leading-none">
            Link de invitación
          </span>
        </div>

        {/* Título Display calibrado en 2 renglones exactos */}
        <h1 className="text-[38px] sm:text-[40px] font-bold text-white leading-[1.0] tracking-tight">
          ¡Felicidades<br />por este gran paso!
        </h1>

        {/* Bienvenida personalizada con el nombre real del complejo (sin crash de insertBefore ni doble coma) */}
        <p className="text-[19px] sm:text-[20px] text-white mt-3.5 font-normal leading-snug">
          <span>Bienvenido a Jogo, </span>
          <strong className="font-bold">{displayComplexName || 'tu complejo'}.</strong>
        </p>

        {/* Descripción en 3 renglones en blanco puro */}
        <p className="text-[15px] sm:text-[16px] text-white font-normal leading-relaxed mt-2.5 max-w-[360px]">
          Desde hoy, tenés una nueva herramienta que<br />
          te facilitará el trabajo diario y te ayudará a<br />
          tomar mejores decisiones!
        </p>
      </div>

      {/* 5. PANEL BLANCO INFERIOR (ESQUINAS DE 50px Y AIRE EN LA BASE PB-10) */}
      <div className="relative z-20 w-full bg-white rounded-t-[50px] sm:rounded-t-[55px] pt-7 sm:pt-8 px-7 sm:px-8 pb-10 sm:pb-12 shadow-[0_-10px_35px_rgba(0,0,0,0.06)]">
        <div className="w-full max-w-md mx-auto space-y-4">
          
          {/* Título en gris oscuro y subtítulo en una sola línea */}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#4B5563] tracking-tight">
              Es sencillo...
            </h2>
            <p className="text-xs sm:text-[13px] text-[#9CA3AF] font-normal mt-1 whitespace-nowrap">
              Ingresá tu correo electrónico para continuar
            </p>
          </div>

          {claimError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs flex items-center gap-2">
              <span className="flex-1 font-medium">{claimError}</span>
            </div>
          )}

          {/* Botón de Google redondeado tipo píldora */}
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleAction}
            className="w-full h-13 sm:h-14 py-3.5 px-5 bg-white hover:bg-gray-50 active:scale-[0.99] border border-gray-200 rounded-full flex items-center justify-center gap-3 transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isProcessing ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                <Loader2 size={18} className="animate-spin text-[#0BA70B]" />
                <span>{isSigningIn ? 'Iniciando sesión...' : 'Vinculando complejo...'}</span>
              </div>
            ) : (
              <>
                <GoogleIcon />
                <span className="text-sm sm:text-base font-normal text-gray-800">
                  Inicia sesión con <strong className="font-bold text-gray-900">Google</strong>
                </span>
              </>
            )}
          </button>

          {/* Aviso legal en gris claro y enlaces en verde agua suave #249F87 */}
          <div className="pt-1 text-center">
            <p className="text-[10.5px] sm:text-[11px] text-[#A0A0A0] leading-tight">
              Al continuar, tu cuenta de Google quedará<br />
              vinculada con {displayComplexName ? <strong className="font-bold text-[#6B7280]">{displayComplexName}</strong> : 'tu complejo'} y aceptas nuestros<br />
              <a 
                href="#" 
                onClick={(e) => e.preventDefault()} 
                className="font-semibold text-[#249F87] hover:underline"
              >
                Términos y Condiciones
              </a>
              {' '}y{' '}
              <a 
                href="#" 
                onClick={(e) => e.preventDefault()} 
                className="font-semibold text-[#249F87] hover:underline"
              >
                Políticas de Privacidad
              </a>
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};
