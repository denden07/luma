import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEventPhotos, deletePhoto, downloadAllPhotos, downloadPhoto } from '../utils/indexedDBStorage';
import { getEvent } from '../services/dataService';
import type { Photo } from '../utils/indexedDBStorage';
import { getFilter, type FilterId } from '../utils/filters';
import { showErrorPopup } from '../components/ErrorPopup';
import Modal from '../components/Modal';
import UploadPanel from '../components/UploadPanel';
import './PhotoGallery.css';

interface PhotoGalleryProps {
  eventToken: string;
  onPhotoDeleted?: () => void;
}

const PhotoGallery: React.FC<PhotoGalleryProps> = ({ eventToken, onPhotoDeleted }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [eventName, setEventName] = useState('');
  const [eventFilterId, setEventFilterId] = useState<FilterId | null>(null);
  const [isFilteredView, setIsFilteredView] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [isPreparingDownload, setIsPreparingDownload] = useState(false);
  const [gridColumns, setGridColumns] = useState<1 | 2>(() => {
    return localStorage.getItem('gallery-grid-columns') === '1' ? 1 : 2;
  });
  const [hasSeenSwipeTutorial, setHasSeenSwipeTutorial] = useState(() => {
    return localStorage.getItem('luma-guest-swipe-tutorial') === 'seen';
  });
  const touchStartX = useRef<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadPhotos();
    getEvent(eventToken).then(event => {
      setEventName(event.name);
      setEventFilterId(event.enabled_filters[0] ?? null);
    }).catch(error => {
      console.error('Could not load gallery event name:', error);
    });
  }, [eventToken]);

  const loadPhotos = async () => {
    const eventPhotos = await getEventPhotos(eventToken);
    setPhotos(eventPhotos); // IndexedDB already returns newest first
  };

  const handleDelete = (photo: Photo) => {
    if (photo.status === 'uploaded') return;
    setPhotoToDelete(photo.id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (photoToDelete) {
      await deletePhoto(photoToDelete);
      await loadPhotos();
      setSelectedPhoto(null);
      setShowDeleteConfirm(false);
      setPhotoToDelete(null);
      
      // Notify parent that a photo was deleted (increments shotsLeft)
      if (onPhotoDeleted) {
        onPhotoDeleted();
      }
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setPhotoToDelete(null);
  };

  const handleDownload = async (photo: Photo) => {
    const result = await downloadPhoto(photo);
    setDownloadNotice(result === 'shared' ? 'Choose Save Image in the share sheet.' : 'Your photo download has started.');
  };

  const handleDownloadAll = async () => {
    if (photos.length === 0 || isPreparingDownload) return;

    setIsPreparingDownload(true);
    try {
      const result = await downloadAllPhotos(photos);
      setDownloadNotice(result === 'shared'
        ? 'Choose Save to Files in the share sheet.'
        : 'madetogether-guest-photos.zip download has started.');
    } finally {
      setIsPreparingDownload(false);
    }
  };

  const handleClose = () => {
    if (selectionMode) {
      exitSelectionMode();
    } else {
      navigate('../camera');
    }
  };

  const handlePhotoClick = (photo: Photo) => {
    if (selectionMode) {
      togglePhotoSelection(photo.id);
    } else {
      setSelectedPhoto(photo);
    }
  };

  const selectedPhotoIndex = selectedPhoto ? photos.findIndex(photo => photo.id === selectedPhoto.id) : -1;

  const showAdjacentPhoto = (direction: -1 | 1) => {
    const nextPhoto = photos[selectedPhotoIndex + direction];
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
    localStorage.setItem('luma-guest-swipe-tutorial', 'seen');
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
  }, [selectedPhoto, selectedPhotoIndex, photos]);

  const togglePhotoSelection = (photoId: string) => {
    if (photos.find(photo => photo.id === photoId)?.status === 'uploaded') return;
    setSelectedPhotos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedPhotos(new Set());
  };

  const enterSelectionMode = () => {
    setSelectedPhoto(null);
    setSelectionMode(true);
  };

  const changeGridColumns = (columns: 1 | 2) => {
    setGridColumns(columns);
    localStorage.setItem('gallery-grid-columns', String(columns));
  };

  // Bulk delete functionality
  const deleteSelectedPhotos = async () => {
    if (selectedPhotos.size === 0) return;
    
    const deletablePhotoIds = [...selectedPhotos].filter(photoId =>
      photos.find(photo => photo.id === photoId)?.status !== 'uploaded'
    );
    const count = deletablePhotoIds.length;
    if (count === 0) return;
    const confirmed = window.confirm(`Delete ${count} photo(s)? This cannot be undone.`);
    
    if (!confirmed) return;
    
    try {
      // Delete all selected photos
      for (const photoId of deletablePhotoIds) {
        await deletePhoto(photoId);
      }
      
      // Reload photos
      await loadPhotos();
      
      // Notify parent about deletions
      if (onPhotoDeleted) {
        // Call once per deleted photo to increment shotsLeft properly
        for (let i = 0; i < count; i++) {
          onPhotoDeleted();
        }
      }
      
      alert(`✅ Deleted ${count} photo(s)`);
      exitSelectionMode();
    } catch (error) {
      console.error('[Delete] Failed:', error);
      showErrorPopup('Failed to delete photos. Please try again.');
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year} ${month} ${day}`;
  };

  const getStatusBadge = (photo: Photo) => {
    if (photo.status === 'uploaded') {
      return { icon: '✓', className: 'uploaded', label: 'Uploaded' };
    } else if (photo.status === 'uploading') {
      return { icon: '↑', className: 'uploading', label: 'Uploading...' };
    } else if (photo.status === 'failed') {
      return { icon: '!', className: 'failed', label: 'Failed' };
    }
    return null;
  };

  const selectedFilter = getFilter(eventFilterId ?? undefined);
  const canShowFilteredView = eventFilterId !== null && eventFilterId !== 'original';
  const displayFilter = isFilteredView && canShowFilteredView ? selectedFilter?.previewFilter : 'none';

  return (
    <div className="photo-gallery">
      {/* Header */}
      <div className="gallery-header">
        <button className="close-button" onClick={handleClose}>
          {selectionMode ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          )}
        </button>
        {!selectionMode && <p className="gallery-event-title editorial">{eventName || 'Event photos'}</p>}
        {selectionMode && <h2>{`${selectedPhotos.size} Selected`}</h2>}
        <div className="gallery-tools">
          {selectionMode ? (
            <span className="selection-count">{selectedPhotos.size}</span>
          ) : (
            <>
              {canShowFilteredView && (
                <button className={`gallery-filter-indicator ${isFilteredView ? 'active' : ''}`} type="button" onClick={() => setIsFilteredView(current => !current)} aria-label={isFilteredView ? `Show original instead of ${selectedFilter?.label}` : `Show ${selectedFilter?.label}`} title={isFilteredView ? `Showing ${selectedFilter?.label}` : 'Showing Original'}>
                  <span className="gallery-filter-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="8" cy="10" r="1.3"/><path d="m4 18 5-5 3.5 3.5 2.5-2.5 4.5 4.5M18 2v4m-2-2h4"/></svg>
                  </span>
                </button>
              )}
              <button
                className="grid-toggle"
                onClick={() => changeGridColumns(gridColumns === 1 ? 2 : 1)}
                aria-label={`Show ${gridColumns === 1 ? 'two' : 'one'} photo per row`}
                title={`Show ${gridColumns === 1 ? 'two' : 'one'} photo per row`}
              >
                {gridColumns === 1 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="8" height="18" rx="2" />
                    <rect x="13" y="3" width="8" height="18" rx="2" />
                    <path d="M5 8h4M5 12h4M15 8h4M15 12h4" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                    <path d="M7 8h10M7 12h10M7 16h10" />
                  </svg>
                )}
              </button>
              <button className="select-mode-btn" onClick={enterSelectionMode} aria-label="Select photos" title="Select photos">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </button>
              <button className="download-all-btn" onClick={handleDownloadAll} disabled={isPreparingDownload} aria-label="Download all photos" title="Download all photos">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>
              </button>
            </>
          )}
        </div>
        {!selectionMode && <p className="guest-photo-total">{photos.length} {photos.length === 1 ? 'photo' : 'photos'} taken</p>}
      </div>

      {/* Selection Mode Actions */}
      {selectionMode && (
        <div className="selection-actions">
          <button 
            className="delete-btn"
            onClick={deleteSelectedPhotos}
            disabled={selectedPhotos.size === 0}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete {selectedPhotos.size > 0 ? `(${selectedPhotos.size})` : ''}
          </button>
        </div>
      )}

      {/* Grid View */}
      <div className={`gallery-grid grid-${gridColumns}`}>
        {photos.length === 0 ? (
          <div className="empty-state">
            <p>No photos yet</p>
            <button className="primary-button" onClick={handleClose}>
              Take Your First Photo
            </button>
          </div>
        ) : (
          photos.map((photo) => (
            <div 
              key={photo.id} 
              className={`gallery-item ${selectionMode && selectedPhotos.has(photo.id) ? 'selected' : ''}`}
              onClick={() => handlePhotoClick(photo)}
            >
              <img src={photo.thumbnailUrl} alt="Photo" style={{ filter: displayFilter }} />
              <div className="photo-date">{formatDate(photo.timestamp)}</div>
              {getStatusBadge(photo) && (
                <div className={`photo-status-badge ${getStatusBadge(photo)!.className}`}>
                  <span className="badge-icon">{getStatusBadge(photo)!.icon}</span>
                </div>
              )}
              {selectionMode && (
                <div className="selection-checkbox">
                  {selectedPhotos.has(photo.id) && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Upload Panel - Manual Upload UI */}
      {!selectionMode && (
        <UploadPanel 
          eventId={eventToken} 
          onUploadComplete={loadPhotos}
        />
      )}

      {/* Polaroid Photo Viewer Modal */}
      <Modal 
        isOpen={!!selectedPhoto} 
        onClose={() => setSelectedPhoto(null)}
        className="polaroid-modal"
      >
        {selectedPhoto && (
          <div className="guest-photo-viewer" onTouchStart={handleViewerTouchStart} onTouchEnd={handleViewerTouchEnd}>
            <button
              className="photo-navigation-button previous"
              onClick={() => showAdjacentPhoto(-1)}
              disabled={selectedPhotoIndex <= 0}
              aria-label="Previous photo"
            >
              &#10094;
            </button>
            <img 
              src={selectedPhoto.fullImageUrl} 
              alt="Photo" 
              className="polaroid-modal-image"
              style={{ filter: displayFilter }}
            />
            <button
              className="photo-navigation-button next"
              onClick={() => showAdjacentPhoto(1)}
              disabled={selectedPhotoIndex < 0 || selectedPhotoIndex >= photos.length - 1}
              aria-label="Next photo"
            >
              &#10095;
            </button>
            <div className="polaroid-modal-date">
              {formatDate(selectedPhoto.timestamp)}
              {selectedPhoto.status === 'uploaded' && (
                <span className="uploaded-text"> • Uploaded</span>
              )}
              {selectedPhoto.status === 'failed' && (
                <span className="failed-text"> • Upload Failed</span>
              )}
            </div>
            <div className="polaroid-modal-actions">
              <button 
                className="polaroid-action-button download"
                onClick={() => handleDownload(selectedPhoto)}
                aria-label="Download photo"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
              </button>
              {selectedPhoto.status !== 'uploaded' && (
                <button 
                  className="polaroid-action-button delete"
                  onClick={() => handleDelete(selectedPhoto)}
                  aria-label="Delete photo"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              )}
            </div>
            {photos.length > 1 && !hasSeenSwipeTutorial && (
              <div className="swipe-tutorial" role="dialog" aria-label="Photo navigation help">
                <div className="swipe-tutorial-cue" aria-hidden="true"><span>&#10094;</span><span>&#8596;</span><span>&#10095;</span></div>
                <p>Swipe left or right to see more photos</p>
                <button type="button" onClick={dismissSwipeTutorial}>Got it</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal 
        isOpen={showDeleteConfirm} 
        onClose={cancelDelete}
        className="confirm-modal"
      >
        <h3 className="confirm-modal-title">Delete Photo?</h3>
        <p className="confirm-modal-message">
          This photo will be permanently deleted and cannot be recovered.
        </p>
        <div className="confirm-modal-actions">
          <button className="confirm-button cancel" onClick={cancelDelete}>
            Cancel
          </button>
          <button className="confirm-button confirm" onClick={confirmDelete}>
            Delete
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!downloadNotice} onClose={() => setDownloadNotice(null)} className="guest-download-modal">
        <h3>Download ready</h3>
        <p>{downloadNotice}</p>
        <button onClick={() => setDownloadNotice(null)}>Done</button>
      </Modal>

      <Modal isOpen={isPreparingDownload} onClose={() => undefined} className="guest-download-progress-modal">
        <h3>Preparing ZIP</h3>
        <p>Packaging {photos.length} photos into one download.</p>
        <div className="guest-download-progress-track" aria-label="Preparing photo ZIP"><div /></div>
      </Modal>
    </div>
  );
};

export default PhotoGallery;