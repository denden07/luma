import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { downloadEventPhotosZip, getEvent, getEventPhotos, getPhotoUrl } from '../services/dataService';
import type { Event, PhotoMetadata } from '../services/dataService';
import { getFilter } from '../utils/filters';
import { copyTextToClipboard } from '../utils/clipboard';
import { getHostCode } from '../utils/hostAuth';
import Modal from '../components/Modal';
import { showErrorPopup } from '../components/ErrorPopup';
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
  const [showDownloadInfo, setShowDownloadInfo] = useState(false);
  const [isCopySuccessOpen, setIsCopySuccessOpen] = useState(false);
  const [isPreparingDownload, setIsPreparingDownload] = useState(false);
  const [usedShareSheet, setUsedShareSheet] = useState(false);
  const [isFilteredView, setIsFilteredView] = useState(true);
  const [hasSeenSwipeTutorial, setHasSeenSwipeTutorial] = useState(() => {
    return localStorage.getItem('luma-host-swipe-tutorial') === 'seen';
  });
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrModalCanvasRef = useRef<HTMLCanvasElement>(null);
  const touchStartX = useRef<number | null>(null);
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
      setError('Unable to load event');
      showErrorPopup('We could not load this event. Please try again.');
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
  const eventFilterId = eventDetails?.enabled_filters[0];
  const selectedFilter = getFilter(eventFilterId);
  const canShowFilteredView = eventFilterId !== undefined && eventFilterId !== 'original';
  const displayFilter = isFilteredView && canShowFilteredView ? selectedFilter?.previewFilter : 'none';
  const selectedPhotoIndex = selectedPhoto ? displayedPhotos.findIndex(photo => photo.id === selectedPhoto.id) : -1;

  const guestLink = eventId ? `${window.location.origin}/e/${eventId}` : '';
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const setQrPreviewCanvas = (canvas: HTMLCanvasElement | null) => {
    qrCanvasRef.current = canvas;
    if (canvas && guestLink) {
      QRCode.toCanvas(canvas, guestLink, {
        width: 64,
        margin: 1,
        errorCorrectionLevel: 'H',
      }).catch((qrError) => console.error('Could not generate QR code:', qrError));
    }
  };

  const copyGuestLink = async () => {
    try {
      await copyTextToClipboard(guestLink);
      setIsCopySuccessOpen(true);
    } catch (copyError) {
      console.error('Could not copy guest link:', copyError);
      showErrorPopup('Could not copy the guest link. Please try again.');
    }
  };

  const copyHostCode = async () => {
    const hostCode = getHostCode();
    if (!hostCode) return;
    try {
      await copyTextToClipboard(hostCode);
      setIsCopySuccessOpen(true);
    } catch (copyError) {
      console.error('Could not copy host code:', copyError);
      showErrorPopup('Could not copy the host code. Please try again.');
    }
  };

  const downloadQrCode = async () => {
    const canvas = qrModalCanvasRef.current ?? qrCanvasRef.current;
    if (!canvas) return;
    const image = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!image) return;

    const filename = `${eventName.trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'event'}-qr.png`;
    if (isIOS && navigator.share && typeof File !== 'undefined') {
      const file = new File([image], filename, { type: 'image/png' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
          console.error('Could not open the iOS QR share sheet:', shareError);
        }
      }
    }

    const downloadUrl = URL.createObjectURL(image);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  };

  const handleDownloadAll = async () => {
    if (!eventId || isPreparingDownload) return;

    setIsPreparingDownload(true);
    try {
      const archive = await downloadEventPhotosZip(eventId);
      const filename = 'madetogether-event-photos.zip';

      if (isIOS && navigator.share && typeof File !== 'undefined') {
        const file = new File([archive], filename, { type: 'application/zip' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            setUsedShareSheet(true);
            setShowDownloadInfo(true);
            return;
          } catch (shareError) {
            if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
            console.error('Could not open the iOS ZIP share sheet:', shareError);
          }
        }
      }

      const downloadUrl = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setUsedShareSheet(false);
      setShowDownloadInfo(true);
    } catch (downloadError) {
      console.error('Could not prepare photo download:', downloadError);
      showErrorPopup('Could not prepare the photo download. Please try again.');
    } finally {
      setIsPreparingDownload(false);
    }
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

  const showAdjacentPhoto = (direction: -1 | 1) => {
    const nextPhoto = displayedPhotos[selectedPhotoIndex + direction];
    if (nextPhoto) setSelectedPhoto(nextPhoto);
  };

  const handleViewerTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleViewerTouchEnd = (event: React.TouchEvent) => {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX === null || endX === undefined || Math.abs(endX - startX) < 48) return;
    showAdjacentPhoto(endX < startX ? 1 : -1);
  };

  const dismissSwipeTutorial = () => {
    localStorage.setItem('luma-host-swipe-tutorial', 'seen');
    setHasSeenSwipeTutorial(true);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedPhoto) return;
      if (event.key === 'ArrowLeft') showAdjacentPhoto(-1);
      if (event.key === 'ArrowRight') showAdjacentPhoto(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhoto, selectedPhotoIndex, displayedPhotos]);

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
        </div>
        <p className="event-name editorial">{eventName || 'Loading...'}</p>
        {getHostCode() && <button className="host-code-button" type="button" onClick={copyHostCode} title="Copy host code">Host code: {getHostCode()}</button>}
        
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
            <button onClick={loadEventData}>Retry</button>
          </div>
        )}

        {!error && !isLoading && (
          <>
            <div className="dashboard-controls">
              {canShowFilteredView && (
                <button className={`host-gallery-filter-indicator ${isFilteredView ? 'active' : ''}`} type="button" onClick={() => setIsFilteredView(current => !current)} aria-label={isFilteredView ? `Show original instead of ${selectedFilter?.label}` : `Show ${selectedFilter?.label}`} title={isFilteredView ? `Showing ${selectedFilter?.label}` : 'Showing Original'}>
                  <span className="gallery-filter-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="8" cy="10" r="1.3"/><path d="m4 18 5-5 3.5 3.5 2.5-2.5 4.5 4.5M18 2v4m-2-2h4"/></svg>
                  </span>
                </button>
              )}
              <button className={`dashboard-icon-button ${showFilter ? 'active' : ''}`} onClick={() => setShowFilter(!showFilter)} aria-label="Filter photos" title="Filter photos">
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
              <button className="dashboard-icon-button" onClick={handleDownloadAll} disabled={photos.length === 0 || isPreparingDownload} aria-label="Download all event photos as a ZIP" title="Download all event photos as a ZIP">
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
                <span className="qr-preview-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/></svg>
                </span>
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
                    style={{ filter: displayFilter }}
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
        <Modal isOpen={true} onClose={() => setSelectedPhoto(null)} className="host-photo-modal">
          <div className="photo-preview-modal" onTouchStart={handleViewerTouchStart} onTouchEnd={handleViewerTouchEnd}>
            <button className="preview-navigation previous" onClick={() => showAdjacentPhoto(-1)} disabled={selectedPhotoIndex <= 0} aria-label="Previous photo">
              &#10094;
            </button>
            <img 
              src={getPhotoUrl(selectedPhoto.storage_path)} 
              alt={`By ${selectedPhoto.participant_name || 'Unknown'}`}
              className="preview-image"
              style={{ filter: displayFilter }}
            />
            <button className="preview-navigation next" onClick={() => showAdjacentPhoto(1)} disabled={selectedPhotoIndex < 0 || selectedPhotoIndex >= displayedPhotos.length - 1} aria-label="Next photo">
              &#10095;
            </button>
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
            {displayedPhotos.length > 1 && !hasSeenSwipeTutorial && (
              <div className="swipe-tutorial" role="dialog" aria-label="Photo navigation help">
                <div className="swipe-tutorial-cue" aria-hidden="true"><span>&#10094;</span><span>&#8596;</span><span>&#10095;</span></div>
                <p>Swipe left or right to see more photos</p>
                <button type="button" onClick={dismissSwipeTutorial}>Got it</button>
              </div>
            )}
          </div>
        </Modal>
      )}

      <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} className="qr-modal">
        <div className="qr-modal-content">
          <h2 className="handwritten">Share with guests</h2>
          <canvas ref={(canvas) => {
            qrModalCanvasRef.current = canvas;
            if (canvas && eventId) {
              QRCode.toCanvas(canvas, guestLink, { width: 200, margin: 1, errorCorrectionLevel: 'H' })
                .catch((qrError) => console.error('Could not generate QR code:', qrError));
            }
          }} />
          <button className="preview-download-button" onClick={downloadQrCode}>Download QR image</button>
        </div>
      </Modal>

      <Modal isOpen={isPreparingDownload} onClose={() => undefined} className="download-progress-modal">
        <h2 className="handwritten">Preparing download</h2>
        <p>Collecting {photos.length} photos into one ZIP file.</p>
        <div className="download-progress-track" aria-label="Preparing ZIP download"><div /></div>
      </Modal>

      <Modal isOpen={showDownloadInfo} onClose={() => setShowDownloadInfo(false)} className="download-info-modal">
        <h2 className="handwritten">Download started</h2>
        <p><strong>madetogether-event-photos.zip</strong></p>
        <p>{usedShareSheet
          ? 'Use the share sheet to save or send the ZIP file.'
          : isIOS
          ? 'Find it in Safari Downloads or the Files app.'
          : 'Find it in your browser Downloads or the Files app.'}
        </p>
        <button className="preview-download-button" onClick={() => setShowDownloadInfo(false)}>Done</button>
      </Modal>

      <Modal isOpen={isCopySuccessOpen} onClose={() => setIsCopySuccessOpen(false)} className="download-info-modal">
        <h2 className="handwritten">Link copied</h2>
        <p>The guest link is ready to share.</p>
        <button className="preview-download-button" onClick={() => setIsCopySuccessOpen(false)}>Done</button>
      </Modal>
    </div>
  );
};

export default HostDashboard;
