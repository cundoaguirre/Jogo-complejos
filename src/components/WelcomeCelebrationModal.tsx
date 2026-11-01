import React, { useEffect } from 'react';
import { X, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';

interface WelcomeCelebrationModalProps {
  userName: string;
  complexName: string;
  onClose: () => void;
}

export const WelcomeCelebrationModal: React.FC<WelcomeCelebrationModalProps> = ({
  userName,
  complexName,
  onClose
}) => {
  // Reproducción de sonido de éxito con fallback
  useEffect(() => {
    let isCancelled = false;

    const playSuccessSound = async () => {
      try {
        const audio = new Audio('/sounds/efectosonidoexito.mp3');
        audio.volume = 0.8;
        await audio.play().catch(async () => {
          if (isCancelled) return;
          const fallback = new Audio('/efectosonidoexito.mp3');
          fallback.volume = 0.8;
          await fallback.play();
        });
      } catch (err) {
        // Ignorar bloqueos de autoplay de navegadores sin interrumpir la UI
        console.info('Audio autoplay prevented by browser policy:', err);
      }
    };

    playSuccessSound();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs select-none">
      <style>{`
        @keyframes celebrationSlideUp {
          0% {
            opacity: 0;
            transform: translateY(32px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .celebration-modal-anim {
          animation: celebrationSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <div className="celebration-modal-anim relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden text-center p-6 sm:p-8">
        {/* Botón cerrar */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo de Jogo */}
        <div className="mx-auto w-20 h-20 rounded-2xl overflow-hidden shadow-md shadow-[#129D44]/20 mb-5 border border-gray-100">
          <img
            src="/Logo-jogo-verde.jpg"
            alt="Jogo"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Badge de éxito */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#129D44] text-xs font-bold mb-3 border border-emerald-100">
          <Sparkles className="w-3.5 h-3.5 fill-[#129D44]" />
          <span>¡Complejo Vinculado con Éxito!</span>
        </div>

        {/* Título de bienvenida */}
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight leading-tight mb-2">
          ¡Bienvenido, {userName}!
        </h2>

        {/* Subtítulo con nombre del complejo */}
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
          Ya sos el administrador oficial de{' '}
          <span className="font-bold text-gray-900">{complexName}</span>. Tu cuenta está lista para gestionar turnos, ventas y canchas.
        </p>

        {/* Mini lista de confirmación de funcionalidades listas */}
        <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2.5 mb-6 border border-gray-100 text-xs sm:text-sm text-gray-700">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#129D44] shrink-0" />
            <span>Canchas y grilla de horarios disponibles</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#129D44] shrink-0" />
            <span>Punto de venta y caja en tiempo real</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#129D44] shrink-0" />
            <span>Sincronización multi-dispositivo activa</span>
          </div>
        </div>

        {/* Botón principal */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 px-6 rounded-full bg-[#129D44] hover:bg-[#0f853a] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-[#129D44]/30 transition-all cursor-pointer active:scale-[0.98]"
        >
          <span>Comenzar a gestionar</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
