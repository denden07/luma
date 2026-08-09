import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Message.css';

const Message: React.FC = () => {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Submit message to backend
    console.log('Message submitted:', { name, message });
    setSubmitted(true);
    
    setTimeout(() => {
      navigate('/');
    }, 2000);
  };

  const handleSkip = () => {
    navigate('/');
  };

  if (submitted) {
    return (
      <div className="message-screen">
        <div className="message-content">
          <div className="heart-icon">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          
          <h2 className="message-title handwritten">thank you!</h2>
          <p className="message-subtitle">your message is saved ♥</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-screen">
      <button className="back-button" onClick={handleSkip}>
        ← BACK
      </button>

      <div className="message-content">
        <div className="heart-icon">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </div>

        <h2 className="message-title handwritten">leave a little<br />message?</h2>

        <p className="message-description">
          share your name and a short<br />
          message for the couple
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            className="message-input"
            placeholder="your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
          />

          <textarea
            className="message-textarea"
            placeholder="your message... (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={500}
          />

          <button type="submit" className="primary-button">
            SEND ♥
          </button>
        </form>
      </div>
    </div>
  );
};

export default Message;
