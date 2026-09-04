import * as local from './apiService';
import * as supabase from './supabaseService';
import { isSupabaseMode } from '../utils/env';

export type { Event, Host, Participant, PhotoMetadata } from './apiService';

const provider = isSupabaseMode() ? supabase : local;

export const getPhotoUrl = provider.getPhotoUrl;
export const createEvent = provider.createEvent;
export const uploadEventCover = provider.uploadEventCover;
export const getEvent = provider.getEvent;
export const getAllEvents = provider.getAllEvents;
export const getEventsByHostCode = provider.getEventsByHostCode;
export const createParticipant = provider.createParticipant;
export const getEventParticipants = provider.getEventParticipants;
export const uploadPhoto = provider.uploadPhoto;
export const uploadFilteredPhoto = provider.uploadFilteredPhoto;
export const getEventPhotos = provider.getEventPhotos;
export const getPhoto = provider.getPhoto;
export const deletePhoto = provider.deletePhoto;
export const downloadEventPhotosZip = provider.downloadEventPhotosZip;
export const createHost = provider.createHost;
export const loginHost = provider.loginHost;
export const checkBackendHealth = provider.checkBackendHealth;