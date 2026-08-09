import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEventPhotos, deletePhoto, downloadPhoto } from '../utils/photoStorage';
import type { Photo } from '../utils/photoStorage';
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
  const navigate = useNavigate();

  useEffect(() => {
    loadPhotos();
  }, [eventToken]);

  const loadPhotos = () => {
    const eventPhotos = getEventPhotos(eventToken);
    setPhotos(eventPhotos.reverse()); // Show newest first
  };

  const handleDelete = (photoId: string) => {
    setPhotoToDelete(photoId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (photoToDelete) {
      deletePhoto(photoToDelete);
      loadPhotos();
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
    navigate('../camera');
  };

  return (
    <div className="photo-gallery">
      {/* Header */}
      <div className="gallery-header">
        <button className="close-button" onClick={handleClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2>My Photos</h2>
        <div className="photo-count">{photos.length}</div>
      </div>

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
              className="gallery-item"
              onClick={() => setSelectedPhoto(photo)}
            >
              <img src={photo.dataUrl} alt="Photo" />
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
              src={selectedPhoto.dataUrl} 
              alt="Photo" 
              className="polaroid-modal-image"
            />
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