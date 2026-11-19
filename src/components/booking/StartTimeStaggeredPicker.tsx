import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StartTimeStaggeredPickerProps {
  value: string;
  allSlots: string[];
  availableSlots: string[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (time: string) => void;
}

export const StartTimeStaggeredPicker: React.FC<StartTimeStaggeredPickerProps> = ({
  value,
  allSlots,
  availableSlots,
  disabled = false,
  placeholder = 'Elige un horario',
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 230,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popWidth = Math.max(220, Math.min(260, window.innerWidth - 24));
    const left = Math.max(12, Math.min(rect.right - popWidth, window.innerWidth - popWidth - 12));
    const top = rect.bottom + 6;
    setCoords({ top, left, width: popWidth });
  };

  useLayoutEffect(() => {
    if (isOpen) updatePosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };
    const handleScrollOrResize = () => updatePosition();
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  const availableSet = new Set(availableSlots);
  const onHourSlots = allSlots.filter((t) => t.endsWith(':00'));
  const halfHourSlots = allSlots.filter((t) => t.endsWith(':30'));
  const compactRow = onHourSlots.length > 12;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full h-11 pl-9 pr-3 bg-white dark:bg-slate-800 rounded-2xl shadow-2xs text-xs sm:text-sm font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#0f9d42] disabled:opacity-50 flex items-center justify-between cursor-pointer relative"
      >
        <Clock
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none"
        />
        <span className={cn('truncate', value ? '' : 'text-slate-400')}>
          {value ? `${value} hs` : placeholder}
        </span>
        <ChevronRight
          size={15}
          className={cn(
            'text-slate-400 shrink-0 transition-transform',
            isOpen ? 'rotate-90' : ''
          )}
        />
      </button>

      {isOpen &&
        allSlots.length > 0 &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `calc(100vh - ${coords.top + 12}px)`,
            }}
            className="z-[9999] bg-[#f4f6f7] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-2.5 overflow-y-auto"
          >
            <div className="grid grid-cols-2 gap-x-2 items-start">
              <div className="space-y-1">
                {onHourSlots.map((slot) => {
                  const isAvail = availableSet.has(slot);
                  const isSelected = value === slot;
                  return (
                    <button
                      key={`h_${slot}`}
                      type="button"
                      disabled={!isAvail}
                      onClick={() => {
                        onChange(slot);
                        setIsOpen(false);
                      }}
                      className={cn(
                        'w-full rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs',
                        compactRow ? 'h-6.5' : 'h-7.5',
                        isSelected
                          ? 'bg-[#0f9d42] text-white'
                          : isAvail
                          ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                          : 'bg-white/50 dark:bg-slate-800/40 text-slate-300 dark:text-slate-600 line-through cursor-not-allowed shadow-none'
                      )}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>

              <div className={cn('space-y-1', compactRow ? 'pt-3' : 'pt-3.5')}>
                {halfHourSlots.map((slot) => {
                  const isAvail = availableSet.has(slot);
                  const isSelected = value === slot;
                  return (
                    <button
                      key={`hh_${slot}`}
                      type="button"
                      disabled={!isAvail}
                      onClick={() => {
                        onChange(slot);
                        setIsOpen(false);
                      }}
                      className={cn(
                        'w-full rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs',
                        compactRow ? 'h-6.5' : 'h-7.5',
                        isSelected
                          ? 'bg-[#0f9d42] text-white'
                          : isAvail
                          ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                          : 'bg-white/50 dark:bg-slate-800/40 text-slate-300 dark:text-slate-600 line-through cursor-not-allowed shadow-none'
                      )}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
