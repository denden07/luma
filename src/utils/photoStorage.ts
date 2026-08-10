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
        const jsonData = JSON.stringify(photos);
        const sizeKB = (new Blob([jsonData]).size / 1024).toFixed(1);
        console.log('[photoStorage] Saving photo, total storage size:', sizeKB, 'KB');
        
        localStorage.setItem(PHOTOS_KEY, jsonData);
        resolve(photo);
      } catch (error: any) {
        console.error('[photoStorage] Save failed:', error);
        
        // Provide more specific error
        if (error.name === 'QuotaExceededError' || error.message?.includes('quota')) {
          const err = new Error('Storage quota exceeded') as any;
          err.name = 'QuotaExceededError';
          reject(err);
        } else {
          reject(new Error('Failed to save photo'));
        }
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
 * Get current storage usage in KB
 */
export function getStorageSize(): number {
  try {
    const stored = localStorage.getItem(PHOTOS_KEY);
    if (!stored) return 0;
    return new Blob([stored]).size / 1024; // Return KB
  } catch (error) {
    console.error('Failed to check storage size:', error);
    return 0;
  }
}

/**
 * Check if storage is getting full (>80% of iOS Safari ~5MB limit)
 */
export function isStorageNearFull(): boolean {
  const sizeKB = getStorageSize();
  const limitKB = 4 * 1024; // Conservative 4MB limit for iOS Safari
  return sizeKB > (limitKB * 0.8);
}

/**
 * Download a photo to device (iOS Safari compatible)
 */
export function downloadPhoto(photo: Photo): void {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  
  if (isIOS || isSafari) {
    // iOS Safari doesn't support download attribute well
    // Open in new tab so user can long-press and save
    const win = window.open();
    if (win) {
      win.document.write(`
        <html>
          <head>
            <title>Download Photo</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { margin: 0; background: #000; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
              img { max-width: 100%; height: auto; }
              .instructions { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 12px 20px; border-radius: 8px; font-family: system-ui; font-size: 14px; text-align: center; }
            </style>
          </head>
          <body>
            <div class="instructions">Long press image and tap "Save to Photos"</div>
            <img src="${photo.dataUrl}" alt="Photo" />
          </body>
        </html>
      `);
    }
  } else {
    // Standard download for other browsers
    const link = document.createElement('a');
    link.href = photo.dataUrl;
    link.download = `luma-${photo.participantName}-${photo.timestamp}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Clear all photos (for debugging/testing)
 */
export function clearAllPhotos(): void {
  localStorage.removeItem(PHOTOS_KEY);
}
