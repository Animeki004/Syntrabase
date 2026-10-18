'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  isExiting?: boolean;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, title?: string) => void;
  addToast: (message: string, type?: ToastType, title?: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
  addToast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<string, { dismissTimer: NodeJS.Timeout; removeTimer: NodeJS.Timeout }>>(new Map());

  const removeToastImmediate = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timers = timersRef.current.get(id);
    if (timers) {
      clearTimeout(timers.dismissTimer);
      clearTimeout(timers.removeTimer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
    );
    const timers = timersRef.current.get(id);
    if (timers) {
      clearTimeout(timers.dismissTimer);
      clearTimeout(timers.removeTimer);
    }
    const removeTimer = setTimeout(() => {
      removeToastImmediate(id);
    }, 320);
    timersRef.current.set(id, {
      dismissTimer: setTimeout(() => {}, 0),
      removeTimer,
    });
  }, [removeToastImmediate]);

  const addToast = useCallback((message: string, type: ToastType = 'info', title?: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastMessage = { id, type, message, title, isExiting: false };

    setToasts((prev) => [...prev, newToast]);

    const dismissTimer = setTimeout(() => {
      dismissToast(id);
    }, 4200);

    const removeTimer = setTimeout(() => {
      removeToastImmediate(id);
    }, 4550);

    timersRef.current.set(id, { dismissTimer, removeTimer });
  }, [dismissToast, removeToastImmediate]);

  const value = {
    toast: addToast,
    addToast,
    success: (msg: string, title?: string) => addToast(msg, 'success', title),
    error: (msg: string, title?: string) => addToast(msg, 'error', title),
    warning: (msg: string, title?: string) => addToast(msg, 'warning', title),
    info: (msg: string, title?: string) => addToast(msg, 'info', title),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => {
          const Icon =
            t.type === 'success'
              ? CheckCircle2
              : t.type === 'error'
              ? AlertCircle
              : t.type === 'warning'
              ? AlertTriangle
              : Info;

          return (
            <div
              key={t.id}
              className={`toast-item toast-${t.type} ${t.isExiting ? 'toast-exiting' : ''}`}
              role="alert"
            >
              <Icon size={18} className="toast-icon" />
              <div className="toast-content">
                {t.title && <div className="toast-title">{t.title}</div>}
                <div className="toast-message">{t.message}</div>
              </div>
              <button
                type="button"
                className="toast-close"
                onClick={() => dismissToast(t.id)}
                aria-label="Close notification"
              >
                <X size={14} />
              </button>
              <div className="toast-progress-track">
                <div className="toast-progress-bar" />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
