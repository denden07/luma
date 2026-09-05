// Shared types for madetogether backend

export interface Event {
  id: string;
  name: string;
  date: Date;
  guest_limit: number;
  photo_limit: number;
  start_time: Date | null;
  end_time: Date | null;
  cover_photo_path: string | null;
  enabled_filters: string[];
  host_code: string;
  is_active: boolean;
  price_php: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  created_at: Date;
  updated_at: Date;
}

export interface Participant {
  id: string;
  event_id: string;
  name: string;
  created_at: Date;
}

export interface Photo {
  id: string;
  event_id: string;
  participant_id: string;
  storage_path: string;
  filtered_storage_path?: string | null;
  thumbnail_path?: string;
  created_at: Date;
}

export interface Message {
  id: string;
  event_id: string;
  participant_id?: string;
  message: string;
  created_at: Date;
}

// Request/Response types
export interface CreateEventRequest {
  name: string;
  date: string;
  guest_limit?: number;
  photo_limit?: number;
  start_time?: string;
  end_time?: string;
  enabled_filters?: string[];
  host_code: string;
}

export interface CreateParticipantRequest {
  id?: string;
  name: string;
}

export interface CreatePhotoRequest {
  id: string; // Client-generated UUID
  participant_id: string;
}

export interface CreateMessageRequest {
  participant_id?: string;
  message: string;
}
