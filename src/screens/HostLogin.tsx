import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createHost, loginHost } from '../services/dataService';
import { saveHostCode, generateHostCode } from '../utils/hostAuth';
import './HostLogin.css';

const HostLogin: React.FC = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
      setError(err instanceof Error ? err.message : 'Invalid host code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewCode = async () => {
    setError(null);
    setIsLoading(true);
    
    try {
      let newCode: string;
      let attempts = 0;
      const maxAttempts = 10;
      
      // Try to generate a unique code
      while (attempts < maxAttempts) {
        newCode = generateHostCode();
        
        try {
          // Attempt to create the host code in the backend
          await createHost(newCode);
          
          // Success! Set the code in the UI
          setCode(newCode);
          console.log('[HostLogin] Generated new host code:', newCode);
          return;
        } catch (err: any) {
          // If code already exists, try again
          if (err.message?.includes('already exists')) {
            attempts++;
            continue;
          }
          // Other error, throw it
          throw err;
        }
      }
      
      throw new Error('Failed to generate unique host code. Please try again.');
    } catch (err) {
      console.error('[HostLogin] Failed to create host code:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate host code');
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
            <small>Enter your existing code or generate a new one below</small>
          </div>

          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
            </div>
          )}

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

        <div className="divider">or</div>

        <button 
          type="button"
          className="secondary-button"
          onClick={handleCreateNewCode}
          disabled={isLoading}
        >
          Generate New Host Code
        </button>

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
