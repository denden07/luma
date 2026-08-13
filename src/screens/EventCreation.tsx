import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { createEvent } from '../services/apiService';
import { getHostCode, clearHostCode } from '../utils/hostAuth';
import './EventCreation.css';

const QRCodeCanvas: React.FC<{ value: string; size?: number }> = ({ value, size = 256 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 2,
        errorCorrectionLevel: 'H',
      }).catch((err) => {
        console.error('Error generating QR code:', err);
      });
    }
  }, [value, size]);

  return <canvas ref={canvasRef} />;
};

const EventCreation: React.FC = () => {
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [guestLimit, setGuestLimit] = useState(50);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsCreating(true);

    try {
      const hostCode = getHostCode();
      if (!hostCode) {
        throw new Error('No host code found. Please log in again.');
      }

      const event = await createEvent(eventName, eventDate, guestLimit, hostCode);
      console.log('[EventCreation] Event created:', event);
      setCreatedEventId(event.id);
      setIsCreating(false);
    } catch (err) {
      console.error('[EventCreation] Failed to create event:', err);
      setError(err instanceof Error ? err.message : 'Failed to create event');
      setIsCreating(false);
    }
  };

  const getShareableLink = () => {
    if (!createdEventId) return '';
    return `${window.location.origin}/e/${createdEventId}`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(getShareableLink());
      alert('Link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout? Make sure you have saved your host code!')) {
      clearHostCode();
      navigate('/host/login');
    }
  };

  if (createdEventId) {
    return (
      <div className="event-creation">
        <div className="success-container">
          <div className="success-icon">✓</div>
          <h1 className="handwritten">Event Created!</h1>
          <p className="event-name">{eventName}</p>
          
          <div className="share-section">
            <h2>Share this QR code with guests:</h2>
            <div className="qr-code-container">
              <QRCodeCanvas value={getShareableLink()} size={256} />
            </div>
            <p className="qr-instructions">Guests can scan this to join the event</p>
            
            <button className="copy-button" onClick={copyToClipboard}>
              📋 Copy Link
            </button>
          </div>

          <div className="action-buttons">
            <button 
              className="primary-button"
              onClick={() => {
                // Small delay to ensure event is fully saved in database
                setTimeout(() => {
                  navigate(`/host/dashboard/${createdEventId}`);
                }, 500);
              }}
            >
              Go to Dashboard
            </button>
            <button 
              className="secondary-button"
              onClick={() => {
                setCreatedEventId(null);
                setEventName('');
                setEventDate('');
                setGuestLimit(50);
              }}
            >
              Create Another Event
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="event-creation">
      <div className="creation-container">
        <div className="header-with-logout">
          <h1 className="handwritten">Create New Event</h1>
          <button 
            type="button"
            className="logout-link"
            onClick={handleLogout}
            title="Logout"
          >
            Logout
          </button>
        </div>
        <p className="subtitle">Set up your event and get a shareable link for guests</p>

        <form onSubmit={handleSubmit} className="event-form">
          <div className="form-group">
            <label htmlFor="eventName">Event Name *</label>
            <input
              type="text"
              id="eventName"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g., Nina & Aldrin's Wedding"
              required
              disabled={isCreating}
            />
          </div>

          <div className="form-group">
            <label htmlFor="eventDate">Event Date *</label>
            <input
              type="date"
              id="eventDate"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
              disabled={isCreating}
            />
          </div>

          <div className="form-group">
            <label htmlFor="guestLimit">Guest Photo Limit</label>
            <input
              type="number"
              id="guestLimit"
              value={guestLimit}
              onChange={(e) => setGuestLimit(parseInt(e.target.value))}
              min="1"
              max="1000"
              disabled={isCreating}
            />
            <small>Maximum number of photos each guest can take</small>
          </div>

          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
              <p className="error-help">
                Make sure the backend server is running at http://localhost:3000
              </p>
            </div>
          )}

          <div className="form-actions">
            <button 
              type="button" 
              className="secondary-button"
              onClick={() => navigate('/host')}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="primary-button"
              disabled={isCreating || !eventName || !eventDate}
            >
              {isCreating ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventCreation;
