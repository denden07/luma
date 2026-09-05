import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { createEvent, getEventsByHostCode, uploadEventCover } from '../services/dataService';
import { getHostCode } from '../utils/hostAuth';
import { FILTERS, type FilterId } from '../utils/filters';
import { copyTextToClipboard } from '../utils/clipboard';
import Modal from '../components/Modal';
import { showErrorPopup } from '../components/ErrorPopup';
import filterPreviewImage from '../assets/images/pwa_camera_assets/example-filter-photo.jpg';
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
  const [enabledFilters, setEnabledFilters] = useState<FilterId[]>([]);
  const [creationStep, setCreationStep] = useState<1 | 2 | 3>(1);
  const [backgroundPhoto, setBackgroundPhoto] = useState<File | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [canCreateAnother, setCanCreateAnother] = useState(true);
  const [isCopySuccessOpen, setIsCopySuccessOpen] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  const eventStartAsIso = () => {
    const date = new Date(eventStart);
    if (Number.isNaN(date.getTime())) throw new Error('Choose a valid event date and time.');
    return date.toISOString();
  };

  const formatEventStart = () => {
    if (!eventStart) return 'Select date and time';
    const date = new Date(eventStart);
    return Number.isNaN(date.getTime()) ? 'Select date and time' : date.toLocaleString([], {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const hostCode = getHostCode();
      if (!hostCode) {
        throw new Error('No host code found. Please log in again.');
      }

      const startTime = eventStartAsIso();
      let event = await createEvent(eventName, startTime, guestLimit, hostCode, startTime, undefined, photoLimit, enabledFilters);
      if (backgroundPhoto) {
        setIsUploadingBackground(true);
        try {
          event = await uploadEventCover(event.id, hostCode, backgroundPhoto);
        } finally {
          setIsUploadingBackground(false);
        }
      }
      console.log('[EventCreation] Event created:', event);
      setCreatedEventId(event.id);
      const hostEvents = await getEventsByHostCode(hostCode);
      setCanCreateAnother(hostEvents.length < 2);
      setIsCreating(false);
    } catch (err) {
      console.error('[EventCreation] Failed to create event:', err);
      const message = err instanceof Error ? err.message : 'Failed to create event';
      showErrorPopup(message);
      setIsCreating(false);
    }
  };

  const handleDetailsSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    setCreationStep(2);
  };

  const handleFiltersSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enabledFilters.length === 0) {
      showErrorPopup('Choose one filter to continue.');
      return;
    }
    setCreationStep(3);
  };

  const handleBackgroundPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (backgroundPreviewUrl) URL.revokeObjectURL(backgroundPreviewUrl);
    setBackgroundPhoto(file);
    setBackgroundPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const removeBackgroundPhoto = () => {
    if (backgroundPreviewUrl) URL.revokeObjectURL(backgroundPreviewUrl);
    setBackgroundPhoto(null);
    setBackgroundPreviewUrl(null);
  };

  const getShareableLink = () => {
    if (!createdEventId) return '';
    return `${window.location.origin}/e/${createdEventId}`;
  };

  const copyToClipboard = async () => {
    try {
      await copyTextToClipboard(getShareableLink());
      setIsCopySuccessOpen(true);
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
                  setEnabledFilters([]);
                  setCreationStep(1);
                  removeBackgroundPhoto();
                }}
              >
                Create Another Event
              </button>
            )}
          </div>
          <Modal isOpen={isCopySuccessOpen} onClose={() => setIsCopySuccessOpen(false)} className="copy-success-modal">
            <h2 className="handwritten">Link copied</h2>
            <p>The guest link is ready to share.</p>
            <button className="copy-button" onClick={() => setIsCopySuccessOpen(false)}>Done</button>
          </Modal>
        </div>
      </div>
    );
  }

  return (
    <div className="event-creation">
      <div className="creation-container">
        <div className="header-with-logout">
          <h1 className="handwritten">Create New Event</h1>
        </div>
        <p className="subtitle">Set up your event and get a shareable link for guests</p>

        <form onSubmit={creationStep === 1 ? handleDetailsSubmit : creationStep === 2 ? handleFiltersSubmit : handleSubmit} className="event-form">
          <p className="creation-step">Step {creationStep} of 3</p>
          {creationStep === 1 ? <>
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
            <div className="date-time-picker">
              <span className={eventStart ? 'date-time-value' : 'date-time-placeholder'}>{formatEventStart()}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>
              </svg>
              <input
                type="datetime-local"
                id="eventStart"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
                required
                disabled={isCreating}
                aria-label="Event date and time"
              />
            </div>
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
          </> : creationStep === 2 ? <>
          <fieldset className="filter-picker" disabled={isCreating}>
            <legend>Filters</legend>
            <p>Choose the one look guests will use. The preview changes in the camera, while every saved photo remains unfiltered.</p>
            <div className="filter-preview-grid">
              {FILTERS.map(filter => {
                const isSelected = enabledFilters.includes(filter.id);
                return (
                  <label className={`filter-preview ${isSelected ? 'selected' : ''}`} key={filter.id}>
                    <input type="radio" name="event-filter" checked={isSelected} onChange={() => setEnabledFilters([filter.id])} />
                    <img src={filterPreviewImage} alt={`${filter.label} filter preview`} style={{ filter: filter.previewFilter }} />
                    <span>{filter.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          </> : <>
          <div className="background-photo-step">
            <h2>Background Photo</h2>
            <p>Add an optional image for the guest landing page.</p>
            {isUploadingBackground && <p className="background-upload-status" role="status">Uploading background photo...</p>}
            {backgroundPreviewUrl ? (
              <div className="background-preview">
                <img src={backgroundPreviewUrl} alt="Selected landing page background" />
                <button type="button" className="secondary-button" onClick={removeBackgroundPhoto}>Remove photo</button>
              </div>
            ) : (
              <label className="background-photo-picker" htmlFor="backgroundPhoto">
                <span>Choose background photo</span>
                <input id="backgroundPhoto" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleBackgroundPhotoChange} />
              </label>
            )}
            {backgroundPhoto && <small>{backgroundPhoto.name}</small>}
          </div>
          </>}

          <div className="form-actions">
            <button 
              type="button" 
              className="secondary-button"
              onClick={() => creationStep === 1 ? navigate('/host') : setCreationStep(creationStep === 3 ? 2 : 1)}
              disabled={isCreating || isUploadingBackground}
            >
              {creationStep === 1 ? 'Cancel' : 'Back'}
            </button>
            <button 
              type="submit" 
              className="primary-button"
              disabled={isCreating || isUploadingBackground || (creationStep === 1 && (!eventName || !eventStart))}
            >
              {creationStep === 1 ? 'Next: Filters' : creationStep === 2 ? 'Next: Background Photo' : isUploadingBackground ? 'Uploading background...' : isCreating ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventCreation;
