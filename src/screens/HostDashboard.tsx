import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getEvent, getEventPhotos, getPhotoUrl } from '../services/apiService';
import type { PhotoMetadata } from '../services/apiService';
import Modal from '../components/Modal';
import './HostDashboard.css';

const HostDashboard: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [photos, setPhotos] = useState<PhotoMetadata[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoMetadata | null>(null);
  const [filterParticipant, setFilterParticipant] = useState<string>('all');
  const [participants, setParticipants] = useState<string[]>([]);
  const [eventName, setEventName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
              title="Back to events list"
            >
              &larr; Back
            </button>
            <h1 className="dashboard-title handwritten">host dashboard</h1>
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
            title="Back to events list"
          >
            &larr; Back
          </button>
          <h1 className="dashboard-title handwritten">host dashboard</h1>
          <p className="event-name editorial">{eventName || 'Loading...'}</p>
        </div>
        
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
            <button onClick={loadEventData}>Retry</button>
          </div>
        )}

        {!error && !isLoading && (
          <div className="dashboard-controls">
            <div className="filter-section">
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
            </div>

            <button 
              className="download-all-button"
              onClick={handleDownloadAll}
              disabled={filteredPhotos.length === 0}
            >
              Download All ({filteredPhotos.length})
            </button>
          </div>
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
          <div className="photos-grid">
            {filteredPhotos.map((photo) => (
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
    </div>
  );
};

export default HostDashboard;
