import { useEffect, useState } from 'react';
import Modal from './Modal';
import './CopySuccessPopup.css';

const copySuccessEvent = 'luma:copy-success';

export function showCopySuccessPopup(message = 'Copied to clipboard.') {
  window.dispatchEvent(new CustomEvent<string>(copySuccessEvent, { detail: message }));
}

export default function CopySuccessPopup() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const showSuccess = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener(copySuccessEvent, showSuccess);
    return () => window.removeEventListener(copySuccessEvent, showSuccess);
  }, []);

  return <Modal isOpen={message !== null} onClose={() => setMessage(null)} className="copy-success-popup">
    <h2 className="handwritten">Copied</h2>
    <p>{message}</p>
    <button type="button" onClick={() => setMessage(null)}>Done</button>
  </Modal>;
}