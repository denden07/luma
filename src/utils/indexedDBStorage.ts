import JSZip from 'jszip';
import type { Event } from '../services/dataService';

/**
 * IndexedDB Storage Utility
 * Manages photos with thumbnails and upload tracking
 * Now supports full photo state management (local, uploading, uploaded, failed)
 */

export type PhotoStatus = 'local' | 'uploading' | 'uploaded' | 'failed';

export interface Photo {
  id: string; // Client-generated UUID for stable IDs
  eventId: string; // Changed from eventToken to eventId
  participantId: string; // Changed from participantName to participantId
  participantName: string; // Keep for display purposes
  timestamp: number;
  fullImageUrl: string; // Full resolution image data URL (base64)
  thumbnailUrl: string; // Smaller thumbnail for gallery
  blob: Blob; // Keep original blob for uploading
  status: PhotoStatus; // Track upload status
  uploadedAt?: number; // Timestamp of successful upload
  failureReason?: string; // Reason for upload failure
  created_at: number; // Timestamp when photo was created locally
}

const DB_NAME = 'madetogether_db';
const DB_VERSION = 2; // Incremented for schema changes
const PHOTOS_STORE = 'photos';
const EVENTS_STORE = 'events';
const PARTICIPANTS_STORE = 'participants';

interface CachedEvent extends Event {
  cachedAt: number;
}

/** Helper to generate UUID v4 */
export function generateUUID(): string {
  // Use crypto.randomUUID if available (more secure)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback to random-based UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Initialize IndexedDB with all stores
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
      const oldVersion = event.oldVersion;
      
      // Create photos store
      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        const photosStore = db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' });
        photosStore.createIndex('eventId', 'eventId', { unique: false });
        photosStore.createIndex('participantId', 'participantId', { unique: false });
        photosStore.createIndex('status', 'status', { unique: false });
        photosStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Migration from V1 to V2 - migrate old data
      if (oldVersion < 2 && db.objectStoreNames.contains('photos')) {
        // Handle migration from old schema
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const oldStore = transaction.objectStore('photos');
          const photosStore = transaction.objectStore(PHOTOS_STORE);
          
          oldStore.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result;
            if (cursor) {
              const oldPhoto = cursor.value;
              // Migrate old photo to new schema (if needed)
              if (!oldPhoto.status) {
                const newPhoto = {
                  ...oldPhoto,
                  eventId: oldPhoto.eventToken || oldPhoto.eventId,
                  participantId: oldPhoto.participantId || generateUUID(),
                  status: oldPhoto.uploaded ? 'uploaded' : 'local',
                  created_at: oldPhoto.timestamp,
                };
                photosStore.put(newPhoto);
              }
              cursor.continue();
            }
          };
        }
      }
      
      // Create events store (for caching event data)
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        const eventsStore = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
        eventsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Create participants store (for caching participant data)
      if (!db.objectStoreNames.contains(PARTICIPANTS_STORE)) {
        const participantsStore = db.createObjectStore(PARTICIPANTS_STORE, { keyPath: 'id' });
        participantsStore.createIndex('eventId', 'eventId', { unique: false });
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
 * Now uses client-generated UUID and supports full state management
 */
export async function savePhoto(
  eventId: string,
  participantId: string,
  participantName: string,
  blob: Blob,
  photoId?: string // Optional: provide existing ID for updates
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
    
    const now = Date.now();

    const photo: Photo = {
      id: photoId || generateUUID(),
      eventId,
      participantId,
      participantName,
      timestamp: now,
      fullImageUrl,
      thumbnailUrl,
      blob,
      status: 'local',
      created_at: now,
    };

    // Save to IndexedDB
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
      const store = transaction.objectStore(PHOTOS_STORE);
      
      // Check if photo already exists
      const checkRequest = store.get(photo.id);
      
      checkRequest.onsuccess = () => {
        if (checkRequest.result) {
          console.warn('[IndexedDB] Photo with this ID already exists:', photo.id);
          console.warn('[IndexedDB] Existing photo:', checkRequest.result);
          console.warn('[IndexedDB] New photo will overwrite existing one');
        }
        
        const putRequest = store.put(photo); // Use put to allow updates

        putRequest.onsuccess = () => {
          console.log('[IndexedDB] Photo saved successfully:', photo.id);
          resolve();
        };
        putRequest.onerror = () => {
          console.error('[IndexedDB] Put request failed:', putRequest.error);
          reject(new Error('Failed to save photo to IndexedDB'));
        };
      };
      
      checkRequest.onerror = () => {
        console.error('[IndexedDB] Check request failed:', checkRequest.error);
        reject(new Error('Failed to check existing photo'));
      };
    });

    db.close();
    console.log('[IndexedDB] Photo saved:', photo.id, `(${(blob.size / 1024).toFixed(1)} KB)`, `status: ${photo.status}`);
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
      const transaction = db.transaction([PHOTOS_STORE], 'readonly');
      const store = transaction.objectStore(PHOTOS_STORE);
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

/** Cache event configuration so a previously opened guest link can work offline. */
export async function cacheEvent(event: Event): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([EVENTS_STORE], 'readwrite');
      const request = transaction.objectStore(EVENTS_STORE).put({ ...event, cachedAt: Date.now() } satisfies CachedEvent);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to cache event'));
    });
  } finally {
    db.close();
  }
}

/** Get the last successfully loaded event configuration for offline use. */
export async function getCachedEvent(eventId: string): Promise<Event | null> {
  const db = await openDB();
  try {
    return await new Promise<Event | null>((resolve, reject) => {
      const transaction = db.transaction([EVENTS_STORE], 'readonly');
      const request = transaction.objectStore(EVENTS_STORE).get(eventId);
      request.onsuccess = () => resolve((request.result as CachedEvent | undefined) ?? null);
      request.onerror = () => reject(new Error('Failed to load cached event'));
    });
  } finally {
    db.close();
  }
}

/**
 * Get photos for a specific event
 */
export async function getEventPhotos(eventId: string): Promise<Photo[]> {
  try {
    const db = await openDB();
    
    const photos = await new Promise<Photo[]>((resolve, reject) => {
      const transaction = db.transaction([PHOTOS_STORE], 'readonly');
      const store = transaction.objectStore(PHOTOS_STORE);
      const index = store.index('eventId');
      const request = index.getAll(eventId);

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
      const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
      const store = transaction.objectStore(PHOTOS_STORE);
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
 * Update photo status
 */
export async function updatePhotoStatus(
  photoId: string,
  status: PhotoStatus,
  failureReason?: string
): Promise<void> {
  try {
    const db = await openDB();
    
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
      const store = transaction.objectStore(PHOTOS_STORE);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Failed to update photo status'));
      transaction.onabort = () => reject(transaction.error || new Error('Photo status update was aborted'));
      
      const getRequest = store.get(photoId);
      
      getRequest.onsuccess = () => {
        const photo = getRequest.result;
        if (photo) {
          photo.status = status;
          if (status === 'uploaded') {
            photo.uploadedAt = Date.now();
          }
          if (status === 'failed' && failureReason) {
            photo.failureReason = failureReason;
          }
          
          const putRequest = store.put(photo);
          putRequest.onerror = () => reject(new Error('Failed to update photo status'));
        } else {
          reject(new Error('Photo not found'));
        }
      };
      
      getRequest.onerror = () => reject(new Error('Failed to get photo'));
    });

    db.close();
    console.log('[IndexedDB] Photo status updated:', photoId, '→', status);
  } catch (error) {
    console.error('[IndexedDB] Update status failed:', error);
    throw error;
  }
}

/**
 * Get photos by status
 */
export async function getPhotosByStatus(
  eventId: string,
  status: PhotoStatus
): Promise<Photo[]> {
  const photos = await getEventPhotos(eventId);
  return photos.filter(photo => photo.status === status);
}

/**
 * Get photos that need to be uploaded or reconciled after an interrupted upload.
 */
export async function getPhotosToUpload(eventId: string): Promise<Photo[]> {
  const photos = await getEventPhotos(eventId);
  return photos.filter(photo =>
    photo.status === 'local' || photo.status === 'failed' || photo.status === 'uploading'
  );
}

/**
 * Mark photos as uploading
 */
export async function markPhotosAsUploading(photoIds: string[]): Promise<void> {
  for (const photoId of photoIds) {
    await updatePhotoStatus(photoId, 'uploading');
  }
}

/**
 * Mark photos as uploaded
 */
export async function markPhotosAsUploaded(photoIds: string[]): Promise<void> {
  for (const photoId of photoIds) {
    await updatePhotoStatus(photoId, 'uploaded');
  }
}

/**
 * Mark photos as failed
 */
export async function markPhotosAsFailed(
  photoIds: string[],
  reason: string
): Promise<void> {
  for (const photoId of photoIds) {
    await updatePhotoStatus(photoId, 'failed', reason);
  }
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
      const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
      const store = transaction.objectStore(PHOTOS_STORE);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear photos'));
    });

    db.close();
    console.log('[IndexedDB] All photos cleared');
  } catch (error) {
    console.error('[IndexedDB] Clear all photos failed:', error);
    throw error;
  }
}

function getPhotoFilename(photo: Photo): string {
  const participantName = photo.participantName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'guest';
  return `luma-${participantName}-${photo.timestamp}.jpg`;
}

async function sharePhotosOnIOS(photos: Photo[]): Promise<boolean> {
  if (!navigator.share || typeof File === 'undefined') return false;

  const files = photos.map(photo => new File([photo.blob], getPhotoFilename(photo), {
    type: photo.blob.type || 'image/jpeg',
  }));

  if (navigator.canShare && !navigator.canShare({ files })) return false;

  try {
    await navigator.share({
      files,
    });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    console.error('Could not open the iOS share sheet:', error);
    return false;
  }
}

function triggerPhotoDownload(photo: Photo): void {
  const downloadUrl = URL.createObjectURL(photo.blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = getPhotoFilename(photo);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

/** Download one photo, using the iOS share sheet when available. */
export async function downloadPhoto(photo: Photo): Promise<'shared' | 'downloaded'> {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS && await sharePhotosOnIOS([photo])) {
    return 'shared';
  }

  triggerPhotoDownload(photo);
  return 'downloaded';
}

/** Download all local event photos, or share them together from iOS. */
export async function downloadAllPhotos(photos: Photo[]): Promise<'shared' | 'downloaded'> {
  const zip = new JSZip();
  for (const photo of photos) {
    zip.file(getPhotoFilename(photo), photo.blob);
  }

  const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const filename = 'madetogether-guest-photos.zip';
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS && navigator.share && typeof File !== 'undefined') {
    const file = new File([archive], filename, { type: 'application/zip' });
    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
        console.error('Could not open the iOS ZIP share sheet:', error);
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
  return 'downloaded';
}

/**
 * Check if a string is a valid UUID v4 format
 */
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Migrate photos with invalid UUIDs to valid UUIDs
 * This fixes photos captured before the UUID fix
 */
export async function migrateInvalidPhotoUUIDs(): Promise<number> {
  console.log('[IndexedDB Migration] Checking for photos with invalid UUIDs...');
  
  try {
    const db = await openDB();
    
    const photosToMigrate: Photo[] = [];
    
    // Get all photos and check their IDs
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PHOTOS_STORE], 'readonly');
      const store = transaction.objectStore(PHOTOS_STORE);
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const photo = cursor.value as Photo;
          if (!isValidUUID(photo.id)) {
            console.log('[IndexedDB Migration] Found invalid UUID:', photo.id);
            photosToMigrate.push(photo);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(new Error('Failed to read photos for migration'));
    });

    if (photosToMigrate.length === 0) {
      db.close();
      console.log('[IndexedDB Migration] ✅ No photos need migration');
      return 0;
    }

    console.log(`[IndexedDB Migration] Found ${photosToMigrate.length} photos to migrate`);

    // Migrate each photo
    let migratedCount = 0;
    for (const oldPhoto of photosToMigrate) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
        const store = transaction.objectStore(PHOTOS_STORE);

        // Verify blob exists - critical for upload
        if (!oldPhoto.blob) {
          console.error('[IndexedDB Migration] ❌ Photo has no blob, skipping:', oldPhoto.id);
          resolve(); // Skip this photo but continue migration
          return;
        }

        // Create new photo with valid UUID
        // Reset status to 'local' since the old ID was never uploaded to the server
        const newPhoto: Photo = {
          ...oldPhoto,
          id: generateUUID(), // Generate new valid UUID
          status: 'local', // Reset to local - needs to be uploaded with new ID
          uploadedAt: undefined, // Clear upload timestamp
          failureReason: undefined, // Clear any failure reason
        };

        console.log('[IndexedDB Migration] Migrating:', oldPhoto.id, '→', newPhoto.id, 
          'status:', oldPhoto.status, '→ local',
          'blob size:', (oldPhoto.blob.size / 1024).toFixed(1), 'KB');

        // Delete old photo
        const deleteRequest = store.delete(oldPhoto.id);

        deleteRequest.onsuccess = () => {
          // Add new photo
          const addRequest = store.add(newPhoto);

          addRequest.onsuccess = () => {
            migratedCount++;
            console.log('[IndexedDB Migration] ✅ Migrated:', newPhoto.id);
            resolve();
          };

          addRequest.onerror = () => {
            console.error('[IndexedDB Migration] ❌ Failed to add new photo:', addRequest.error);
            reject(new Error('Failed to add migrated photo'));
          };
        };

        deleteRequest.onerror = () => {
          console.error('[IndexedDB Migration] ❌ Failed to delete old photo:', deleteRequest.error);
          reject(new Error('Failed to delete old photo'));
        };
      });
    }

    db.close();
    console.log(`[IndexedDB Migration] ✅ Successfully migrated ${migratedCount} photos`);
    return migratedCount;
  } catch (error) {
    console.error('[IndexedDB Migration] ❌ Migration failed:', error);
    return 0;
  }
}
