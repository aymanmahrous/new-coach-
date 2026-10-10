import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Copy,
  ExternalLink,
  File as DriveFileIcon,
  Folder,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useLanguage } from "./i18n";
import type { Language } from "./i18n";
import "./google-drive-manager.css";

type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
};

type TokenClient = { requestAccessToken: () => void };

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID ?? "").trim();
const SOURCE = (import.meta.env.VITE_MASSIVE_ARCHIVE_DRIVE_FOLDER_URL ?? "").trim();
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function resolveDriveFolderId(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const folderMatch = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return folderMatch?.[1] ?? (/^[a-zA-Z0-9_-]{10,}$/.test(value) ? value : "");
}

const COPY: Record<
  Language,
  {
    kicker: string;
    title: string;
    body: string;
    connect: string;
    refresh: string;
    tokenNotice: string;
    unconfigured: string;
    loadingGoogle: string;
    connectFailed: string;
    back: string;
    newFolder: string;
    upload: string;
    folderName: string;
    create: string;
    open: string;
    rename: string;
    renamePrompt: string;
    trashConfirm: string;
    copySuccess: string;
    folderLabel: string;
    fileLabel: string;
    rootName: string;
    empty: string;
    busy: string;
    readFailed: string;
    createFailed: string;
    renameFailed: string;
    trashFailed: string;
    uploadFailed: string;
  }
> = {
  en: {
    kicker: "Optional management",
    title: "Google Drive Manager",
    body: "Browse and manage archive files after you connect. Nothing runs until you click Connect.",
    connect: "Connect to Google Drive",
    refresh: "Refresh",
    tokenNotice: "The Google access token stays in page memory only. It is never saved to localStorage or sessionStorage.",
    unconfigured: "Set VITE_GOOGLE_DRIVE_CLIENT_ID and VITE_MASSIVE_ARCHIVE_DRIVE_FOLDER_URL to enable this panel.",
    loadingGoogle: "Loading Google sign-in…",
    connectFailed: "Could not connect to Google Drive.",
    back: "Back",
    newFolder: "New folder",
    upload: "Upload file",
    folderName: "Folder name",
    create: "Create",
    open: "Open",
    rename: "Rename",
    renamePrompt: "New name",
    trashConfirm: "Move \"{name}\" to trash?",
    copySuccess: "Link copied.",
    folderLabel: "Folder",
    fileLabel: "File",
    rootName: "Massive Archive",
    empty: "This folder is empty.",
    busy: "Working…",
    readFailed: "Could not read Google Drive.",
    createFailed: "Could not create the folder.",
    renameFailed: "Could not rename the item.",
    trashFailed: "Could not move the item to trash.",
    uploadFailed: "Could not upload the file.",
  },
  ar: {
    kicker: "إدارة اختيارية",
    title: "Google Drive Manager",
    body: "تصفّح وأدر ملفات الأرشيف بعد الاتصال. لا يحدث شيء قبل الضغط على «الاتصال».",
    connect: "الاتصال بـ Google Drive",
    refresh: "تحديث",
    tokenNotice: "رمز Google يبقى في ذاكرة الصفحة فقط ولا يُحفظ في localStorage أو sessionStorage.",
    unconfigured: "اضبط VITE_GOOGLE_DRIVE_CLIENT_ID و VITE_MASSIVE_ARCHIVE_DRIVE_FOLDER_URL لتفعيل هذه اللوحة.",
    loadingGoogle: "جاري تحميل اتصال Google…",
    connectFailed: "تعذر الاتصال بـ Google Drive.",
    back: "رجوع",
    newFolder: "مجلد جديد",
    upload: "رفع ملف",
    folderName: "اسم المجلد",
    create: "إنشاء",
    open: "فتح",
    rename: "تعديل",
    renamePrompt: "الاسم الجديد",
    trashConfirm: "نقل «{name}» إلى سلة المهملات؟",
    copySuccess: "تم نسخ الرابط.",
    folderLabel: "مجلد",
    fileLabel: "ملف",
    rootName: "الأرشيف الضخم",
    empty: "المجلد فارغ.",
    busy: "جاري التنفيذ…",
    readFailed: "تعذر قراءة Google Drive.",
    createFailed: "تعذر إنشاء المجلد.",
    renameFailed: "تعذر إعادة التسمية.",
    trashFailed: "تعذر الحذف.",
    uploadFailed: "تعذر رفع الملف.",
  },
};

function loadGoogleScript(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-drive-identity="true"]');
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("GOOGLE_SCRIPT_FAILED")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleDriveIdentity = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("GOOGLE_SCRIPT_FAILED"));
    document.head.appendChild(script);
  });
}

async function driveFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body?.error?.message === "string" ? body.error.message : `DRIVE_HTTP_${response.status}`);
  }
  return response.json() as Promise<T>;
}

export default function GoogleDriveManagerView() {
  const { language } = useLanguage();
  const copy = COPY[language];
  const rootId = useMemo(() => resolveDriveFolderId(SOURCE), []);
  const configured = Boolean(CLIENT_ID && rootId);

  const [token, setToken] = useState("");
  const [items, setItems] = useState<DriveItem[]>([]);
  const [folderId, setFolderId] = useState(rootId);
  const [stack, setStack] = useState<{ id: string; name: string }[]>(
    rootId ? [{ id: rootId, name: copy.rootName }] : [],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [newName, setNewName] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  useEffect(() => {
    setStack(rootId ? [{ id: rootId, name: copy.rootName }] : []);
    setFolderId(rootId);
  }, [copy.rootName, rootId]);

  const load = async (id = folderId) => {
    if (!token || !id) return;
    setBusy(true);
    setMessage("");
    try {
      const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
      const result = await driveFetch<{ files?: DriveItem[] }>(
        token,
        `files?q=${q}&pageSize=100&orderBy=folder,name&fields=files(id,name,mimeType,size,webViewLink)`,
      );
      setItems(result.files ?? []);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : copy.readFailed);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (token) void load();
  }, [token, folderId]);

  async function connect() {
    if (!configured) return;
    setMessage(copy.loadingGoogle);
    try {
      await loadGoogleScript();
      if (!window.google?.accounts?.oauth2) {
        setMessage(copy.connectFailed);
        return;
      }
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            setMessage(response.error ?? copy.connectFailed);
            return;
          }
          setMessage("");
          setToken(response.access_token);
        },
      });
      client.requestAccessToken();
    } catch {
      setMessage(copy.connectFailed);
    }
  }

  function openFolder(item: DriveItem) {
    setStack((current) => [...current, { id: item.id, name: item.name }]);
    setFolderId(item.id);
  }

  function back() {
    if (stack.length <= 1) return;
    const next = stack.slice(0, -1);
    setStack(next);
    setFolderId(next.at(-1)!.id);
  }

  async function createFolder() {
    const name = newName.trim();
    if (!name || !token || !folderId) return;
    setBusy(true);
    try {
      await driveFetch(token, "files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [folderId] }),
      });
      setNewName("");
      setNewFolderOpen(false);
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : copy.createFailed);
    } finally {
      setBusy(false);
    }
  }

  async function rename(item: DriveItem) {
    const name = window.prompt(copy.renamePrompt, item.name)?.trim();
    if (!name || name === item.name || !token) return;
    setBusy(true);
    try {
      await driveFetch(token, `files/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : copy.renameFailed);
    } finally {
      setBusy(false);
    }
  }

  async function trash(item: DriveItem) {
    if (!token || !window.confirm(copy.trashConfirm.replace("{name}", item.name))) return;
    setBusy(true);
    try {
      await driveFetch(token, `files/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      });
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : copy.trashFailed);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(item: DriveItem) {
    const link = item.webViewLink ?? `https://drive.google.com/open?id=${item.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setMessage(copy.copySuccess);
    } catch {
      setMessage(link);
    }
  }

  async function upload(file: globalThis.File) {
    if (!token || !folderId) return;
    setBusy(true);
    try {
      const metadata = new Blob([JSON.stringify({ name: file.name, parents: [folderId] })], { type: "application/json" });
      const body = new FormData();
      body.append("metadata", metadata);
      body.append("file", file);
      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!response.ok) throw new Error(`DRIVE_UPLOAD_HTTP_${response.status}`);
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : copy.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <section className="drive-manager archive-drive-manager" aria-label={copy.title}>
        <div className="drive-manager-notice">
          <h3>{copy.title}</h3>
          <p>{copy.unconfigured}</p>
          <code>VITE_GOOGLE_DRIVE_CLIENT_ID</code>
          <code>VITE_MASSIVE_ARCHIVE_DRIVE_FOLDER_URL</code>
        </div>
      </section>
    );
  }

  return (
    <section className="drive-manager archive-drive-manager" aria-label={copy.title}>
      <header className="drive-manager-header">
        <div>
          <span className="drive-kicker">{copy.kicker}</span>
          <h3>{copy.title}</h3>
          <p>{copy.body}</p>
        </div>
        {!token ? (
          <button type="button" className="drive-primary" onClick={() => void connect()}>
            <LogIn size={17} aria-hidden="true" />
            {copy.connect}
          </button>
        ) : (
          <button type="button" className="drive-secondary" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={17} aria-hidden="true" />
            {copy.refresh}
          </button>
        )}
      </header>

      {!token ? (
        <div className="drive-manager-notice">
          <p>{copy.tokenNotice}</p>
        </div>
      ) : (
        <>
          <div className="drive-toolbar">
            <button type="button" onClick={back} disabled={stack.length <= 1}>
              <ChevronLeft size={17} aria-hidden="true" />
              {copy.back}
            </button>
            <strong>{stack.at(-1)?.name ?? copy.rootName}</strong>
            <button type="button" onClick={() => setNewFolderOpen(true)}>
              <Plus size={17} aria-hidden="true" />
              {copy.newFolder}
            </button>
            <label className="drive-upload">
              <Upload size={17} aria-hidden="true" />
              {copy.upload}
              <input
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          {newFolderOpen && (
            <div className="drive-dialog">
              <input
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={copy.folderName}
              />
              <button type="button" onClick={() => void createFolder()} disabled={busy || !newName.trim()}>
                {copy.create}
              </button>
              <button type="button" onClick={() => setNewFolderOpen(false)} aria-label={language === "ar" ? "إغلاق" : "Close"}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          )}

          {message && (
            <div className="drive-message" role="status">
              {message}
            </div>
          )}

          <div className="drive-list">
            {busy && (
              <div className="drive-loading">
                <Loader2 className="spin" size={20} aria-hidden="true" />
                {copy.busy}
              </div>
            )}
            {!busy && items.length === 0 && <div className="drive-empty">{copy.empty}</div>}
            {items.map((item) => (
              <article className="drive-row" key={item.id}>
                <div className="drive-item-icon" aria-hidden="true">
                  {item.mimeType === FOLDER_MIME ? <Folder size={21} /> : <DriveFileIcon size={21} />}
                </div>
                <div className="drive-item-main">
                  <strong>{item.name}</strong>
                  <small>
                    {item.mimeType === FOLDER_MIME
                      ? copy.folderLabel
                      : item.size
                        ? `${Number(item.size).toLocaleString()} bytes`
                        : copy.fileLabel}
                  </small>
                </div>
                <div className="drive-actions">
                  {item.mimeType === FOLDER_MIME && (
                    <button type="button" onClick={() => openFolder(item)}>
                      {copy.open}
                    </button>
                  )}
                  <button type="button" onClick={() => void rename(item)}>
                    {copy.rename}
                  </button>
                  <button type="button" onClick={() => void copyLink(item)} aria-label={copy.copySuccess}>
                    <Copy size={16} aria-hidden="true" />
                  </button>
                  {item.webViewLink && (
                    <a href={item.webViewLink} target="_blank" rel="noopener noreferrer" aria-label={copy.open}>
                      <ExternalLink size={16} aria-hidden="true" />
                    </a>
                  )}
                  <button type="button" className="danger" onClick={() => void trash(item)} aria-label={copy.trashFailed}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
