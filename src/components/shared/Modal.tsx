import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  id: string;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md';
  width?: number | string;
  fitContent?: boolean;
}

export default function Modal({ id, title, isOpen, onClose, children, size, width, fitContent }: ModalProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const modalStyle = {
    ...(size === 'sm' ? { maxWidth: 400 } : null),
    ...(fitContent ? { width: 'fit-content', maxWidth: 'fit-content' } : null),
    ...(width != null
      ? { width: typeof width === 'number' ? `${width}px` : width, maxWidth: typeof width === 'number' ? `${width}px` : width }
      : null),
  };

  return (
    <div
      id={id}
      className={`modal-overlay${isOpen ? ' open' : ''}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`modal${size === 'sm' ? ' confirm-dialog' : ''}`}
        onClick={e => e.stopPropagation()}
        style={Object.keys(modalStyle).length > 0 ? modalStyle : undefined}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
