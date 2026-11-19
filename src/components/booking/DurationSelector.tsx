import React from 'react';
import { DURATION_OPTIONS } from '../../lib/scheduleUtils';
import { cn } from '../../lib/utils';

interface DurationSelectorProps {
  durationMinutes: number;
  onChange: (duration: number) => void;
}

const DURATION_LABELS: Record<number, string> = {
  30: '30 min',
  60: '1 hora',
  90: '1h 30m',
};

export const DurationSelector: React.FC<DurationSelectorProps> = ({
  durationMinutes,
  onChange,
}) => {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
        Duración *
      </label>
      <div className="grid grid-cols-3 gap-2.5">
        {DURATION_OPTIONS.map((opt) => {
          const active = durationMinutes === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                'py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-2xs',
                active
                  ? 'bg-[#0f9d42] text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              {DURATION_LABELS[opt] || `${opt} min`}
            </button>
          );
        })}
      </div>
    </div>
  );
};
