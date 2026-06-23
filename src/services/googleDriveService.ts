import { getSetting, setSetting } from './db';

// Placeholder for Google Client ID.
// The user can create a Desktop Application credentials project on Google Cloud Console and paste the Client ID here.
export const GOOGLE_CLIENT_ID = '235535166115-t2gf5dviv0r9j10redj2if4nvplqd052.apps.googleusercontent.com';

const REDIRECT_URI = 'http://127.0.0.1:18524';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp in ms
}

/** Cache active tokens in memory to avoid constant DB lookups */
let cachedTokens: OAuthTokens | null = null;

export function getAuthUrl(): string {
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'openid',
    'email'
  ].join(' ');

  return `${AUTH_URL}?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&prompt=consent`;
}

export async function exchangeAuthCode(code: string): Promise<OAuthTokens> {
  const params = new URLSearchParams();
  params.append('client_id', GOOGLE_CLIENT_ID);
  params.append('code', code);
  params.append('redirect_uri', REDIRECT_URI);
  params.append('grant_type', 'authorization_code');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to exchange code: ${res.status} ${res.statusText} - ${errText}`);
  }

  const data = await res.json();
  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };

  await saveTokens(tokens);
  return tokens;
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const params = new URLSearchParams();
  params.append('client_id', GOOGLE_CLIENT_ID);
  params.append('refresh_token', refreshToken);
  params.append('grant_type', 'refresh_token');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to refresh token: ${res.status} ${res.statusText} - ${errText}`);
  }

  const data = await res.json();
  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    refreshToken: refreshToken, // reuse existing refresh token
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };

  await saveTokens(tokens);
  return tokens;
}

export async function loadTokens(): Promise<OAuthTokens | null> {
  if (cachedTokens) return cachedTokens;

  const refreshToken = await getSetting('gdrive_refresh_token');
  if (!refreshToken) return null;

  const expiresAtStr = await getSetting('gdrive_expires_at');
  const expiresAt = expiresAtStr ? Number(expiresAtStr) : 0;
  const accessToken = (await getSetting('gdrive_access_token')) || '';

  cachedTokens = { accessToken, refreshToken, expiresAt };
  return cachedTokens;
}

async function saveTokens(tokens: OAuthTokens): Promise<void> {
  cachedTokens = tokens;
  await setSetting('gdrive_refresh_token', tokens.refreshToken);
  await setSetting('gdrive_access_token', tokens.accessToken);
  await setSetting('gdrive_expires_at', String(tokens.expiresAt));
}

export async function clearTokens(): Promise<void> {
  cachedTokens = null;
  await setSetting('gdrive_refresh_token', '');
  await setSetting('gdrive_access_token', '');
  await setSetting('gdrive_expires_at', '');
}

/** Ensure we have a valid access token, refreshing if necessary */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;

  // If expiring in less than 5 minutes, refresh it
  if (tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
    try {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      return refreshed.accessToken;
    } catch (err) {
      console.error('Failed to auto refresh access token', err);
      return null;
    }
  }

  return tokens.accessToken;
}

/** Search for a backup file by name on GDrive and return its ID if found */
export async function findBackupFile(accessToken: string, isTest: boolean): Promise<string | null> {
  const filename = isTest ? 'aalsi_chatore_test_backup.db' : 'aalsi_chatore_backup.db';
  const query = `name = '${filename}' and trashed = false`;
  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Find backup file failed: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/** Upload database bytes to GDrive. Creates a new file or updates an existing one */
export async function uploadBackupFile(
  accessToken: string,
  dbBytes: Uint8Array,
  isTest: boolean
): Promise<string> {
  const filename = isTest ? 'aalsi_chatore_test_backup.db' : 'aalsi_chatore_backup.db';
  const fileId = await findBackupFile(accessToken, isTest);

  if (fileId) {
    // Update existing file content
    const uploadUrl = `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`;
    const res = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-sqlite3',
      },
      body: new Blob([dbBytes as any]),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Update backup file failed: ${res.status} ${res.statusText} - ${text}`);
    }

    return fileId;
  } else {
    // 1. Create file placeholder/metadata
    const createRes = await fetch(DRIVE_FILES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: filename,
        mimeType: 'application/x-sqlite3',
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Create metadata failed: ${createRes.status} ${createRes.statusText} - ${text}`);
    }

    const fileMeta = await createRes.json();
    const newFileId = fileMeta.id;

    // 2. Upload the file body
    const uploadUrl = `${DRIVE_UPLOAD_URL}/${newFileId}?uploadType=media`;
    const res = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-sqlite3',
      },
      body: new Blob([dbBytes as any]),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upload new backup content failed: ${res.status} ${res.statusText} - ${text}`);
    }

    return newFileId;
  }
}

/** Download database file bytes from GDrive */
export async function downloadBackupFile(accessToken: string, fileId: string): Promise<Uint8Array> {
  const url = `${DRIVE_FILES_URL}/${fileId}?alt=media`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Download backup file failed: ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
