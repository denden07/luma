// Participant management utilities

interface Participant {
  participantToken: string;
  eventToken: string;
  name: string;
  photosRemaining: number;
  createdAt: string;
}

const STORAGE_KEY = 'luma_participant';

/**
 * Generate a cryptographically random participant token
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
export function getParticipant(eventToken: string): Participant | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const participant: Participant = JSON.parse(stored);
    
    // Only return if it matches the current event
    if (participant.eventToken === eventToken) {
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
export function createParticipant(eventToken: string, name: string, maxPhotos: number = 10): Participant {
  const participant: Participant = {
    participantToken: generateParticipantToken(),
    eventToken,
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
