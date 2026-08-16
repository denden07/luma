import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { getEvent, getEventPhotos, getPhotoUrl } from '../services/apiService';
import type { Event, PhotoMetadata } from '../services/apiService';
import Modal from '../components/Modal';
import './HostDashboard.css';

const HostDashboard: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [photos, setPhotos] = useState<PhotoMetadata[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoMetadata | null>(null);
  const [filterParticipant, setFilterParticipant] = useState<string>('all');
  const [participants, setParticipants] = useState<string[]>([]);
  const [eventName, setEventName] = useState<string>('');
  const [eventDetails, setEventDetails] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gridColumns, setGridColumns] = useState<1 | 2>(2);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [showFilter, setShowFilter] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[HostDashboard] Component mounted, eventId:', eventId);
    if (eventId) {
      loadEventData();
    } else {
      console.error('[HostDashboard] No event ID provided');
      setError('No event ID provided');
      setIsLoading(false);
    }
  }, [eventId]);

  const loadEventData = async () => {
    if (!eventId) {
      setError('No event ID provided');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[HostDashboard] Loading event data for:', eventId);
      
      // Load event details
      const event = await getEvent(eventId);
      console.log('[HostDashboard] Event loaded:', event);
      setEventName(event.name);
      setEventDetails(event);

      // Load photos from server (photos uploaded from all devices)
      const serverPhotos = await getEventPhotos(eventId);
      console.log('[HostDashboard] Photos loaded:', serverPhotos.length);
      setPhotos(serverPhotos);
      
      // Extract unique participant names
      const uniqueParticipants = Array.from(
        new Set(serverPhotos.map(p => p.participant_name).filter(Boolean))
      ) as string[];
      setParticipants(uniqueParticipants);

      console.log('[HostDashboard] Successfully loaded', serverPhotos.length, 'photos from server for event:', eventId);
    } catch (err) {
      console.error('[HostDashboard] Failed to load event data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load event';
      setError(errorMessage);
      console.error('[HostDashboard] Error details:', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPhotos = filterParticipant === 'all' 
    ? photos 
    : photos.filter(p => p.participant_name === filterParticipant);
  const displayedPhotos = [...filteredPhotos].sort((first, second) => {
    const direction = sortOrder === 'newest' ? -1 : 1;
    return direction * (new Date(first.created_at).getTime() - new Date(second.created_at).getTime());
  });

  const guestLink = eventId ? `${window.location.origin}/e/${eventId}` : '';

  const setQrPreviewCanvas = (canvas: HTMLCanvasElement | null) => {
    qrCanvasRef.current = canvas;
    if (canvas && guestLink) {
      QRCode.toCanvas(canvas, guestLink, {
        width: 132,
        margin: 1,
        errorCorrectionLevel: 'H',
      }).catch((qrError) => console.error('Could not generate QR code:', qrError));
    }
  };

  const copyGuestLink = async () => {
    try {
      await navigator.clipboard.writeText(guestLink);
    } catch (copyError) {
      console.error('Could not copy guest link:', copyError);
    }
  };

  const downloadQrCode = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${eventName || 'event'}-qr.png`;
    link.click();
  };

  const handleDownloadAll = () => {
    filteredPhotos.forEach((photo, index) => {
      setTimeout(() => {
        downloadPhotoFromServer(photo);
      }, index * 200); // Stagger downloads to avoid browser blocking
    });
  };

  const handleDownloadSingle = (photo: PhotoMetadata) => {
    downloadPhotoFromServer(photo);
  };

  const downloadPhotoFromServer = (photo: PhotoMetadata) => {
    const link = document.createElement('a');
    link.href = getPhotoUrl(photo.storage_path);
    link.download = `${photo.participant_name || 'photo'}-${photo.id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Safety check for render
  if (!eventId && !isLoading) {
    return (
      <div className="host-dashboard">
        <div className="dashboard-header">
          <div className="header-content">
            <button 
              className="back-button"
              onClick={() => navigate('/host')}
              aria-label="Back to events list"
              title="Back to events list"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
          </div>
        </div>
        <div className="dashboard-content">
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <h2 className="handwritten">Invalid Event</h2>
            <p>No event ID was provided in the URL.</p>
            <button className="primary-button" onClick={() => navigate('/host')}>
              Back to Events
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="host-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={() => navigate('/host')}
            aria-label="Back to events list"
            title="Back to events list"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <p className="event-name editorial">{eventName || 'Loading...'}</p>
        </div>
        
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
            <button onClick={loadEventData}>Retry</button>
          </div>
        )}

        {!error && !isLoading && (
          <>
            <div className="dashboard-controls">
              <button className="dashboard-icon-button" onClick={() => setShowFilter(!showFilter)} aria-label="Filter photos" title="Filter photos">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M7 12h10m-7 6h4"/></svg>
              </button>
              <button className="dashboard-icon-button" onClick={() => setGridColumns(gridColumns === 1 ? 2 : 1)} aria-label={`Show ${gridColumns === 1 ? 'two' : 'one'} photo per row`} title={`Show ${gridColumns === 1 ? 'two' : 'one'} photo per row`}>
                {gridColumns === 1 ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="8" height="18" rx="2" />
                    <rect x="13" y="3" width="8" height="18" rx="2" />
                    <path d="M5 8h4M5 12h4M15 8h4M15 12h4" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                    <path d="M7 8h10M7 12h10M7 16h10" />
                  </svg>
                )}
              </button>
              <button className="dashboard-icon-button" onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')} aria-label="Change sort order" title="Change sort order">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h8M6 12h12m-8 6h4"/></svg>
              </button>
              <button className="dashboard-icon-button" onClick={loadEventData} aria-label="Refresh photos" title="Refresh photos">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4m-4 4a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"/></svg>
              </button>
              <button className="dashboard-icon-button" onClick={handleDownloadAll} disabled={filteredPhotos.length === 0} aria-label="Download displayed photos" title="Download displayed photos">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>
              </button>
            </div>
            {showFilter && <div className="filter-section">
              <label htmlFor="participant-filter" className="filter-label">Filter by:</label>
              <select 
                id="participant-filter"
                className="participant-filter"
                value={filterParticipant}
                onChange={(e) => setFilterParticipant(e.target.value)}
              >
                <option value="all">All Participants ({photos.length})</option>
                {participants.map(participant => (
                  <option key={participant} value={participant}>
                    {participant} ({photos.filter(p => p.participant_name === participant).length})
                  </option>
                ))}
              </select>
            </div>}
            <div className="share-panel">
              <button className="qr-trigger" onClick={() => setIsQrModalOpen(true)} aria-label="Open and download guest QR code" title="Open QR code">
                <canvas ref={setQrPreviewCanvas} aria-label="Guest event QR code" />
              </button>
              <button className="share-link-button" onClick={copyGuestLink} title="Copy guest link">
                <span className="share-title">Share with guests</span><span className="share-link">{guestLink}</span>
              </button>
              <button className="dashboard-icon-button" onClick={copyGuestLink} aria-label="Copy guest link" title="Copy guest link">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
            {eventDetails && <div className="event-health"><span>{participants.length} / {eventDetails.guest_limit} guests</span><span>{photos.length} photos</span><span>{eventDetails.start_time ? 'Scheduled' : 'Open'}</span></div>}
          </>
        )}
      </div>

      <div className="dashboard-content">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading event...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <h2 className="handwritten">Unable to load event</h2>
            <p>{error}</p>
            <button className="primary-button" onClick={loadEventData}>
              Try Again
            </button>
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📸</div>
            <h2 className="handwritten">No photos yet!</h2>
            <p>Photos captured by guests will appear here.</p>
          </div>
        ) : (
          <div className={`photos-grid columns-${gridColumns}`}>
            {displayedPhotos.map((photo) => (
              <div 
                key={photo.id} 
                className="photo-card"
                onClick={() => setSelectedPhoto(photo)}
              >
                <div className="photo-frame">
                  <img 
                    src={getPhotoUrl(photo.storage_path)} 
                    alt={`By ${photo.participant_name || 'Unknown'}`} 
                  />
                </div>
                <div className="photo-info">
                  <p className="participant-name">{photo.participant_name || 'Unknown'}</p>
                  <p className="photo-date">{formatDate(photo.created_at)}</p>
                </div>
                <button 
                  className="quick-download"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadSingle(photo);
                  }}
                  title="Download"
                >
                  ↓
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Photo Preview Modal */}
      {selectedPhoto && (
        <Modal isOpen={true} onClose={() => setSelectedPhoto(null)}>
          <div className="photo-preview-modal">
            <img 
              src={getPhotoUrl(selectedPhoto.storage_path)} 
              alt={`By ${selectedPhoto.participant_name || 'Unknown'}`}
              className="preview-image"
            />
            <div className="preview-info">
              <p className="preview-participant">{selectedPhoto.participant_name || 'Unknown'}</p>
              <p className="preview-date">{formatDate(selectedPhoto.created_at)}</p>
            </div>
            <div className="preview-actions">
              <button 
                className="preview-download-button"
                onClick={() => handleDownloadSingle(selectedPhoto)}
              >
                Download Photo
              </button>
            </div>
          </div>
        </Modal>
      )}

      <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} className="qr-modal">
        <div className="qr-modal-content">
          <h2 className="handwritten">Share with guests</h2>
          <canvas ref={(canvas) => {
            if (canvas && eventId) {
              QRCode.toCanvas(canvas, guestLink, { width: 200, margin: 1, errorCorrectionLevel: 'H' })
                .catch((qrError) => console.error('Could not generate QR code:', qrError));
            }
          }} />
          <button className="preview-download-button" onClick={downloadQrCode}>Download QR image</button>
        </div>
      </Modal>
    </div>
  );
};

export default HostDashboard;
