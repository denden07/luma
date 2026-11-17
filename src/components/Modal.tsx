import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, className = '', ariaLabel = 'Dialog' }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (isOpen) {
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.body.style.overflow = 'hidden';
      contentRef.current?.focus();
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onCloseRef.current();
        if (event.key === 'Tab' && contentRef.current) {
          const controls = Array.from(contentRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'));
          if (!controls.length) { event.preventDefault(); return; }
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === contentRef.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.removeEventListener('keydown', onKeyDown);
        document.body.style.overflow = '';
        previousFocus?.focus();
      };
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div ref={contentRef} className={`modal-content ${className}`} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
