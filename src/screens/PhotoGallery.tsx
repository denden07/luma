import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEventPhotos, deletePhoto, downloadPhoto } from '../utils/indexedDBStorage';
import type { Photo } from '../utils/indexedDBStorage';
import Modal from '../components/Modal';
import UploadPanel from '../components/UploadPanel';
import './PhotoGallery.css';

interface PhotoGalleryProps {
  eventToken: string;
  onPhotoDeleted?: () => void;
}

const PhotoGallery: React.FC<PhotoGalleryProps> = ({ eventToken, onPhotoDeleted }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [gridColumns, setGridColumns] = useState<1 | 2>(() => {
    return localStorage.getItem('gallery-grid-columns') === '1' ? 1 : 2;
  });
  const navigate = useNavigate();

  useEffect(() => {
    loadPhotos();
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

  const handleDownload = (photo: Photo) => {
    downloadPhoto(photo);
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
      alert('Failed to delete photos. Please try again.');
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
        <h2>{selectionMode ? `${selectedPhotos.size} Selected` : 'My Photos'}</h2>
        <div className="gallery-tools">
          {selectionMode ? (
            <span className="selection-count">{selectedPhotos.size}</span>
          ) : (
            <>
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
              <span className="photo-count">{photos.length}</span>
            </>
          )}
        </div>
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
              <img src={photo.thumbnailUrl} alt="Photo" />
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
          <>
            <img 
              src={selectedPhoto.fullImageUrl} 
              alt="Photo" 
              className="polaroid-modal-image"
            />
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
          </>
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
    </div>
  );
};

export default PhotoGallery;