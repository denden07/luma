import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './NameEntry.css';

interface NameEntryProps {
  onNameSubmit: (name: string) => void;
}

const NameEntry: React.FC<NameEntryProps> = ({ onNameSubmit }) => {
  const [name, setName] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onNameSubmit(name.trim());
      navigate('../camera');
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
          />

          <button 
            type="submit" 
            className="primary-button"
            disabled={!name.trim()}
          >
            START CAMERA
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
