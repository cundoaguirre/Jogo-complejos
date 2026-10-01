import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  writeBatch, 
  serverTimestamp 
} from 'firebase/firestore';
import { signInWithPopup } from 'firebase/auth';
import { db, auth, googleProvider } from '../lib/firebase';
import { useFirebase } from './FirebaseContext';
import { 
  ShieldCheck, 
  Sparkles, 
  Building2, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  ArrowLeft,
  Calendar,
  Lock,
  Layers,
  KeyRound
} from 'lucide-react';

interface ActivationViewProps {
  initialCode?: string;
  onSuccess: (complexId: string, complexName: string) => void;
  onNavigateHome: () => void;
  isDarkMode?: boolean;
}

type ActivationState = 
  | 'idle_input'
  | 'verifying'
  | 'not_found'
  | 'already_activated'
  | 'ready_to_claim'
  | 'activating'
  | 'activated_success';

export const ActivationView: React.FC<ActivationViewProps> = ({
  initialCode = '',
  onSuccess,
  onNavigateHome,
  isDarkMode = false
}) => {
  const { user, setActiveComplexId, reloadCollaboratorData } = useFirebase();

  const [inputCode, setInputCode] = useState(initialCode);
  const [status, setStatus] = useState<ActivationState>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [complexData, setComplexData] = useState<any | null>(null);
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);

  // Extract or verify code from prop or search params
  const verifyCode = async (codeToVerify: string) => {
    const trimmed = codeToVerify.trim();
    if (!trimmed) {
      setStatus('idle_input');
      return;
    }

    setStatus('verifying');
    setErrorMessage('');

    try {
      // Query canonical collection complejos where activationCode == codigo.trim()
      const complexesRef = collection(db, 'complejos');
      const q = query(complexesRef, where('activationCode', '==', trimmed));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setStatus('not_found');
        setErrorMessage('Código inválido o inexistente');
        setComplexData(null);
        return;
      }

      const complexDoc = snapshot.docs[0];
      const data = { id: complexDoc.id, ...complexDoc.data() } as any;
      setComplexData(data);

      if (data.isActivated === true) {
        setStatus('already_activated');
      } else {
        setStatus('ready_to_claim');
      }
    } catch (err: any) {
      console.error('[Activation] Error querying Firestore complejos:', err);
      setStatus('not_found');
      setErrorMessage(err.message || 'Error al conectar con la base de datos de activación.');
    }
  };

  useEffect(() => {
    // If an initial code was passed, verify immediately
    if (initialCode) {
      verifyCode(initialCode);
    } else {
      setStatus('idle_input');
    }
  }, [initialCode]);

  // Step 3: Transactional mutation using writeBatch upon Google Sign-In
  const handleClaimWithGoogle = async () => {
    if (!complexData || !complexData.id) return;

    setIsProcessingAuth(true);
    setStatus('activating');

    try {
      let currentUser = auth.currentUser;

      // If user is not yet logged in with Google, trigger popup
      if (!currentUser) {
        const result = await signInWithPopup(auth, googleProvider);
        currentUser = result.user;
      }

      if (!currentUser) {
        throw new Error('No se pudo autenticar el usuario con Google.');
      }

      // Execute writeBatch as specified:
      const batch = writeBatch(db);

      // 1. docRefComplejo = doc(db, 'complejos', complexData.id)
      const docRefComplejo = doc(db, 'complejos', complexData.id);
      batch.update(docRefComplejo, {
        isActivated: true,
        ownerUid: currentUser.uid,
        ownerEmail: currentUser.email || '',
        activatedAt: serverTimestamp()
      });

      // 2. docRefColaborador = doc(db, 'collaborators', currentUser.uid)
      const docRefColaborador = doc(db, 'collaborators', currentUser.uid);
      batch.set(docRefColaborador, {
        uid: currentUser.uid,
        email: currentUser.email || '',
        name: currentUser.displayName || '',
        photoURL: currentUser.photoURL || '',
        activeComplexId: complexData.id,
        memberships: [
          {
            complexId: complexData.id,
            complexName: complexData.name || 'Mi Complejo',
            role: 'owner'
          }
        ],
        createdAt: serverTimestamp()
      }, { merge: true });

      // 3. await batch.commit()
      await batch.commit();

      // Step 4: Redirection and state setup
      setActiveComplexId(complexData.id);
      try {
        localStorage.setItem('activeComplexId', complexData.id);
      } catch (e) {}

      await reloadCollaboratorData();

      setStatus('activated_success');

      // Short delay for user delight before returning to main grid
      setTimeout(() => {
        onSuccess(complexData.id, complexData.name || 'Complejo');
      }, 1200);

    } catch (err: any) {
      console.error('[Activation] Error during transactional batch commit:', err);
      setIsProcessingAuth(false);
      setStatus('ready_to_claim');
      setErrorMessage(err.message || 'Ocurrió un error al activar el complejo con tu cuenta de Google.');
    }
  };

  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim()) {
      verifyCode(inputCode);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8 bg-[#0a101d] text-white relative overflow-hidden select-none">
      {/* Background glow ambiance */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-[#0BA70B]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Brand Header */}
      <div className="mb-6 flex items-center gap-3 z-10">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0BA70B] to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-900/30">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
          <span>JOGO</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 uppercase tracking-widest">
            Partner
          </span>
        </h1>
      </div>

      {/* Main Activation Card */}
      <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl relative z-10 transition-all duration-300">
        
        {/* STATE: Verifying */}
        {status === 'verifying' && (
          <div className="py-12 flex flex-col items-center text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin flex items-center justify-center" />
              <Building2 className="w-7 h-7 text-emerald-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-100">Verificando código de activación...</h3>
              <p className="text-sm text-slate-400">Consultando la base de datos en tiempo real.</p>
            </div>
          </div>
        )}

        {/* STATE: Idle Input (when user lands on /activar without params) */}
        {status === 'idle_input' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-white">Activar Complejo</h2>
              <p className="text-sm text-slate-400">
                Ingresá el código alfanumérico que recibiste para vincular tu complejo a Jogo.
              </p>
            </div>

            <form onSubmit={handleManualCodeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Código de Activación
                </label>
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="Ej: JOGO-YDT50-846"
                  className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-700/80 rounded-2xl text-center text-lg font-mono font-bold tracking-wider text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0BA70B] focus:border-transparent transition-all"
                  autoFocus
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!inputCode.trim()}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#0BA70B] hover:bg-emerald-600 active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
              >
                <span>Validar Código</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onNavigateHome}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver a la pantalla principal</span>
              </button>
            </div>
          </div>
        )}

        {/* STATE: Not Found / Invalid */}
        {status === 'not_found' && (
          <div className="py-4 space-y-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto shadow-inner">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-white">Código inválido o inexistente</h2>
              <div className="p-4 bg-red-950/30 border border-red-800/40 rounded-2xl">
                <p className="text-sm text-red-200 font-medium">
                  El código de activación no es válido o ha expirado.
                </p>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto pt-1">
                Verificá que el link o el código coincida con el proporcionado por el equipo de Jogo.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setInputCode('');
                  setStatus('idle_input');
                  setErrorMessage('');
                }}
                className="w-full py-3 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Ingresar otro código
              </button>

              <button
                type="button"
                onClick={onNavigateHome}
                className="w-full py-2.5 px-5 rounded-2xl text-slate-400 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Ir al inicio
              </button>
            </div>
          </div>
        )}

        {/* STATE: Already Activated */}
        {status === 'already_activated' && (
          <div className="py-4 space-y-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
              <Lock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-white">Este complejo ya fue activado</h2>
              <div className="p-4 bg-amber-950/30 border border-amber-800/40 rounded-2xl">
                <p className="text-sm text-amber-200 font-medium">
                  Este complejo ya fue activado por su propietario. Iniciá sesión con tu cuenta habitual.
                </p>
              </div>
              {complexData?.name && (
                <p className="text-xs font-semibold text-emerald-400 pt-1">
                  Complejo: {complexData.name}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={onNavigateHome}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#0BA70B] hover:bg-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Ir al Panel de Jogo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STATE: Ready to Claim (isActivated === false) */}
        {(status === 'ready_to_claim' || status === 'activating') && complexData && (
          <div className="space-y-6">
            {/* Header badge & formal welcome */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Complejo Verificado</span>
              </div>
              
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                Activar Complejo: {complexData.name || 'Mi Complejo'}
              </h2>
              
              <p className="text-sm md:text-base text-slate-300 font-normal">
                Estás por tomar el control de <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700/50">{complexData.name || 'tu complejo'}</span>
              </p>
            </div>

            {/* Complex summary card */}
            <div className="p-4 md:p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base leading-tight">
                      {complexData.name}
                    </h4>
                    <p className="text-xs text-slate-400">
                      {complexData.address || complexData.phone ? `${complexData.address || ''} ${complexData.phone ? `• ${complexData.phone}` : ''}` : 'Sede deportiva registrada'}
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-mono font-bold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700">
                  {complexData.courts?.length || complexData.courtsCount || 1} {((complexData.courts?.length || complexData.courtsCount || 1) === 1 ? 'cancha' : 'canchas')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Control de agenda 24/7</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Sincronización en vivo</span>
                </div>
              </div>
            </div>

            {/* Error display if any occurred during auth */}
            {errorMessage && (
              <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Prominent Action Button: Comenzar con Google */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleClaimWithGoogle}
                disabled={status === 'activating'}
                className="w-full py-4 px-6 rounded-2xl bg-white hover:bg-slate-100 active:scale-[0.99] text-slate-900 font-bold text-sm md:text-base flex items-center justify-center gap-3 shadow-xl shadow-black/40 transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {status === 'activating' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                    <span>Vinculando complejo con Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Vincular con Google</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-center text-slate-500 leading-normal">
                Al continuar, tu cuenta de Google será registrada como titular administrativo de este complejo en Jogo.
              </p>
            </div>
          </div>
        )}

        {/* STATE: Success */}
        {status === 'activated_success' && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black text-white">¡Activación Exitosa!</h2>
              <p className="text-sm text-emerald-300">
                Tomaste el control de {complexData?.name || 'tu complejo'}.
              </p>
              <p className="text-xs text-slate-400 pt-2">
                Redirigiendo a la grilla principal...
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
