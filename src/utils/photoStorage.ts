/**
 * Photo Storage Utility
 * Manages photos in localStorage using base64 encoding
 */

interface Photo {
  id: string;
  eventToken: string;
  participantName: string;
  timestamp: number;
  dataUrl: string; // base64 encoded image
}

// Export the type
export type { Photo };

const PHOTOS_KEY = 'luma_photos';

/**
 * Save a photo to localStorage
 */
export function savePhoto(eventToken: string, participantName: string, blob: Blob): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const photo: Photo = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        eventToken,
        participantName,
        timestamp: Date.now(),
        dataUrl: reader.result as string,
      };

      const photos = getAllPhotos();
      photos.push(photo);
      
      try {
        localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
        resolve(photo);
      } catch (error) {
        reject(new Error('Failed to save photo. Storage may be full.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read photo'));
    };

    reader.readAsDataURL(blob);
  });
}

/**
 * Get all photos from localStorage
 */
export function getAllPhotos(): Photo[] {
  try {
    const stored = localStorage.getItem(PHOTOS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to read photos from storage:', error);
    return [];
  }
}

/**
 * Get photos for a specific event
 */
export function getEventPhotos(eventToken: string): Photo[] {
  return getAllPhotos().filter(photo => photo.eventToken === eventToken);
}

/**
 * Delete a photo by ID
 */
export function deletePhoto(photoId: string): boolean {
  try {
    const photos = getAllPhotos();
    const filtered = photos.filter(photo => photo.id !== photoId);
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Failed to delete photo:', error);
    return false;
  }
}

/**
 * Download a photo to device
 */
export function downloadPhoto(photo: Photo): void {
  const link = document.createElement('a');
  link.href = photo.dataUrl;
  link.download = `luma-${photo.participantName}-${photo.timestamp}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Get total storage size estimate (in MB)
 */
export function getStorageSize(): number {
  try {
    const photos = getAllPhotos();
    const jsonString = JSON.stringify(photos);
    const bytes = new Blob([jsonString]).size;
    return bytes / (1024 * 1024); // Convert to MB
  } catch (error) {
    return 0;
  }
}

/**
 * Clear all photos (for debugging/testing)
 */
export function clearAllPhotos(): void {
  localStorage.removeItem(PHOTOS_KEY);
}
