import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

// Simple module-level event bus
type Listener = (t: ToastMessage) => void;
const listeners: Listener[] = [];
let counter = 0;

export function showToast(message: string, type: ToastType = 'success') {
  const msg: ToastMessage = { id: `toast-${++counter}`, message, type };
  listeners.forEach(l => l(msg));
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const listener: Listener = (t) => {
      setToasts(prev => [...prev, t]);
      const timer = setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
        timers.current.delete(t.id);
      }, 3000);
      timers.current.set(t.id, timer);
    };
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  return createPortal(
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
      ))}
    </div>,
    document.body
  );
}
