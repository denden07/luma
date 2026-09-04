// Upload Service - Handles manual photo uploads
// Coordinates between IndexedDB and the backend (local API or Supabase)

import {
  getPhotosToUpload,
  updatePhotoStatus,
  type Photo,
} from '../utils/indexedDBStorage';
import {
  createParticipant as createParticipantOnServer,
  uploadPhoto as apiUploadPhoto,
} from './dataService';

export interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  current?: string; // Current photo being uploaded
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

async function markUploadedWithRetry(photoId: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await updatePhotoStatus(photoId, 'uploaded');
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Upload all pending photos for an event
 * This is the MANUAL upload function - only called when user explicitly requests it
 */
export async function uploadPendingPhotos(
  eventId: string,
  onProgress?: UploadProgressCallback
): Promise<{ succeeded: Photo[]; failed: { photo: Photo; error: string }[] }> {
  console.log('[UploadService] ==================== UPLOAD STARTED ====================');
  console.log('[UploadService] Environment:', {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    vendor: navigator.vendor,
    onLine: navigator.onLine,
    apiBaseUrl: window.location.origin
  });
  
  console.log('[UploadService] Getting photos to upload for event:', eventId);
  const photosToUpload = await getPhotosToUpload(eventId);
  
  console.log('[UploadService] Photos to upload:', photosToUpload.map(p => ({
    id: p.id,
    status: p.status,
    hasBlob: !!p.blob,
    blobSize: p.blob ? (p.blob.size / 1024).toFixed(1) + ' KB' : 'N/A',
    blobType: p.blob ? p.blob.type : 'N/A'
  })));
  
  if (photosToUpload.length === 0) {
    console.log('[UploadService] No photos to upload');
    return { succeeded: [], failed: [] };
  }

  console.log('[UploadService] Starting manual upload of', photosToUpload.length, 'photos');

  const succeeded: Photo[] = [];
  const failed: { photo: Photo; error: string }[] = [];

  for (let i = 0; i < photosToUpload.length; i++) {
    const photo = photosToUpload[i];
    
    if (onProgress) {
      onProgress({
        total: photosToUpload.length,
        completed: i,
        failed: failed.length,
        current: photo.id,
      });
    }

    // Validate photo has required data
    if (!photo.blob) {
      console.error('[UploadService] ❌ Photo has no blob, skipping:', photo.id);
      failed.push({ photo, error: 'Photo data missing (no blob)' });
      await updatePhotoStatus(photo.id, 'failed', 'Photo data missing');
      continue;
    }

    if (!photo.participantId) {
      console.error('[UploadService] ❌ Photo has no participantId, skipping:', photo.id);
      failed.push({ photo, error: 'Participant ID missing' });
      await updatePhotoStatus(photo.id, 'failed', 'Participant ID missing');
      continue;
    }

    if (!photo.filteredBlob) {
      console.error('[UploadService] Photo has no prepared filtered blob, skipping:', photo.id);
      failed.push({ photo, error: 'Photo processing did not finish. Capture it again.' });
      await updatePhotoStatus(photo.id, 'failed', 'Photo processing did not finish. Capture it again.');
      continue;
    }

    try {
      // Mark as uploading
      await updatePhotoStatus(photo.id, 'uploading');

      // A participant may have been created locally while the backend was
      // unreachable. Create it with the same stable ID before uploading photos.
      await createParticipantOnServer(eventId, photo.participantName, photo.participantId);
      
      console.log('[UploadService] Uploading photo:', {
        id: photo.id,
        eventId: eventId,
        participantId: photo.participantId,
        blobSize: (photo.blob.size / 1024).toFixed(1) + ' KB',
        blobType: photo.blob.type
      });

      // Upload to backend with retry logic for network issues
      let uploadSuccess = false;
      let lastError: Error | null = null;
      const maxRetries = 2; // Try up to 3 times total (1 + 2 retries)
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[UploadService] Retry attempt ${attempt} for photo:`, photo.id);
            // Wait a bit before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
          }
          
          console.log(`[UploadService] Attempt ${attempt + 1}/${maxRetries + 1} - Calling apiUploadPhoto`);
          
          await apiUploadPhoto(
            eventId,
            photo.participantId,
            photo.blob,
            photo.id,
            photo.fullImageUrl,
            photo.filteredBlob
          );
          uploadSuccess = true;
          console.log(`[UploadService] ✅ Upload succeeded on attempt ${attempt + 1}`);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
          console.error(`[UploadService] ❌ Upload attempt ${attempt + 1} failed:`, {
            message: lastError.message,
            name: lastError.name,
            photoId: photo.id,
            attempt: attempt + 1,
            willRetry: attempt < maxRetries
          });
          
          // Don't retry if it's a client error (4xx)
          if (lastError.message.includes('400') || lastError.message.includes('404')) {
            console.log(`[UploadService] Client error detected, won't retry`);
            break;
          }
        }
      }

      if (uploadSuccess) {
        try {
          await markUploadedWithRetry(photo.id);
        } catch (statusError) {
          console.error('[UploadService] Original uploaded, but local status could not be updated:', statusError);
        }

        succeeded.push(photo);
        console.log('[UploadService] Photo uploaded successfully:', photo.id);
      } else {
        throw lastError || new Error('Upload failed after retries');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error('[UploadService] ❌ Photo upload failed permanently:', {
        photoId: photo.id,
        error: errorMessage,
        errorType: error instanceof Error ? error.name : typeof error
      });
      
      // Mark as failed
      await updatePhotoStatus(photo.id, 'failed', errorMessage);
      failed.push({ photo, error: errorMessage });
    }

    if (onProgress) {
      onProgress({
        total: photosToUpload.length,
        completed: succeeded.length,
        failed: failed.length,
        current: i < photosToUpload.length - 1 ? photosToUpload[i + 1].id : undefined,
      });
    }
  }

  // Reconcile all server-confirmed uploads before returning UI results.
  for (const photo of succeeded) {
    try {
      await markUploadedWithRetry(photo.id);
    } catch (statusError) {
      console.error('[UploadService] Could not reconcile uploaded photo status:', { photoId: photo.id, statusError });
    }
  }

  if (onProgress) {
    onProgress({
      total: photosToUpload.length,
      completed: succeeded.length,
      failed: failed.length,
    });
  }

  console.log('[UploadService] Upload complete:', succeeded.length, 'succeeded,', failed.length, 'failed');

  return { succeeded, failed };
}

/**
 * Retry failed uploads for an event
 */
export async function retryFailedUploads(
  eventId: string,
  onProgress?: UploadProgressCallback
): Promise<{ succeeded: Photo[]; failed: { photo: Photo; error: string }[] }> {
  console.log('[UploadService] Retrying failed uploads');
  return uploadPendingPhotos(eventId, onProgress);
}

/**
 * Get upload statistics for an event
 */
export async function getUploadStats(eventId: string) {
  const photosToUpload = await getPhotosToUpload(eventId);
  
  return {
    pendingCount: photosToUpload.filter(p => p.status === 'local').length,
    failedCount: photosToUpload.filter(p => p.status === 'failed').length,
    totalPending: photosToUpload.length,
  };
}
