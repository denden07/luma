import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { createEvent, getEventsByHostCode } from '../services/apiService';
import { getHostCode, clearHostCode } from '../utils/hostAuth';
import './EventCreation.css';

const QRCodeCanvas: React.FC<{ value: string; canvasRef: React.RefObject<HTMLCanvasElement | null>; size?: number }> = ({ value, canvasRef, size = 256 }) => {

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
  const [eventStart, setEventStart] = useState('');
  const [guestLimit, setGuestLimit] = useState(30);
  const [photoLimit, setPhotoLimit] = useState(20);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [canCreateAnother, setCanCreateAnother] = useState(true);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
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

      const event = await createEvent(eventName, eventStart, guestLimit, hostCode, eventStart, undefined, photoLimit);
      console.log('[EventCreation] Event created:', event);
      setCreatedEventId(event.id);
      const hostEvents = await getEventsByHostCode(hostCode);
      setCanCreateAnother(hostEvents.length < 2);
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

  const downloadQrCode = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${eventName.trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'event'}-qr.png`;
    link.click();
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
              <QRCodeCanvas value={getShareableLink()} canvasRef={qrCanvasRef} size={256} />
            </div>
            <p className="qr-instructions">Guests can scan this to join the event</p>
            
            <button className="copy-button" onClick={copyToClipboard}>
              📋 Copy Link
            </button>
            <button className="copy-button" onClick={downloadQrCode}>
              Download QR Image
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
            {canCreateAnother && (
              <button 
                className="secondary-button"
                onClick={() => {
                  setCreatedEventId(null);
                  setEventName('');
                  setEventStart('');
                  setGuestLimit(30);
                  setPhotoLimit(20);
                }}
              >
                Create Another Event
              </button>
            )}
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
            <label htmlFor="eventStart">Event Date & Time *</label>
            <input
              type="datetime-local"
              id="eventStart"
              value={eventStart}
              onChange={(e) => setEventStart(e.target.value)}
              required
              disabled={isCreating}
            />
          </div>

          <div className="event-limits" aria-label="Event limits">
            <label htmlFor="guestLimit">Guest limit
              <input
                type="number"
                id="guestLimit"
                min="1"
                max="30"
                value={guestLimit}
                onChange={(event) => setGuestLimit(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
                disabled={isCreating}
              />
              <small>Up to 30 guests</small>
            </label>
            <label htmlFor="photoLimit">Photos per guest
              <input
                type="number"
                id="photoLimit"
                min="1"
                max="20"
                value={photoLimit}
                onChange={(event) => setPhotoLimit(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
                disabled={isCreating}
              />
              <small>Up to 20 photos</small>
            </label>
            <small>Each host can create up to two events.</small>
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
              disabled={isCreating || !eventName || !eventStart}
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
