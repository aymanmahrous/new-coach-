import type { MediaProviderKey, RemoteMediaItem } from "./media-source-hub";

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID ?? "").trim();
const PHOTOS_CLIENT_ID = (import.meta.env.VITE_GOOGLE_PHOTOS_CLIENT_ID ?? GOOGLE_CLIENT_ID).trim();
const DROPBOX_CLIENT_ID = (import.meta.env.VITE_DROPBOX_CLIENT_ID ?? "").trim();
const ONEDRIVE_CLIENT_ID = (import.meta.env.VITE_ONEDRIVE_CLIENT_ID ?? "").trim();
const DRIVE_FOLDER = (import.meta.env.VITE_MASSIVE_ARCHIVE_DRIVE_FOLDER_URL ?? "").trim();
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_PHOTOS_SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly";

type TokenClient = { requestAccessToken: () => void };
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string }) => void }) => TokenClient } } };
  }
}

type DriveFile = { id: string; name: string; mimeType: string; size?: string; createdTime?: string; webViewLink?: string };
type PhotosMediaItem = { id: string; filename?: string; mimeType?: string; mediaMetadata?: { creationTime?: string }; productUrl?: string; baseUrl?: string };

type PopupTokenConfig = { provider: "dropbox" | "onedrive"; clientId: string; authorizeUrl: string; scope: string };

function resolveFolderId(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const folderMatch = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return folderMatch?.[1] ?? (/^[a-zA-Z0-9_-]{10,}$/.test(value) ? value : "");
}

async function loadGoogleScript(): Promise<void> {
  if (typeof document === "undefined") return;
  if (window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("GOOGLE_SCRIPT_FAILED")), { once: true }); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true; script.dataset.googleIdentity = "true";
    script.onload = () => resolve(); script.onerror = () => reject(new Error("GOOGLE_SCRIPT_FAILED")); document.head.appendChild(script);
  });
}

async function connectGoogle(clientId: string, scope: string): Promise<string> {
  if (!clientId) throw new Error("GOOGLE_PROVIDER_NOT_CONFIGURED");
  await loadGoogleScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("GOOGLE_OAUTH_UNAVAILABLE");
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({ client_id: clientId, scope, callback: (response) => {
      if (response.error || !response.access_token) { reject(new Error(response.error ?? "GOOGLE_CONNECT_FAILED")); return; }
      resolve(response.access_token);
    } });
    client.requestAccessToken();
  });
}

async function jsonFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error?.message === "string" ? body.error.message : `REMOTE_HTTP_${response.status}`);
  return body as T;
}

export function isGoogleDriveMediaConfigured(): boolean { return Boolean(GOOGLE_CLIENT_ID && resolveFolderId(DRIVE_FOLDER)); }
export function isGooglePhotosMediaConfigured(): boolean { return Boolean(PHOTOS_CLIENT_ID); }
export function isDropboxMediaConfigured(): boolean { return Boolean(DROPBOX_CLIENT_ID); }
export function isOneDriveMediaConfigured(): boolean { return Boolean(ONEDRIVE_CLIENT_ID); }

export function connectGoogleDriveForMedia(): Promise<string> { return connectGoogle(GOOGLE_CLIENT_ID, GOOGLE_DRIVE_SCOPE); }
export function connectGooglePhotosForMedia(): Promise<string> { return connectGoogle(PHOTOS_CLIENT_ID, GOOGLE_PHOTOS_SCOPE); }

export async function fetchGoogleDriveMedia(token: string): Promise<RemoteMediaItem[]> {
  const folderId = resolveFolderId(DRIVE_FOLDER); if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_NOT_CONFIGURED");
  const params = new URLSearchParams({ q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`, pageSize: "100", orderBy: "name", fields: "nextPageToken,files(id,name,mimeType,size,createdTime,webViewLink)" });
  const files: DriveFile[] = []; let pageToken = "";
  do { if (pageToken) params.set("pageToken", pageToken); const result = await jsonFetch<{ files?: DriveFile[]; nextPageToken?: string }>(`https://www.googleapis.com/drive/v3/files?${params}`, token); files.push(...(result.files ?? [])); pageToken = result.nextPageToken ?? ""; } while (pageToken);
  return files.map((file) => ({ id: `google_drive:${file.id}`, provider: "google_drive", name: file.name, mimeType: file.mimeType, webUrl: file.webViewLink ?? `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`, sizeBytes: file.size ? Number(file.size) : undefined, createdAt: file.createdTime, folder: "Massive Archive", consent: "needs_review" }));
}

export async function fetchGooglePhotosMedia(token: string): Promise<RemoteMediaItem[]> {
  const items: PhotosMediaItem[] = []; let pageToken = "";
  do { const result = await jsonFetch<{ mediaItems?: PhotosMediaItem[]; nextPageToken?: string }>("https://photoslibrary.googleapis.com/v1/mediaItems:search", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageSize: 100, pageToken: pageToken || undefined, filters: { contentFilter: { includedContentCategories: ["NONE"] } } }) }); items.push(...(result.mediaItems ?? [])); pageToken = result.nextPageToken ?? ""; } while (pageToken);
  return items.filter((item) => item.mimeType?.startsWith("image/") || item.mimeType?.startsWith("video/")).map((item) => ({ id: `google_photos:${item.id}`, provider: "google_photos", name: item.filename ?? item.id, mimeType: item.mimeType ?? "application/octet-stream", webUrl: item.productUrl ?? "https://photos.google.com/", previewUrl: item.baseUrl, createdAt: item.mediaMetadata?.creationTime, folder: "Google Photos", consent: "needs_review" }));
}

function popupToken(config: PopupTokenConfig): Promise<string> {
  if (!config.clientId) return Promise.reject(new Error(`${config.provider.toUpperCase()}_NOT_CONFIGURED`));
  if (typeof window === "undefined") return Promise.reject(new Error("BROWSER_REQUIRED"));
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  const popup = window.open(`${config.authorizeUrl}?${new URLSearchParams({ client_id: config.clientId, response_type: "token", redirect_uri: redirectUri, scope: config.scope, state: crypto.randomUUID() })}`, `${config.provider}-media-connect`, "width=520,height=700");
  if (!popup) return Promise.reject(new Error("POPUP_BLOCKED"));
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 120000) { window.clearInterval(timer); reject(new Error("OAUTH_TIMEOUT")); return; }
      try {
        if (popup.closed) { window.clearInterval(timer); reject(new Error("OAUTH_CANCELLED")); return; }
        const hash = popup.location.hash;
        const token = new URLSearchParams(hash.replace(/^#/, "")).get("access_token");
        const error = new URLSearchParams(hash.replace(/^#/, "")).get("error");
        if (token) { window.clearInterval(timer); popup.close(); resolve(token); }
        else if (error) { window.clearInterval(timer); popup.close(); reject(new Error(`${config.provider.toUpperCase()}_${error.toUpperCase()}`)); }
      } catch { /* Cross-origin until the provider redirects back; keep waiting. */ }
    }, 250);
  });
}

export function connectDropboxForMedia(): Promise<string> { return popupToken({ provider: "dropbox", clientId: DROPBOX_CLIENT_ID, authorizeUrl: "https://www.dropbox.com/oauth2/authorize", scope: "files.content.read" }); }
export function connectOneDriveForMedia(): Promise<string> { return popupToken({ provider: "onedrive", clientId: ONEDRIVE_CLIENT_ID, authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", scope: "Files.Read" }); }

export async function fetchDropboxMedia(token: string): Promise<RemoteMediaItem[]> {
  const entries: Array<{ id: string; name: string; path_display?: string; server_modified?: string; size?: number; ".tag": string }> = [];
  let cursor: string | undefined;
  do { const result = await jsonFetch<{ entries?: typeof entries; cursor?: string; has_more?: boolean }>(cursor ? "https://api.dropboxapi.com/2/files/list_folder/continue" : "https://api.dropboxapi.com/2/files/list_folder", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cursor ? { cursor } : { path: "", recursive: true, include_media_info: true }) }); entries.push(...(result.entries ?? [])); cursor = result.has_more ? result.cursor : undefined; } while (cursor);
  return entries.filter((file) => file[".tag"] === "file" && /\.(jpe?g|png|gif|webp|mp4|mov|webm)$/i.test(file.name)).map((file) => {
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    const isVideo = ["mp4", "mov", "webm"].includes(extension);
    const path = file.path_display ?? "";
    return { id: `dropbox:${file.id}`, provider: "dropbox", name: file.name, mimeType: isVideo ? "video/*" : "image/*", webUrl: path ? `https://www.dropbox.com/home${encodeURI(path)}` : "https://www.dropbox.com/home", createdAt: file.server_modified, folder: path.split("/").slice(0, -1).join("/") || "Dropbox", sizeBytes: file.size, consent: "needs_review" };
  });
}

export async function fetchOneDriveMedia(token: string): Promise<RemoteMediaItem[]> {
  const items: Array<{ id: string; name: string; webUrl?: string; size?: number; createdDateTime?: string; file?: { mimeType?: string }; folder?: unknown }> = []; let url = "https://graph.microsoft.com/v1.0/me/drive/root/children?$top=200";
  do { const result = await jsonFetch<{ value?: typeof items; "@odata.nextLink"?: string }>(url, token); items.push(...(result.value ?? [])); url = result["@odata.nextLink"] ?? ""; } while (url);
  return items.filter((item) => item.file?.mimeType?.startsWith("image/") || item.file?.mimeType?.startsWith("video/")).map((item) => ({ id: `onedrive:${item.id}`, provider: "onedrive", name: item.name, mimeType: item.file?.mimeType ?? "application/octet-stream", webUrl: item.webUrl ?? "https://onedrive.live.com/", createdAt: item.createdDateTime, folder: "OneDrive", sizeBytes: item.size, consent: "needs_review" }));
}

export async function fetchProviderMedia(provider: MediaProviderKey, token: string): Promise<RemoteMediaItem[]> {
  if (provider === "google_drive") return fetchGoogleDriveMedia(token);
  if (provider === "google_photos") return fetchGooglePhotosMedia(token);
  if (provider === "dropbox") return fetchDropboxMedia(token);
  return fetchOneDriveMedia(token);
}

export function connectProviderMedia(provider: MediaProviderKey): Promise<string> {
  if (provider === "google_drive") return connectGoogleDriveForMedia();
  if (provider === "google_photos") return connectGooglePhotosForMedia();
  if (provider === "dropbox") return connectDropboxForMedia();
  return connectOneDriveForMedia();
}
