import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showErrorPopup } from '../components/ErrorPopup';
import './NameEntry.css';

interface NameEntryProps {
  onNameSubmit: (name: string) => Promise<void>;
}

const NameEntry: React.FC<NameEntryProps> = ({ onNameSubmit }) => {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onNameSubmit(name.trim());
      navigate('../camera');
    } catch (submitError) {
      console.error('Could not start participant session:', submitError);
      showErrorPopup('We could not save your name. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="name-entry-screen">
      <div className="name-entry-content">
        <h1 className="name-entry-title handwritten">what's your name?</h1>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            className="name-input"
            placeholder="enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={50}
            disabled={isSubmitting}
          />

          <button 
            type="submit" 
            className="primary-button"
            disabled={!name.trim() || isSubmitting}
          >
            {isSubmitting ? 'STARTING...' : 'START CAMERA'}
          </button>
        </form>

        <p className="name-help-text">
          your name helps us identify<br />
          who took each photo ♥
        </p>
      </div>
    </div>
  );
};

export default NameEntry;
