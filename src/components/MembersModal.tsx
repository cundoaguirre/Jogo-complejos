import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  Users, 
  Link2, 
  Copy, 
  Share2, 
  RefreshCw, 
  Check, 
  Trash2, 
  ShieldCheck, 
  ShieldAlert, 
  UserCheck, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { 
  collection, 
  doc, 
  getDoc,
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ComplexMember, ComplexUserRole } from '../types';

interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  complexId: string;
  complexName?: string;
  isOwner: boolean;
  currentUserId?: string;
}

function generateRandomToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < 16; i++) {
      result += chars[array[i] % chars.length];
    }
  } else {
    result = `${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
  }
  return result;
}

export const MembersModal: React.FC<MembersModalProps> = ({
  isOpen,
  onClose,
  complexId,
  complexName,
  isOwner,
  currentUserId
}) => {
  const [members, setMembers] = useState<ComplexMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteEnabled, setInviteEnabled] = useState(false);
  const [inviteToken, setInviteToken] = useState<string>('');
  const [localToken, setLocalToken] = useState<string>('');
  const [isUpdatingInvite, setIsUpdatingInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<ComplexMember | null>(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  const [roleUpdatingUid, setRoleUpdatingUid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // 1. Listen to complex document for member invite settings
  useEffect(() => {
    setInviteError(null);
    if (!isOpen || !complexId) {
      setLocalToken('');
      setInviteToken('');
      return;
    }

    const compRef = doc(db, 'complejos', complexId);
    const unsubComp = onSnapshot(compRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setInviteEnabled(Boolean(data.memberInviteEnabled));
        const remoteToken = data.memberInviteToken || '';
        setInviteToken(remoteToken);
        setLocalToken(remoteToken);
      }
    }, (err) => {
      console.warn('[MembersModal] Error listening to complex settings:', err);
    });

    return () => unsubComp();
  }, [isOpen, complexId]);

  // 2. Listen to members subcollection
  useEffect(() => {
    if (!isOpen || !complexId) return;

    setLoadingMembers(true);
    const membersRef = collection(db, 'complejos', complexId, 'members');
    const unsubMembers = onSnapshot(membersRef, (snap) => {
      const list: ComplexMember[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const rawRole = (data.role || '').toString().toLowerCase().trim();
        const role: ComplexUserRole = (rawRole === 'manager' || rawRole === 'encargado')
          ? 'manager'
          : (rawRole === 'staff')
            ? 'staff'
            : 'owner';

        list.push({
          uid: d.id,
          email: data.email || '',
          displayName: data.displayName || data.email?.split('@')[0] || 'Miembro',
          photoURL: data.photoURL || undefined,
          role,
          joinedAt: data.joinedAt
        });
      });

      // Sort: Owners first, then Managers, then Staff
      list.sort((a, b) => {
        const order: Record<ComplexUserRole, number> = { owner: 1, manager: 2, staff: 3 };
        return order[a.role] - order[b.role];
      });

      setMembers(list);
      setLoadingMembers(false);
    }, (err) => {
      console.warn('[MembersModal] Error loading members:', err);
      setLoadingMembers(false);
    });

    return () => unsubMembers();
  }, [isOpen, complexId]);

  if (!isOpen) return null;

  const effectiveToken = localToken || inviteToken;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteUrl = effectiveToken ? `${origin}/invite/member-${complexId}-${effectiveToken}` : '';

  // Toggle invite link enabled / disabled
  const handleToggleInvite = async () => {
    if (!isOwner || isUpdatingInvite) return;
    setIsUpdatingInvite(true);
    setInviteError(null);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const compRef = doc(db, 'complejos', complexId);
      const newEnabled = !inviteEnabled;
      const updates: any = {
        memberInviteEnabled: newEnabled,
        updatedAt: serverTimestamp()
      };

      if (newEnabled && !effectiveToken) {
        const freshToken = generateRandomToken();
        updates.memberInviteToken = freshToken;
      }

      await Promise.race([
        updateDoc(compRef, updates),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            const timeoutErr: any = new Error('Tiempo de espera agotado (5s)');
            timeoutErr.code = 'timeout';
            reject(timeoutErr);
          }, 5000);
        })
      ]);

      if (updates.memberInviteToken) {
        setLocalToken(updates.memberInviteToken);
        setInviteToken(updates.memberInviteToken);
      }
      setInviteEnabled(newEnabled);
    } catch (err: any) {
      console.error('[MembersModal] Error updating invite toggle:', err);
      setInviteError(`Error (${complexId}): ${err?.code || ''} - ${err?.message || err}`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsUpdatingInvite(false);
    }
  };

  // Reset / Regenerate invite token
  const handleResetToken = async () => {
    if (!isOwner || isUpdatingInvite) return;
    setIsUpdatingInvite(true);
    setInviteError(null);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const current = localToken || inviteToken;
      let freshToken = generateRandomToken();
      if (current && freshToken === current) {
        freshToken = `${generateRandomToken()}${Date.now().toString(36)}`;
      }
      const compRef = doc(db, 'complejos', complexId);
      await Promise.race([
        updateDoc(compRef, {
          memberInviteToken: freshToken,
          memberInviteEnabled: true,
          updatedAt: serverTimestamp()
        }),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            const timeoutErr: any = new Error('Tiempo de espera agotado (5s)');
            timeoutErr.code = 'timeout';
            reject(timeoutErr);
          }, 5000);
        })
      ]);
      setLocalToken(freshToken);
      setInviteToken(freshToken);
      setInviteEnabled(true);
    } catch (err: any) {
      console.error('[MembersModal] Error regenerating token:', err);
      setInviteError(`Error (${complexId}): ${err?.code || ''} - ${err?.message || err}`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsUpdatingInvite(false);
    }
  };

  // Share or copy link
  const handleShareLink = async () => {
    if (!inviteUrl) return;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Invitación a ${complexName || 'Complejo'}`,
          text: `Sumate como Staff a nuestro equipo de trabajo en Jogo:`,
          url: inviteUrl
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    // Fallback to clipboard
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err) {
      console.warn('[MembersModal] Clipboard write failed:', err);
    }
  };

  // Change member role
  const handleChangeRole = async (targetUid: string, newRole: ComplexUserRole) => {
    if (!isOwner) return;
    setRoleUpdatingUid(targetUid);
    setErrorMsg(null);
    try {
      const memberRef = doc(db, 'complejos', complexId, 'members', targetUid);
      await updateDoc(memberRef, {
        role: newRole,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      console.error('[MembersModal] Error changing role:', err);
      setErrorMsg('No se pudo actualizar el rol del miembro.');
    } finally {
      setRoleUpdatingUid(null);
    }
  };

  // Remove / Kick member
  const handleConfirmDeleteMember = async () => {
    if (!memberToDelete || !isOwner) return;
    setIsDeletingMember(true);
    setErrorMsg(null);
    try {
      const targetUid = memberToDelete.uid;

      // 1. Delete from members subcollection
      const memberRef = doc(db, 'complejos', complexId, 'members', targetUid);
      await deleteDoc(memberRef);

      // 2. Clean complexId from collaborators/{targetUid}
      try {
        const colabRef = doc(db, 'collaborators', targetUid);
        const colabSnap = await getDoc(colabRef);
        if (colabSnap.exists()) {
          const data = colabSnap.data() || {};
          const currentMemberships = Array.isArray(data.memberships) ? data.memberships : [];
          const currentComplexIds = Array.isArray(data.complexIds)
            ? data.complexIds
            : currentMemberships.map((m: any) => m?.complexId).filter(Boolean);

          const remainingMemberships = currentMemberships.filter((m: any) => m?.complexId !== complexId);
          const remainingComplexIds = currentComplexIds.filter((id: string) => id && id !== complexId);

          const nextActiveComplexId = remainingComplexIds.length > 0
            ? (data.activeComplexId === complexId ? remainingComplexIds[0] : (data.activeComplexId || remainingComplexIds[0]))
            : '';

          await updateDoc(colabRef, {
            memberships: remainingMemberships,
            complexIds: remainingComplexIds,
            activeComplexId: nextActiveComplexId,
            updatedAt: serverTimestamp()
          });
        }
      } catch (colabErr) {
        console.warn('[MembersModal] Could not clean collaborators doc for removed member:', colabErr);
      }

      setMemberToDelete(null);
    } catch (err: any) {
      console.error('[MembersModal] Error deleting member:', err);
      setErrorMsg('No se pudo eliminar al miembro.');
    } finally {
      setIsDeletingMember(false);
    }
  };

  const ownersCount = members.filter(m => m.role === 'owner').length;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col overflow-y-auto animate-in fade-in duration-200 text-left">
      {/* Header superior */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-2 -ml-1 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            aria-label="Volver atrás"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-tight">
              Miembros
            </h1>
            <p className="text-[11px] sm:text-xs text-gray-400 dark:text-slate-400">
              Gestioná los roles y accesos de tu complejo
            </p>
          </div>
        </div>
      </div>

      {/* Content Body */}
      <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Bloque 1: Enlace de Invitación Reutilizable */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700/60 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-[#129D44] flex items-center justify-center">
                  <Link2 size={16} />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-gray-800 dark:text-white">
                    Enlace de invitación
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">
                    Cualquier persona con este enlace podrá unirse como Staff
                  </p>
                </div>
              </div>

              {/* Switch Toggle */}
              <button
                type="button"
                disabled={!isOwner || isUpdatingInvite}
                onClick={handleToggleInvite}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                  inviteEnabled ? 'bg-[#129D44]' : 'bg-gray-300 dark:bg-slate-700'
                }`}
                role="switch"
                aria-checked={inviteEnabled}
                title={inviteEnabled ? "Desactivar enlace" : "Activar enlace"}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    inviteEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {inviteEnabled ? (
              <div className="space-y-2 pt-1">
                {/* Input box con link y botones de acción */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-gray-600 dark:text-slate-300 font-mono break-all leading-relaxed select-all">
                    {inviteUrl || 'Generando enlace...'}
                  </div>
                  <button
                    type="button"
                    onClick={handleShareLink}
                    disabled={!inviteUrl}
                    className="px-3.5 py-2 rounded-xl bg-[#129D44] hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95 shadow-xs"
                    title="Compartir o copiar enlace"
                  >
                    {copied ? (
                      <>
                        <Check size={14} strokeWidth={2.5} />
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Share2 size={14} />
                        <span>Compartir</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#129D44] animate-pulse" />
                    Enlace activo y listo para usar
                  </span>
                  {isOwner && (
                    <button
                      type="button"
                      disabled={isUpdatingInvite}
                      onClick={handleResetToken}
                      className="text-[11px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                      title="Invalidar enlace actual y generar uno nuevo"
                    >
                      <RefreshCw size={11} className={isUpdatingInvite ? "animate-spin" : ""} />
                      <span>Restablecer enlace</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 dark:text-slate-500 italic pt-1">
                El enlace de invitación está pausado. Activá el interruptor para permitir que nuevos miembros se unan.
              </p>
            )}

            {inviteError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0 text-red-500" />
                <span className="break-all">{inviteError}</span>
              </div>
            )}
          </div>

          {/* Bloque 2: Lista de Miembros */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wider">
                Miembros registrados ({members.length})
              </h3>
              {loadingMembers && (
                <Loader2 size={14} className="animate-spin text-gray-400" />
              )}
            </div>

            <div className="divide-y divide-gray-100 dark:divide-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
              {members.map((member) => {
                const isSelf = member.uid === currentUserId;
                const isOnlyOwner = member.role === 'owner' && ownersCount <= 1;
                const canModifyRole = isOwner && !isOnlyOwner;
                const canDelete = isOwner && !isSelf && !isOnlyOwner;

                return (
                  <div 
                    key={`member-row-${member.uid}`}
                    className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-gray-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Avatar y Datos del Usuario */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {member.photoURL ? (
                        <img 
                          src={member.photoURL} 
                          alt={member.displayName || 'Miembro'} 
                          className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-slate-700 shrink-0" 
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-[#129D44] font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200/50 dark:border-emerald-800/50">
                          {member.displayName?.[0]?.toUpperCase() || member.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                            {member.displayName}
                          </span>
                          {isSelf && (
                            <span className="text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-500 px-1.5 py-0.2 rounded-md">
                              Tú
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 dark:text-slate-400 truncate">
                          {member.email}
                        </p>
                      </div>
                    </div>

                    {/* Selector de Rol y Botón de Eliminar */}
                    <div className="flex items-center gap-2 shrink-0">
                      {canModifyRole ? (
                        <select
                          value={member.role}
                          disabled={roleUpdatingUid === member.uid}
                          onChange={(e) => handleChangeRole(member.uid, e.target.value as ComplexUserRole)}
                          className="text-xs font-semibold rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 py-1.5 px-2.5 outline-none cursor-pointer focus:ring-1 focus:ring-[#129D44]"
                        >
                          <option value="owner">Propietario</option>
                          <option value="manager">Encargado</option>
                          <option value="staff">Staff</option>
                        </select>
                      ) : (
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                          member.role === 'owner' 
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-[#129D44]' 
                            : member.role === 'manager'
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300'
                        }`}>
                          {member.role === 'owner' ? 'Propietario' : member.role === 'manager' ? 'Encargado' : 'Staff'}
                        </span>
                      )}

                      {/* Botón de expulsar miembro */}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setMemberToDelete(member)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
                          title="Eliminar miembro"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {!loadingMembers && members.length === 0 && (
                <div className="py-8 text-center text-xs text-gray-400">
                  No hay miembros registrados todavía.
                </div>
              )}
            </div>
          </div>

        {/* Modal de Confirmación para Expulsar Miembro */}
        {memberToDelete && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 max-w-sm w-full text-center border border-gray-100 dark:border-slate-800 shadow-xl space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>
              <div>
                <h4 className="text-base font-bold text-gray-900 dark:text-white">
                  ¿Eliminar a {memberToDelete.displayName}?
                </h4>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Esta acción revocará de inmediato el acceso de este usuario a este complejo.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeletingMember}
                  onClick={() => setMemberToDelete(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeletingMember}
                  onClick={handleConfirmDeleteMember}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isDeletingMember ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <span>Eliminar</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
