// Global Error & Crash Reporting Engine
export interface CrashReport {
  id: string;
  timestamp: string;
  type: 'react_error_boundary' | 'uncaught_exception' | 'unhandled_rejection';
  message: string;
  stack?: string;
  componentStack?: string;
  section?: string;
  url: string;
  userAgent: string;
}

declare global {
  interface Window {
    __CRASH_LOGS__: CrashReport[];
    __LAST_CRASH__: CrashReport | null;
    __DUMP_CRASH_LOGS__: () => void;
  }
}

// In-memory crash log storage
if (typeof window !== 'undefined') {
  window.__CRASH_LOGS__ = window.__CRASH_LOGS__ || [];
  window.__LAST_CRASH__ = window.__LAST_CRASH__ || null;
  window.__DUMP_CRASH_LOGS__ = () => {
    console.table(window.__CRASH_LOGS__);
  };
}

export function logCrashReport(
  error: Error | any,
  errorInfo?: { componentStack?: string | null },
  context?: { section?: string; extra?: any }
): CrashReport {
  const timestamp = new Date().toISOString();
  const id = `crash_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  const report: CrashReport = {
    id,
    timestamp,
    type: errorInfo?.componentStack ? 'react_error_boundary' : 'uncaught_exception',
    message: error?.message || String(error),
    stack: error?.stack,
    componentStack: errorInfo?.componentStack || undefined,
    section: context?.section || (typeof window !== 'undefined' ? window.location.pathname : undefined),
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };

  if (typeof window !== 'undefined') {
    window.__CRASH_LOGS__.push(report);
    window.__LAST_CRASH__ = report;
    // Keep max 50 reports
    if (window.__CRASH_LOGS__.length > 50) {
      window.__CRASH_LOGS__.shift();
    }
  }

  // Beautiful, high-visibility console output
  console.group(
    `%c🚨 [CRASH REPORT] %c${report.type.toUpperCase()}%c: ${report.message}`,
    'background: #dc2626; color: white; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'background: #374151; color: #fbbf24; font-weight: bold; padding: 2px 4px; border-radius: 4px; margin-left: 4px;',
    'color: #ef4444; font-weight: 600;'
  );
  
  if (context?.section) {
    console.log('%c📍 Section / View:', 'font-weight: bold; color: #6366f1;', context.section);
  }

  if (report.componentStack) {
    console.log(
      '%c🧩 Component Hierarchy (Culprit):',
      'font-weight: bold; color: #10b981;',
      '\n' + report.componentStack.trim()
    );
  }

  if (report.stack) {
    console.log('%c📜 JavaScript Stack Trace:', 'font-weight: bold; color: #f59e0b;', '\n' + report.stack);
  }

  console.log('%c🕒 Timestamp:', 'color: #9ca3af;', report.timestamp);
  console.log('%cℹ️ Report ID:', 'color: #9ca3af;', report.id);
  console.log('%c💡 Tip: Access all reports via window.__CRASH_LOGS__ or window.__LAST_CRASH__', 'color: #3b82f6; font-style: italic;');
  console.groupEnd();

  return report;
}

// Global window event listeners initialization
export function initializeGlobalErrorListeners() {
  if (typeof window === 'undefined') return;

  // Uncaught JavaScript exceptions
  window.addEventListener('error', (event) => {
    // Ignore benign Vite HMR websocket reconnection noise
    if (event.message && event.message.includes('websocket')) return;

    logCrashReport(
      event.error || new Error(event.message),
      undefined,
      { section: 'window.onerror', extra: { filename: event.filename, lineno: event.lineno, colno: event.colno } }
    );
  });

  // Unhandled Promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logCrashReport(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      undefined,
      { section: 'window.unhandledrejection' }
    );
  });

  console.log(
    '%c🛡️ [Global Error Logger] Initialized and monitoring for unhandled exceptions and component crashes.',
    'color: #10b981; font-weight: bold;'
  );
}
