// Environment utilities

export const APP_MODE = import.meta.env.VITE_APP_MODE || 'local';
export const DATA_PROVIDER = import.meta.env.VITE_DATA_PROVIDER || 'local';

export const isLocalMode = () => APP_MODE === 'local';
export const isProductionMode = () => APP_MODE === 'production';
export const isSupabaseMode = () => DATA_PROVIDER === 'supabase';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
