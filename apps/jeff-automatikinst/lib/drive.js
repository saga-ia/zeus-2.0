const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getSetting, setSetting } = require('./settings');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

function extractFolderId(url) {
  if (!url) return null;
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/) ||
            url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
            url.match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : null;
}

function buildAuthUrl(redirectUri, state) {
  const clientId = getSetting('google_client_id');
  if (!clientId) throw new Error('Configure google_client_id em Configurações');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    // state aleatório e de uso único, conferido na volta (anti-CSRF)
    state: state || 'drive_connect'
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code, redirectUri) {
  const clientId = getSetting('google_client_id');
  const clientSecret = getSetting('google_client_secret');
  const res = await axios.post(OAUTH_TOKEN_URL, {
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirectUri, grant_type: 'authorization_code'
  });
  const { access_token, refresh_token, expires_in } = res.data;
  if (refresh_token) setSetting('google_drive_refresh_token', refresh_token);
  setSetting('google_drive_access_token', access_token);
  setSetting('google_drive_expires_at', String(Math.floor(Date.now() / 1000) + expires_in - 60));
  return { access_token, refresh_token };
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = parseInt(getSetting('google_drive_expires_at') || '0', 10);
  const cached = getSetting('google_drive_access_token');
  if (cached && expiresAt > now) return cached;

  const refresh = getSetting('google_drive_refresh_token');
  if (!refresh) throw new Error('Google Drive não conectado — clique em Conectar Google Drive');

  const clientId = getSetting('google_client_id');
  const clientSecret = getSetting('google_client_secret');
  const res = await axios.post(OAUTH_TOKEN_URL, {
    refresh_token: refresh, client_id: clientId, client_secret: clientSecret,
    grant_type: 'refresh_token'
  });
  const { access_token, expires_in } = res.data;
  setSetting('google_drive_access_token', access_token);
  setSetting('google_drive_expires_at', String(now + expires_in - 60));
  return access_token;
}

async function driveGet(url, params) {
  const token = await getAccessToken();
  const res = await axios.get(url, {
    params, headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}

async function listFolder(folderId, { onlyMimeType, orderBy = 'name' } = {}) {
  let q = `'${folderId}' in parents and trashed = false`;
  if (onlyMimeType === 'folders') q += ` and mimeType = 'application/vnd.google-apps.folder'`;
  else if (onlyMimeType === 'media') q += ` and (mimeType contains 'image/' or mimeType contains 'video/')`;

  const all = [];
  let pageToken = undefined;
  do {
    const data = await driveGet(`${DRIVE_API}/files`, {
      q, fields: 'nextPageToken, files(id,name,mimeType,size,thumbnailLink,videoMediaMetadata,imageMediaMetadata)',
      pageSize: 1000, orderBy, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true
    });
    all.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

function naturalSort(arr, key = 'name') {
  return arr.slice().sort((a, b) => a[key].localeCompare(b[key], 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

async function downloadFile(fileId, destPath) {
  const token = await getAccessToken();
  const writer = fs.createWriteStream(destPath);
  const res = await axios.get(`${DRIVE_API}/files/${fileId}`, {
    params: { alt: 'media', supportsAllDrives: true },
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'stream'
  });
  await new Promise((resolve, reject) => {
    res.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  return destPath;
}

async function fileMeta(fileId) {
  return driveGet(`${DRIVE_API}/files/${fileId}`, {
    fields: 'id,name,mimeType,size', supportsAllDrives: true
  });
}

function extForMime(mime, fallbackName = '') {
  if (mime?.startsWith('image/jpeg')) return '.jpg';
  if (mime?.startsWith('image/png')) return '.png';
  if (mime?.startsWith('image/webp')) return '.webp';
  if (mime?.startsWith('video/mp4')) return '.mp4';
  if (mime?.startsWith('video/quicktime')) return '.mov';
  const dot = fallbackName.lastIndexOf('.');
  return dot > 0 ? fallbackName.slice(dot) : '';
}

function isConnected() {
  return !!getSetting('google_drive_refresh_token');
}

module.exports = {
  extractFolderId, buildAuthUrl, exchangeCode, isConnected,
  listFolder, naturalSort, downloadFile, fileMeta, extForMime, SCOPES
};
