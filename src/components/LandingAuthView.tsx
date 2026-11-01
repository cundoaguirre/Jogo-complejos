import React, { useState } from 'react';
import { 
  AlertCircle, 
  Loader2 
} from 'lucide-react';
import { useFirebase } from './FirebaseContext';

interface LandingAuthViewProps {
  onSignInWithGoogle: () => Promise<any>;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
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

export const LandingAuthView: React.FC<LandingAuthViewProps> = ({
  onSignInWithGoogle
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

      {/* CAPA 2: Contenido interactivo (z-20) */}
      <div className="relative z-20 min-h-[100dvh] w-full flex flex-col justify-between overflow-x-hidden">
        {/* Zona superior/media: Logo oficial de Jogo en blanco, grande y centrado */}
        <div className="flex-1 flex justify-center items-center px-6">
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
            className="w-[220px] sm:w-[240px] h-auto object-contain select-none pointer-events-none drop-shadow-md"
          />
        </div>

        {/* Tarjeta Inferior Blanca */}
        <div 
          className="rounded-t-[34px] !bg-[#FFFFFF] w-full pt-[24px] pb-[36px] sm:pb-[42px] px-[32px] sm:px-[36px] max-w-[460px] mx-auto relative z-20 shadow-none text-left"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          {/* Cabecera de la tarjeta */}
          <h2 className="text-[19px] sm:text-[20px] font-bold !text-[#707070] text-left leading-[1.15] tracking-[-0.015em]">
            Inicia sesión
          </h2>
          <p className="text-[12.5px] sm:text-[13.5px] font-normal !text-[#9E9E9E] text-left mt-[2px] whitespace-nowrap leading-[1.25]">
            Accede a tu cuenta para continuar
          </p>

          {/* Banner de error de autenticación si ocurriese */}
          {authError && (
            <div className="mt-3.5 w-full p-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs flex items-center justify-between gap-2 text-left">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0 text-red-500" />
                <span className="flex-1 font-medium">
                  {authError === 'popup-closed' 
                    ? 'La ventana de inicio de sesión fue cerrada.' 
                    : authError}
                </span>
              </div>
              <button
                type="button"
                onClick={clearAuthError}
                className="text-[10.5px] text-red-500 hover:text-red-700 underline cursor-pointer shrink-0 ml-1"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Botón de Iniciar sesión con Google */}
          <div className="w-full mt-[16px]">
            <button
              type="button"
              disabled={isSigningIn}
              onClick={handleProceedGoogle}
              style={{ backgroundColor: '#FFFFFF' }}
              className="rounded-full w-full h-[48px] sm:h-[52px] !bg-[#FFFFFF] border border-[#E4E4E4] flex items-center justify-center gap-[10px] cursor-pointer hover:bg-gray-50 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isSigningIn ? (
                <>
                  <Loader2 size={18} className="animate-spin text-gray-500" />
                  <span className="text-[14.5px] sm:text-[15px] font-semibold text-gray-700">
                    Iniciando sesión...
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
          </div>
        </div>
      </div>
    </div>
  );
};
