import { useEffect, useState } from 'react';
import Modal from './Modal';
import './ErrorPopup.css';

const errorEvent = 'luma:error';

export function showErrorPopup(message: string) {
  window.dispatchEvent(new CustomEvent<string>(errorEvent, { detail: message }));
}

export default function ErrorPopup() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const showError = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    const showInvalidField = (event: Event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (target.validationMessage) setMessage(target.validationMessage);
    };
    const showUnhandledError = (event: ErrorEvent) => setMessage(event.message || 'Something went wrong. Please try again.');
    const showUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      setMessage(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.');
    };
    window.addEventListener(errorEvent, showError);
    document.addEventListener('invalid', showInvalidField, true);
    window.addEventListener('error', showUnhandledError);
    window.addEventListener('unhandledrejection', showUnhandledRejection);
    return () => {
      window.removeEventListener(errorEvent, showError);
      document.removeEventListener('invalid', showInvalidField, true);
      window.removeEventListener('error', showUnhandledError);
      window.removeEventListener('unhandledrejection', showUnhandledRejection);
    };
  }, []);

  return <Modal isOpen={message !== null} onClose={() => setMessage(null)} className="error-popup-modal">
    <h2 className="handwritten">Error!</h2>
    <p>{message}</p>
    <button type="button" onClick={() => setMessage(null)}>Okay</button>
  </Modal>;
}