import type { Event } from './apiService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface AdminEvent extends Event {
  participant_count: number;
  photo_count: number;
}

export interface AdminHost {
  id: string;
  code: string;
  is_active: boolean;
  created_at: string;
  event_count: number;
}

function getCsrfToken() {
  return document.cookie
    .split('; ')
    .find(cookie => cookie.startsWith('luma_admin_csrf_v2='))
    ?.split('=')[1];
}

async function adminFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const csrfToken = getCsrfToken();
  if (csrfToken && !['GET', 'HEAD'].includes(options.method ?? 'GET')) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`${API_BASE_URL}/api/admin${path}`, { ...options, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? 'Request failed');
  }
  return response;
}

export async function loginAdmin(email: string, password: string) {
  await adminFetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function getAdminSession() {
  const response = await adminFetch('/session');
  return response.json() as Promise<{ authenticated: true; adminId: string }>;
}

export async function logoutAdmin() {
  await adminFetch('/logout', { method: 'POST' });
}

export async function getAdminEventsForMonth(year: number, month: number) {
  const response = await adminFetch(`/events/month?year=${year}&month=${month}`);
  return response.json() as Promise<AdminEvent[]>;
}

export async function generateAdminHostCode() {
  const response = await adminFetch('/host-codes', { method: 'POST' });
  return response.json() as Promise<{ id: string; code: string; created_at: string }>;
}

export async function updateAdminEvent(eventId: string, changes: Partial<Pick<Event, 'is_active' | 'price_php' | 'payment_status'>>) {
  const response = await adminFetch(`/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  return response.json() as Promise<Event>;
}

export interface AdminHostsPage {
  hosts: AdminHost[];
  page: number;
  pageSize: number;
  total: number;
}

export async function getAdminHostsPage(params: { page: number; pageSize: number; search?: string; startDate?: string; endDate?: string }) {
  const search = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) });
  if (params.search) search.set('search', params.search);
  if (params.startDate) search.set('start_date', params.startDate);
  if (params.endDate) search.set('end_date', params.endDate);
  const response = await adminFetch(`/hosts/page?${search.toString()}`);
  return response.json() as Promise<AdminHostsPage>;
}

export interface AdminEventsPage {
  events: AdminEvent[];
  page: number;
  pageSize: number;
  total: number;
}

export async function getAdminEventsPage(params: { page: number; pageSize: number; hostCode?: string; status?: string; payment?: string; startDate?: string; endDate?: string; sort?: string }) {
  const search = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize), sort: params.sort ?? 'date' });
  if (params.hostCode) search.set('host_code', params.hostCode);
  if (params.status && params.status !== 'all') search.set('status', params.status);
  if (params.payment && params.payment !== 'all') search.set('payment', params.payment);
  if (params.startDate) search.set('start_date', params.startDate);
  if (params.endDate) search.set('end_date', params.endDate);
  const response = await adminFetch(`/events/page?${search.toString()}`);
  return response.json() as Promise<AdminEventsPage>;
}

export async function updateAdminHost(hostId: string, isActive: boolean) {
  const response = await adminFetch(`/hosts/${hostId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: isActive }),
  });
  return response.json() as Promise<AdminHost>;
}