import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEventPhotos, deletePhoto, downloadPhoto, markAsUploaded } from '../utils/indexedDBStorage';
import type { Photo } from '../utils/indexedDBStorage';
import Modal from '../components/Modal';
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
  const [uploading, setUploading] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadPhotos();
  }, [eventToken]);

  const loadPhotos = async () => {
    const eventPhotos = await getEventPhotos(eventToken);
    setPhotos(eventPhotos); // IndexedDB already returns newest first
  };

  const handleDelete = (photoId: string) => {
    setPhotoToDelete(photoId);
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

  // Long press handling
  const handleTouchStart = (photoId: string) => {
    if (selectionMode) return; // Already in selection mode
    
    const timer = setTimeout(() => {
      // Enter selection mode and select this photo
      setSelectionMode(true);
      setSelectedPhotos(new Set([photoId]));
    }, 500); // 500ms long press
    
    setLongPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
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

  const selectAll = () => {
    const allIds = photos.map(p => p.id);
    setSelectedPhotos(new Set(allIds));
  };

  const deselectAll = () => {
    setSelectedPhotos(new Set());
  };

  // Upload functionality
  const uploadSelectedPhotos = async () => {
    if (selectedPhotos.size === 0) return;
    
    setUploading(true);
    
    try {
      const photosToUpload = photos.filter(p => selectedPhotos.has(p.id) && !p.uploaded);
      
      if (photosToUpload.length === 0) {
        alert('All selected photos have already been uploaded!');
        setUploading(false);
        return;
      }

      // Simulate upload (replace with actual API call)
      console.log('[Upload] Uploading', photosToUpload.length, 'photos...');
      
      // TODO: Replace this with actual upload API
      // Example:
      // for (const photo of photosToUpload) {
      //   const blob = await fetch(photo.fullImageUrl).then(r => r.blob());
      //   await uploadPhotoToServer(blob, photo.id);
      // }
      
      // For now, just mark as uploaded after delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mark photos as uploaded
      await markAsUploaded(photosToUpload.map(p => p.id));
      
      // Reload photos
      await loadPhotos();
      
      alert(`✅ Successfully uploaded ${photosToUpload.length} photo(s)!`);
      exitSelectionMode();
    } catch (error) {
      console.error('[Upload] Failed:', error);
      alert('Failed to upload photos. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Bulk delete functionality
  const deleteSelectedPhotos = async () => {
    if (selectedPhotos.size === 0) return;
    
    const count = selectedPhotos.size;
    const confirmed = window.confirm(`Delete ${count} photo(s)? This cannot be undone.`);
    
    if (!confirmed) return;
    
    try {
      // Delete all selected photos
      for (const photoId of selectedPhotos) {
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

  const uploadSinglePhoto = async (photo: Photo) => {
    if (photo.uploaded) {
      alert('This photo has already been uploaded!');
      return;
    }

    setUploading(true);
    
    try {
      console.log('[Upload] Uploading photo:', photo.id);
      
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mark as uploaded
      await markAsUploaded([photo.id]);
      
      // Reload photos and close modal
      await loadPhotos();
      setSelectedPhoto(null);
      
      alert('✅ Photo uploaded successfully!');
    } catch (error) {
      console.error('[Upload] Failed:', error);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year} ${month} ${day}`;
  };

  const unuploadedCount = photos.filter(p => !p.uploaded).length;

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
        <div className="photo-count">
          {selectionMode ? (
            <button 
              className="select-all-btn"
              onClick={selectedPhotos.size === photos.length ? deselectAll : selectAll}
            >
              {selectedPhotos.size === photos.length ? 'Deselect All' : 'Select All'}
            </button>
          ) : (
            <span>{photos.length}</span>
          )}
        </div>
      </div>

      {/* Selection Mode Actions */}
      {selectionMode && (
        <div className="selection-actions">
          <button 
            className="upload-btn"
            onClick={uploadSelectedPhotos}
            disabled={selectedPhotos.size === 0 || uploading}
          >
            {uploading ? (
              <>
                <div className="spinner"></div>
                Uploading...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                Upload {selectedPhotos.size > 0 ? `(${selectedPhotos.size})` : ''}
              </>
            )}
          </button>
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
          {unuploadedCount > 0 && (
            <div className="upload-info">
              {unuploadedCount} photo(s) not uploaded yet
            </div>
          )}
        </div>
      )}

      {/* Grid View */}
      <div className="gallery-grid">
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
              onTouchStart={() => handleTouchStart(photo.id)}
              onTouchEnd={handleTouchEnd}
              onMouseDown={() => handleTouchStart(photo.id)}
              onMouseUp={handleTouchEnd}
              onMouseLeave={handleTouchEnd}
            >
              <img src={photo.thumbnailUrl} alt="Photo" />
              <div className="photo-date">{formatDate(photo.timestamp)}</div>
              {photo.uploaded && (
                <div className="uploaded-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
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
              {selectedPhoto.uploaded && (
                <span className="uploaded-text"> • Uploaded</span>
              )}
            </div>
            <div className="polaroid-modal-actions">
              {!selectedPhoto.uploaded && (
                <button 
                  className="polaroid-action-button upload"
                  onClick={() => uploadSinglePhoto(selectedPhoto)}
                  disabled={uploading}
                  aria-label="Upload photo"
                >
                  {uploading ? (
                    <div className="spinner-small"></div>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                    </svg>
                  )}
                </button>
              )}
              <button 
                className="polaroid-action-button download"
                onClick={() => handleDownload(selectedPhoto)}
                aria-label="Download photo"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
              </button>
              <button 
                className="polaroid-action-button delete"
                onClick={() => handleDelete(selectedPhoto.id)}
                aria-label="Delete photo"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
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