/**
 * IndexedDB Storage Utility
 * Manages photos with thumbnails and upload tracking
 */

export interface Photo {
  id: string;
  eventToken: string;
  participantName: string;
  timestamp: number;
  fullImageUrl: string; // Full resolution image data URL
  thumbnailUrl: string; // Smaller thumbnail for gallery
  uploaded: boolean; // Track if uploaded to server
  uploadedAt?: number; // Timestamp of upload
}

const DB_NAME = 'luma_photos_db';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

/**
 * Initialize IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        
        // Create indexes
        objectStore.createIndex('eventToken', 'eventToken', { unique: false });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        objectStore.createIndex('uploaded', 'uploaded', { unique: false });
      }
    };
  });
}

/**
 * Create thumbnail from blob
 */
async function createThumbnail(blob: Blob, maxWidth: number = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    img.onload = () => {
      const scaleFactor = maxWidth / img.width;
      canvas.width = Math.floor(img.width * scaleFactor);
      canvas.height = Math.floor(img.height * scaleFactor);
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((thumbnailBlob) => {
        if (thumbnailBlob) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read thumbnail'));
          reader.readAsDataURL(thumbnailBlob);
        } else {
          reject(new Error('Failed to create thumbnail blob'));
        }
      }, 'image/jpeg', 0.7);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    
    const reader = new FileReader();
    reader.onload = () => {
      img.src = reader.result as string;
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Save a photo to IndexedDB with thumbnail
 */
export async function savePhoto(
  eventToken: string,
  participantName: string,
  blob: Blob
): Promise<Photo> {
  try {
    const db = await openDB();
    
    // Convert blob to data URL for full image
    const fullImageUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });

    // Create thumbnail
    const thumbnailUrl = await createThumbnail(blob);

    const photo: Photo = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      eventToken,
      participantName,
      timestamp: Date.now(),
      fullImageUrl,
      thumbnailUrl,
      uploaded: false,
    };

    // Save to IndexedDB
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(photo);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to save photo to IndexedDB'));
    });

    db.close();
    console.log('[IndexedDB] Photo saved:', photo.id, `(${(blob.size / 1024).toFixed(1)} KB)`);
    return photo;
  } catch (error) {
    console.error('[IndexedDB] Save failed:', error);
    throw error;
  }
}

/**
 * Get all photos from IndexedDB
 */
export async function getAllPhotos(): Promise<Photo[]> {
  try {
    const db = await openDB();
    
    const photos = await new Promise<Photo[]>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('Failed to get photos'));
    });

    db.close();
    return photos;
  } catch (error) {
    console.error('[IndexedDB] Get all photos failed:', error);
    return [];
  }
}

/**
 * Get photos for a specific event
 */
export async function getEventPhotos(eventToken: string): Promise<Photo[]> {
  try {
    const db = await openDB();
    
    const photos = await new Promise<Photo[]>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('eventToken');
      const request = index.getAll(eventToken);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('Failed to get event photos'));
    });

    db.close();
    // Sort by timestamp descending (newest first)
    return photos.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('[IndexedDB] Get event photos failed:', error);
    return [];
  }
}

/**
 * Delete a photo by ID
 */
export async function deletePhoto(photoId: string): Promise<boolean> {
  try {
    const db = await openDB();
    
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(photoId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete photo'));
    });

    db.close();
    console.log('[IndexedDB] Photo deleted:', photoId);
    return true;
  } catch (error) {
    console.error('[IndexedDB] Delete failed:', error);
    return false;
  }
}

/**
 * Mark photo(s) as uploaded
 */
export async function markAsUploaded(photoIds: string[]): Promise<void> {
  try {
    const db = await openDB();
    
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      let completed = 0;
      const total = photoIds.length;

      photoIds.forEach(photoId => {
        const getRequest = store.get(photoId);
        
        getRequest.onsuccess = () => {
          const photo = getRequest.result;
          if (photo) {
            photo.uploaded = true;
            photo.uploadedAt = Date.now();
            
            const putRequest = store.put(photo);
            putRequest.onsuccess = () => {
              completed++;
              if (completed === total) resolve();
            };
            putRequest.onerror = () => reject(new Error('Failed to update photo'));
          } else {
            completed++;
            if (completed === total) resolve();
          }
        };
        
        getRequest.onerror = () => reject(new Error('Failed to get photo'));
      });
    });

    db.close();
    console.log('[IndexedDB] Marked as uploaded:', photoIds.length, 'photos');
  } catch (error) {
    console.error('[IndexedDB] Mark as uploaded failed:', error);
    throw error;
  }
}

/**
 * Get photos that haven't been uploaded yet
 */
export async function getUnuploadedPhotos(eventToken: string): Promise<Photo[]> {
  const photos = await getEventPhotos(eventToken);
  return photos.filter(photo => !photo.uploaded);
}

/**
 * Get storage usage estimate
 */
export async function getStorageSize(): Promise<number> {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usedMB = (estimate.usage || 0) / (1024 * 1024);
      return usedMB;
    }
    return 0;
  } catch (error) {
    console.error('[IndexedDB] Storage estimate failed:', error);
    return 0;
  }
}

/**
 * Clear all photos (for debugging)
 */
export async function clearAllPhotos(): Promise<void> {
  try {
    const db = await openDB();
    
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear photos'));
    });

    db.close();
    console.log('[IndexedDB] All photos cleared');
  } catch (error) {
    console.error('[IndexedDB] Clear all failed:', error);
    throw error;
  }
}

/**
 * Download a photo (for backwards compatibility)
 */
export function downloadPhoto(photo: Photo): void {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  
  if (isIOS || isSafari) {
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
            <img src="${photo.fullImageUrl}" alt="Photo" />
          </body>
        </html>
      `);
    }
  } else {
    const link = document.createElement('a');
    link.href = photo.fullImageUrl;
    link.download = `luma-${photo.participantName}-${photo.timestamp}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
