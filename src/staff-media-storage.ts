const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
export const STAFF_MEDIA_BUCKET = "relax-fix-media";

type StaffStorageSession = { accessToken: string };

function encodedStoragePath(storagePath: string) {
  return storagePath.split("/").filter(Boolean).map((segment) => encodeURIComponent(segment)).join("/");
}

export function staffMediaObjectUrl(storagePath: string) {
  return `${SUPABASE_URL}/storage/v1/object/${STAFF_MEDIA_BUCKET}/${encodedStoragePath(storagePath)}`;
}

export async function fetchStaffMediaBlob(session: StaffStorageSession, storagePath: string, signal?: AbortSignal) {
  const response = await fetch(staffMediaObjectUrl(storagePath), {
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
    signal,
  });
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (!response.ok) throw new Error(`STORAGE_READ_FAILED_${response.status}`);
  return response.blob();
}

export async function fetchStaffMediaSignedUrl(
  session: StaffStorageSession,
  storagePath: string,
  expiresIn = 3600,
  signal?: AbortSignal,
) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${STAFF_MEDIA_BUCKET}/${encodedStoragePath(storagePath)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn }),
    cache: "no-store",
    signal,
  });
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (!response.ok) throw new Error(`STORAGE_SIGN_FAILED_${response.status}`);
  const payload = await response.json().catch(() => ({})) as { signedURL?: string };
  if (!payload.signedURL) throw new Error("STORAGE_SIGN_MISSING");
  return payload.signedURL.startsWith("http")
    ? payload.signedURL
    : `${SUPABASE_URL}/storage/v1${payload.signedURL}`;
}

export async function openStaffMediaAsset(session: StaffStorageSession, storagePath: string, fileName: string, mode: "open" | "download") {
  const signedUrl = await fetchStaffMediaSignedUrl(session, storagePath);
  const anchor = document.createElement("a");
  anchor.href = signedUrl;
  anchor.rel = "noopener noreferrer";
  if (mode === "download") anchor.download = fileName;
  else anchor.target = "_blank";
  anchor.click();
}

function readUserIdFromAccessToken(accessToken: string): string {
  const payload = accessToken.split(".")[1];
  if (!payload) throw new Error("INVALID_SESSION");
  const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string };
  if (!decoded.sub) throw new Error("INVALID_SESSION");
  return decoded.sub;
}

function inferAssetType(file: File): "image" | "video" {
  if (file.type.startsWith("video/")) return "video";
  return "image";
}

export async function uploadStaffMediaFile(session: StaffStorageSession, file: File, signal?: AbortSignal) {
  const userId = readUserIdFromAccessToken(session.accessToken);
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : inferAssetType(file) === "video" ? "mp4" : "jpg";
  const storagePath = `${userId}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${STAFF_MEDIA_BUCKET}/${encodedStoragePath(storagePath)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file,
    cache: "no-store",
    signal,
  });
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (!response.ok) throw new Error(`STORAGE_UPLOAD_FAILED_${response.status}`);
  return { storagePath, assetType: inferAssetType(file), fileName: file.name };
}
