import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import type { Event, Host, Participant, PhotoMetadata } from './apiService';
import type { FilterId } from '../utils/filters';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const photoBucket = import.meta.env.VITE_SUPABASE_PHOTO_BUCKET || 'event-photos';

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  client ??= createClient(supabaseUrl, supabaseAnonKey);
  return client;
}

function throwOnError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function photoPath(eventId: string, photoId: string): string {
  return `events/${eventId}/photos/${photoId}.jpg`;
}

function mapPhoto(row: PhotoMetadata & { participants?: { name: string } | null }): PhotoMetadata {
  return { ...row, participant_name: row.participants?.name ?? row.participant_name };
}

export function getPhotoUrl(storagePath: string): string {
  return getClient().storage.from(photoBucket).getPublicUrl(storagePath).data.publicUrl;
}

export async function createEvent(name: string, date: string, guestLimit: number, hostCode: string, startTime?: string, endTime?: string, photoLimit: number = 20, enabledFilters: FilterId[] = []): Promise<Event> {
  const { data, error } = await getClient().from('events').insert({
    name, date, guest_limit: guestLimit, photo_limit: photoLimit,
    start_time: startTime ?? null, end_time: endTime ?? null, enabled_filters: enabledFilters, host_code: hostCode,
  }).select().single();
  throwOnError(error);
  return data as Event;
}

export async function getEvent(eventId: string): Promise<Event> {
  const { data, error } = await getClient().from('events').select('*').eq('id', eventId).single();
  throwOnError(error);
  return data as Event;
}

export async function getAllEvents(): Promise<Event[]> {
  const { data, error } = await getClient().from('events').select('*').order('created_at', { ascending: false });
  throwOnError(error);
  return (data ?? []) as Event[];
}

export async function getEventsByHostCode(hostCode: string): Promise<Event[]> {
  const { data, error } = await getClient().from('events').select('*').eq('host_code', hostCode).order('created_at', { ascending: false });
  throwOnError(error);
  return (data ?? []) as Event[];
}

export async function createParticipant(eventId: string, name: string, participantId?: string): Promise<Participant> {
  const query = participantId
    ? getClient().from('participants').upsert({ id: participantId, event_id: eventId, name } as never)
    : getClient().from('participants').insert({ event_id: eventId, name } as never);
  const { data, error } = await query.select().single();
  throwOnError(error);
  return data as Participant;
}

export async function getEventParticipants(eventId: string): Promise<Participant[]> {
  const { data, error } = await getClient().from('participants').select('*').eq('event_id', eventId).order('created_at');
  throwOnError(error);
  return (data ?? []) as Participant[];
}

export async function uploadPhoto(eventId: string, participantId: string, photoBlob: Blob, photoId: string, _photoDataUrl?: string): Promise<PhotoMetadata> {
  const path = photoPath(eventId, photoId);
  const { error: uploadError } = await getClient().storage.from(photoBucket).upload(path, photoBlob, {
    contentType: photoBlob.type || 'image/jpeg', upsert: true,
  });
  throwOnError(uploadError);

  const { data, error } = await getClient().from('photos').upsert({
    id: photoId, event_id: eventId, participant_id: participantId, storage_path: path,
  }).select().single();
  throwOnError(error);
  return data as PhotoMetadata;
}

export async function getEventPhotos(eventId: string): Promise<PhotoMetadata[]> {
  const { data, error } = await getClient().from('photos')
    .select('*, participants(name)').eq('event_id', eventId).order('created_at', { ascending: false });
  throwOnError(error);
  return (data ?? []).map(row => mapPhoto(row as PhotoMetadata & { participants?: { name: string } | null }));
}

export async function getPhoto(photoId: string): Promise<PhotoMetadata> {
  const { data, error } = await getClient().from('photos').select('*').eq('id', photoId).single();
  throwOnError(error);
  return data as PhotoMetadata;
}

export async function deletePhoto(photoId: string): Promise<void> {
  const { data, error } = await getClient().from('photos').select('storage_path').eq('id', photoId).single();
  throwOnError(error);
  if (!data) throw new Error('Photo not found');
  const { error: removeError } = await getClient().storage.from(photoBucket).remove([data.storage_path]);
  throwOnError(removeError);
  const { error: deleteError } = await getClient().from('photos').delete().eq('id', photoId);
  throwOnError(deleteError);
}

export async function downloadEventPhotosZip(eventId: string): Promise<Blob> {
  const { data, error } = await getClient().from('photos').select('id, storage_path').eq('event_id', eventId);
  throwOnError(error);
  const zip = new JSZip();
  await Promise.all((data ?? []).map(async photo => {
    const { data: file, error: downloadError } = await getClient().storage.from(photoBucket).download(photo.storage_path);
    throwOnError(downloadError);
    if (!file) throw new Error(`Could not download photo ${photo.id}`);
    zip.file(`${photo.id}.jpg`, file);
  }));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function createHost(code: string): Promise<Host> {
  const { data, error } = await getClient().from('hosts').insert({ code }).select().single();
  throwOnError(error);
  return data as Host;
}

export async function loginHost(code: string): Promise<Host> {
  const { data, error } = await getClient().from('hosts').select('*').eq('code', code).single();
  throwOnError(error);
  return data as Host;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    await getClient().from('events').select('id').limit(1);
    return true;
  } catch {
    return false;
  }
}

export async function uploadEventCover(_eventId: string, _hostCode: string, _cover: File): Promise<Event> {
  throw new Error('Background photo upload will be available after Cloudflare R2 is configured.');
}