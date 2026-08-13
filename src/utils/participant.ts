// Participant management utilities
// Updated to support stable UUIDs and event IDs

interface Participant {
  participantId: string; // UUID
  participantToken: string; // For backwards compatibility
  eventId: string; // Changed from eventToken
  name: string;
  photosRemaining: number;
  createdAt: string;
}

const STORAGE_KEY = 'madetogether_participant';

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a cryptographically random participant token (for backwards compatibility)
 */
export function generateParticipantToken(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const hex = Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `p_${hex}`;
}

/**
 * Save participant to localStorage
 */
export function saveParticipant(participant: Participant): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(participant));
  } catch (error) {
    console.error('Failed to save participant:', error);
  }
}

/**
 * Get participant from localStorage for a specific event
 */
export function getParticipant(eventId: string): Participant | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const participant: Participant = JSON.parse(stored);
    
    // Support both old eventToken and new eventId
    const participantEventId = participant.eventId || (participant as any).eventToken;
    
    // Only return if it matches the current event
    if (participantEventId === eventId) {
      // Ensure participant has an ID
      if (!participant.participantId) {
        participant.participantId = generateUUID();
        saveParticipant(participant);
      }
      return participant;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get participant:', error);
    return null;
  }
}

/**
 * Create a new participant
 */
export function createParticipant(eventId: string, name: string, maxPhotos: number = 10): Participant {
  const participant: Participant = {
    participantId: generateUUID(),
    participantToken: generateParticipantToken(),
    eventId,
    name,
    photosRemaining: maxPhotos,
    createdAt: new Date().toISOString(),
  };
  
  saveParticipant(participant);
  return participant;
}

/**
 * Update photos remaining
 */
export function updatePhotosRemaining(participant: Participant, remaining: number): Participant {
  const updated = { ...participant, photosRemaining: remaining };
  saveParticipant(updated);
  return updated;
}

/**
 * Clear participant data
 */
export function clearParticipant(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear participant:', error);
  }
}
