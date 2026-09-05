import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginHost } from '../services/dataService';
import { saveHostCode } from '../utils/hostAuth';
import { showErrorPopup } from '../components/ErrorPopup';
import './HostLogin.css';

const HostLogin: React.FC = () => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const cleanCode = code.trim().toUpperCase();
      
      if (!cleanCode) {
        throw new Error('Please enter a host code');
      }

      if (cleanCode.length !== 6) {
        throw new Error('Host code must be exactly 6 characters');
      }

      // Verify the code exists in the backend
      await loginHost(cleanCode);
      
      // Save to localStorage for session persistence
      saveHostCode(cleanCode);
      
      // Success - redirect to events list
      navigate('/host');
    } catch (err) {
      console.error('[HostLogin] Login failed:', err);
      showErrorPopup(err instanceof Error ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="host-login">
      <div className="login-container">
        <h1 className="handwritten">Host Login</h1>
        <p className="login-subtitle">
          Enter your host code to manage your events
        </p>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="hostCode">Host Code</label>
            <input
              type="text"
              id="hostCode"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-character code"
              maxLength={6}
              required
              disabled={isLoading}
              autoComplete="off"
              className="code-input"
            />
            <small>Enter the six-character code provided by your administrator.</small>
          </div>

          <div className="form-actions">
            <button 
              type="submit" 
              className="primary-button"
              disabled={isLoading || code.length !== 6}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </div>
        </form>

        <div className="help-section">
          <h3>What's a Host Code?</h3>
          <p>
            Your host code is a unique 6-character ID that lets you access and manage
            your events. Save it securely - you'll need it every time you want to view
            your event dashboards.
          </p>
        </div>
      </div>
    </div>
  );
};

export default HostLogin;
