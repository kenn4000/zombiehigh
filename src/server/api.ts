// src/api.ts

export function resolveApiBaseUrl(): string {
  const hasBrowserWindow = typeof globalThis !== 'undefined'
    && 'window' in globalThis
    && !!(globalThis as any).window?.location;

  if (hasBrowserWindow) {
    return '';
  }

  const envUrl = typeof process !== 'undefined' && process.env ? process.env.API_URL : undefined;
  return envUrl || 'http://localhost:3001';
}

const API_BASE_URL = resolveApiBaseUrl();

/**
 * Make a GET request to the API
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API GET ${endpoint} failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return (await response.json()) as T;
}

/**
 * Make a POST request to the API
 */
export async function apiPost<T>(endpoint: string, data?: any): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API POST ${endpoint} failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return (await response.json()) as T;
}

/**
 * Make a PUT request to the API
 */
export async function apiPut<T>(endpoint: string, data?: any): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API PUT ${endpoint} failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return (await response.json()) as T;
}

/**
 * Make a DELETE request to the API
 */
export async function apiDelete<T>(endpoint: string): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API DELETE ${endpoint} failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return (await response.json()) as T;
}