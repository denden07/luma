// API Service - Local Backend Implementation
// This service communicates with the local PostgreSQL backend

import { generateUUID } from '../utils/indexedDBStorage';
import type { FilterId } from '../utils/filters';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface Event {
  id: string;
  name: string;
  date: string;
  guest_limit: number;
  photo_limit: number;
  start_time: string | null;
  end_time: string | null;
  cover_photo_path: string | null;
  enabled_filters: FilterId[];
  host_code: string;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  event_id: string;
  name: string;
  created_at: string;
}

export interface PhotoMetadata {
  id: string;
  event_id: string;
  participant_id: string;
  participant_name?: string; // From JOIN with participants table
  storage_path: string;
  thumbnail_path?: string;
  created_at: string;
}

export interface Host {
  id: string;
  code: string;
  created_at: string;
}

// Helper to get photo URL from storage path
export function getPhotoUrl(storagePath: string): string {
  return `${API_BASE_URL}/uploads${storagePath}`;
}

// Event Operations
export async function createEvent(
  name: string,
  date: string,
  guestLimit: number = 30,
  hostCode: string,
  startTime?: string,
  endTime?: string,
  photoLimit: number = 20,
  enabledFilters: FilterId[] = []
): Promise<Event> {
  const response = await fetch(`${API_BASE_URL}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      date,
      guest_limit: guestLimit,
      photo_limit: photoLimit,
      start_time: startTime,
      end_time: endTime,
      enabled_filters: enabledFilters,
      host_code: hostCode,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create event');
  }

  return response.json();
}

export async function uploadEventCover(eventId: string, hostCode: string, cover: File): Promise<Event> {
  const formData = new FormData();
  formData.append('cover', cover);
  formData.append('host_code', hostCode);

  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/cover`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to upload event cover' }));
    throw new Error(error.error || 'Failed to upload event cover');
  }
  return response.json();
}

export async function getEvent(eventId: string): Promise<Event> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch event');
  }

  return response.json();
}

export async function getAllEvents(): Promise<Event[]> {
  const response = await fetch(`${API_BASE_URL}/api/events`);

  if (!response.ok) {
    throw new Error('Failed to fetch events');
  }

  return response.json();
}

export async function getEventsByHostCode(hostCode: string): Promise<Event[]> {
  const response = await fetch(`${API_BASE_URL}/api/events?host_code=${encodeURIComponent(hostCode)}`);

  if (!response.ok) {
    throw new Error('Failed to fetch events');
  }

  return response.json();
}

// Participant Operations
export async function createParticipant(
  eventId: string,
  name: string,
  participantId?: string
): Promise<Participant> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, id: participantId }),
  });

  if (!response.ok) {
    throw new Error('Failed to create participant');
  }

  return response.json();
}

export async function getEventParticipants(eventId: string): Promise<Participant[]> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/participants`);

  if (!response.ok) {
    throw new Error('Failed to fetch participants');
  }

  return response.json();
}

// Photo Operations
export async function uploadPhoto(
  eventId: string,
  participantId: string,
  photoBlob: Blob,
  photoId?: string,
  photoDataUrl?: string
): Promise<PhotoMetadata> {
  try {
    const finalPhotoId = photoId || generateUUID();
    
    console.log('[API Service] uploadPhoto called:', {
      eventId,
      participantId,
      photoId: finalPhotoId,
      blobSize: photoBlob.size,
      blobType: photoBlob.type,
      apiUrl: API_BASE_URL
    });
    
    const blob = photoBlob.type ? photoBlob : new Blob([photoBlob], { type: 'image/jpeg' });
    const uploadUrl = `${API_BASE_URL}/api/events/${eventId}/photos`;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      if (!photoDataUrl?.startsWith('data:image/')) {
        throw new Error('Photo data is unavailable for iOS upload');
      }

      const response = await fetch(`${uploadUrl}-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: finalPhotoId, participant_id: participantId, image_data: photoDataUrl }),
      });

      const result = await response.json() as PhotoMetadata & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload photo');
      }

      console.log('[API Service] ✅ Upload successful:', result);
      return result;
    }
    
    console.log('[API Service] Creating FormData with blob:', {
      size: blob.size,
      type: blob.type
    });
    
    const formData = new FormData();
    formData.append('photo', blob, 'photo.jpg');
    formData.append('id', finalPhotoId);
    formData.append('participant_id', participantId);
    
    console.log('[API Service] FormData created, sending request to:', uploadUrl);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });
    
    console.log('[API Service] Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      let errorMessage = 'Failed to upload photo';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
        console.error('[API Service] Upload failed with error:', error);
      } catch (parseError) {
        console.error('[API Service] Failed to parse error response:', parseError);
        errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log('[API Service] ✅ Upload successful:', result);
    return result;
  } catch (error) {
    console.error('[API Service] ❌ Upload error:', error);
    if (error instanceof Error) {
      console.error('[API Service] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    throw error;
  }
}

export async function getEventPhotos(eventId: string): Promise<PhotoMetadata[]> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/photos`);

  if (!response.ok) {
    throw new Error('Failed to fetch photos');
  }

  return response.json();
}

export async function downloadEventPhotosZip(eventId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/photos/download`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Could not prepare photo download' }));
    throw new Error(error.error || 'Could not prepare photo download');
  }
  return response.blob();
}

export async function getPhoto(photoId: string): Promise<PhotoMetadata> {
  const response = await fetch(`${API_BASE_URL}/api/photos/${photoId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch photo');
  }

  return response.json();
}

export async function deletePhoto(photoId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/photos/${photoId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete photo');
  }
}

// Host Operations
export async function createHost(code: string): Promise<Host> {
  const response = await fetch(`${API_BASE_URL}/api/hosts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create host code');
  }

  return response.json();
}

export async function loginHost(code: string): Promise<Host> {
  const response = await fetch(`${API_BASE_URL}/api/hosts/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to verify host code');
  }

  return response.json();
}

// Health check
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    return response.ok;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
}
