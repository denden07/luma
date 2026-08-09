import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEventPhotos, deletePhoto, downloadPhoto } from '../utils/photoStorage';
import type { Photo } from '../utils/photoStorage';
import './PhotoGallery.css';

interface PhotoGalleryProps {
  eventToken: string;
  onPhotoDeleted?: () => void;
}

const PhotoGallery: React.FC<PhotoGalleryProps> = ({ eventToken, onPhotoDeleted }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadPhotos();
  }, [eventToken]);

  const loadPhotos = () => {
    const eventPhotos = getEventPhotos(eventToken);
    setPhotos(eventPhotos.reverse()); // Show newest first
  };

  const handleDelete = (photoId: string) => {
    if (confirm('Delete this photo?')) {
      deletePhoto(photoId);
      loadPhotos();
      setSelectedPhoto(null);
      
      // Notify parent that a photo was deleted (increments shotsLeft)
      if (onPhotoDeleted) {
        onPhotoDeleted();
      }
    }
  };

  const handleDownload = (photo: Photo) => {
    downloadPhoto(photo);
  };

  const handleClose = () => {
    navigate('../camera');
  };

  const handleBackButton = () => {
    if (selectedPhoto) {
      // If viewing a photo, go back to grid
      setSelectedPhoto(null);
    } else {
      // If in grid view, go back to camera
      handleClose();
    }
  };

  return (
    <div className="photo-gallery">
      {/* Header */}
      <div className="gallery-header">
        <button className="close-button" onClick={handleBackButton}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2>My Photos</h2>
        <div className="photo-count">{photos.length}</div>
      </div>

      {/* Grid View */}
      {!selectedPhoto && (
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
      )}

      {/* Full View */}
      {selectedPhoto && (
        <div className="photo-viewer">
          <div className="photo-container">
            <img src={selectedPhoto.dataUrl} alt="Photo" />
          </div>

          <div className="photo-actions">
            <button 
              className="action-button download"
              onClick={() => handleDownload(selectedPhoto)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              Download
            </button>
            <button 
              className="action-button delete"
              onClick={() => handleDelete(selectedPhoto.id)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoGallery;
