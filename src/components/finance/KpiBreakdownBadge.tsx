import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { ArrowLeftRight, Banknote, CreditCard, QrCode } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { CajaBreakdownBucketKey, CajaBreakdownResult } from '../../lib/financialMath';

interface KpiBreakdownTriggerProps {
  breakdown: CajaBreakdownResult;
  className?: string;
  children: React.ReactNode;
}

function renderMethodIcon(bucketKey: CajaBreakdownBucketKey) {
  switch (bucketKey) {
    case 'cash':
      return <Banknote size={14} className="text-emerald-600 shrink-0" />;
    case 'transfer':
      return <ArrowLeftRight size={14} className="text-sky-600 shrink-0" />;
    case 'card':
      return <CreditCard size={14} className="text-violet-600 shrink-0" />;
    case 'mercado_pago':
      return <QrCode size={14} className="text-cyan-600 shrink-0" />;
  }
}

function formatArs(amount: number): string {
  const rounded = Math.round(Number(amount) || 0);
  return `$${Math.abs(rounded).toLocaleString('es-AR')}`;
}

export const KpiBreakdownTrigger: React.FC<KpiBreakdownTriggerProps> = ({
  breakdown,
  className,
  children
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [openCycle, setOpenCycle] = useState(0);
  const [coords, setCoords] = useState<{
    top: number;
    bottom: number;
    left: number;
    placement: 'top' | 'bottom';
  }>({
    top: 0,
    bottom: 0,
    left: 16,
    placement: 'top'
  });

  const triggerRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<number | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const resetGesture = useCallback(() => {
    clearHoldTimer();
    activePointerIdRef.current = null;
    startPointRef.current = null;
    setIsPressed(false);
    setIsOpen(false);
  }, [clearHoldTimer]);

  const updatePosition = useCallback((pointerPoint?: { x: number; y: number } | null) => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const badgeWidth = 224;
    const isNarrowViewport = window.innerWidth < 640;

    // Posición despejada y sin oclusión por el dedo sobre la tarjeta de Caja
    const shouldOpenAbove = rect.top >= 175;
    let left = rect.left;
    if (isNarrowViewport && pointerPoint) {
      left =
        pointerPoint.x > window.innerWidth * 0.48
          ? 16
          : Math.max(16, window.innerWidth - badgeWidth - 16);
    }
    const clampedLeft = Math.max(
      12,
      Math.min(left, window.innerWidth - badgeWidth - 12)
    );

    const top = Math.max(rect.bottom + 12, (pointerPoint?.y ?? rect.bottom) + 42);
    const bottom = Math.max(12, window.innerHeight - (rect.top - 12));

    setCoords({
      top,
      bottom,
      left: clampedLeft,
      placement: shouldOpenAbove ? 'top' : 'bottom'
    });
  }, []);

  useEffect(() => {
    if (!isPressed && !isOpen) return;

    const handleWindowPointerEnd = (e: PointerEvent) => {
      if (
        activePointerIdRef.current !== null &&
        e.pointerId !== activePointerIdRef.current
      ) {
        return;
      }
      resetGesture();
    };

    const handleGlobalCancel = () => resetGesture();

    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);
    window.addEventListener('blur', handleGlobalCancel);
    window.addEventListener('scroll', handleGlobalCancel, true);
    document.addEventListener('visibilitychange', handleGlobalCancel);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
      window.removeEventListener('blur', handleGlobalCancel);
      window.removeEventListener('scroll', handleGlobalCancel, true);
      document.removeEventListener('visibilitychange', handleGlobalCancel);
    };
  }, [isPressed, isOpen, resetGesture]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
    };
  }, [clearHoldTimer]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    clearHoldTimer();
    const pointerId = e.pointerId;
    const pt = { x: e.clientX, y: e.clientY };

    activePointerIdRef.current = pointerId;
    startPointRef.current = pt;
    setIsPressed(true);

    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (activePointerIdRef.current !== pointerId) return;
      updatePosition(pt);
      setOpenCycle((prev) => prev + 1);
      setIsOpen(true);
    }, 70);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId || !startPointRef.current) {
      return;
    }
    const dx = e.clientX - startPointRef.current.x;
    const dy = e.clientY - startPointRef.current.y;
    if (Math.hypot(dx, dy) > 10) {
      resetGesture();
    }
  };

  const handleTriggerPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      activePointerIdRef.current !== null &&
      e.pointerId !== activePointerIdRef.current
    ) {
      return;
    }
    resetGesture();
  };

  return (
    <div
      ref={triggerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handleTriggerPointerEnd}
      onPointerCancel={handleTriggerPointerEnd}
      onPointerLeave={handleTriggerPointerEnd}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        'relative select-none [touch-action:pan-y] [-webkit-touch-callout:none] [-webkit-user-select:none]',
        className
      )}
    >
      {children}

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <motion.div
            key={`caja-breakdown-badge-${openCycle}`}
            initial={{
              opacity: 0,
              y: coords.placement === 'top' ? 6 : -6,
              scale: 0.96
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              ...(coords.placement === 'top'
                ? { bottom: `${coords.bottom}px` }
                : { top: `${coords.top}px` }),
              left: `${coords.left}px`
            }}
            className="z-[9999] pointer-events-none w-[224px] rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-lg px-3.5 py-3"
          >
            {!breakdown.hasMovements ||
            (breakdown.incomes.length === 0 && breakdown.expenses.length === 0) ? (
              <div className="text-xs font-medium text-slate-600 leading-snug">
                Sin movimientos en caja
              </div>
            ) : (
              <div>
                {breakdown.incomes.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Entrado
                    </div>
                    <div className="space-y-1.5">
                      {breakdown.incomes.map((item) => (
                        <div
                          key={`in-${item.key}`}
                          className="flex items-center justify-between gap-2.5 text-xs leading-tight"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {renderMethodIcon(item.key)}
                            <span className="font-medium text-slate-600 truncate">
                              {item.label}
                            </span>
                          </div>
                          <span className="font-bold tabular-nums text-slate-900 shrink-0">
                            {formatArs(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {breakdown.incomes.length > 0 && breakdown.expenses.length > 0 && (
                  <div className="my-2.5 border-t border-slate-100" />
                )}

                {breakdown.expenses.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Salido
                    </div>
                    <div className="space-y-1.5">
                      {breakdown.expenses.map((item) => (
                        <div
                          key={`out-${item.key}`}
                          className="flex items-center justify-between gap-2.5 text-xs leading-tight"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {renderMethodIcon(item.key)}
                            <span className="font-medium text-slate-600 truncate">
                              {item.label}
                            </span>
                          </div>
                          <span className="font-bold tabular-nums text-red-600 shrink-0">
                            {formatArs(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>,
          document.body
        )}
    </div>
  );
};
