import { useEffect, useState } from "react";
import { Archive, Copy, ExternalLink, FolderOpen, Link2, ShieldCheck } from "lucide-react";
import { useLanguage } from "./i18n";
import { getArchiveCopy } from "./massive-archive-copy";
import GoogleDriveManagerView from "./google-drive-manager-view";
import "./massive-archive.css";

const DRIVE_FOLDER_URL = (import.meta.env.VITE_MASSIVE_ARCHIVE_DRIVE_FOLDER_URL ?? "").trim();

function resolveDriveViewUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const folderMatch = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  const folderId = folderMatch?.[1] ?? (/^[a-zA-Z0-9_-]{10,}$/.test(value) ? value : null);
  if (!folderId) return null;

  return `https://drive.google.com/drive/folders/${folderId}`;
}

export default function MassiveArchiveView() {
  const { language } = useLanguage();
  const copy = getArchiveCopy(language);
  const driveUrl = resolveDriveViewUrl(DRIVE_FOLDER_URL);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function copyDriveLink() {
    if (!driveUrl) return;
    try {
      await navigator.clipboard.writeText(driveUrl);
      setToast(copy.copySuccess);
    } catch {
      setToast(copy.copyError);
    }
  }

  return (
    <div className="massive-archive">
      <div className="operations-boundary">
        <div>
          <strong>{copy.boundaryTitle}</strong>
          <p>{copy.boundaryText}</p>
        </div>
        <Archive size={22} aria-hidden="true" />
      </div>

      {!driveUrl && (
        <div className="notice-box archive-admin-notice" role="status">
          <strong>{copy.unconfiguredTitle}</strong>
          <p>{copy.unconfiguredText}</p>
          <code className="archive-env-key">VITE_MASSIVE_ARCHIVE_DRIVE_FOLDER_URL</code>
        </div>
      )}

      {driveUrl && (
        <div className="archive-launcher-grid">
          <article className="archive-action-card archive-action-card-primary">
            <div className="archive-action-icon" aria-hidden="true">
              <FolderOpen size={28} />
            </div>
            <div>
              <h3>{copy.primaryCardTitle}</h3>
              <p>{copy.primaryCardText}</p>
            </div>
            <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="archive-primary-button">
              <ExternalLink size={18} aria-hidden="true" />
              {copy.openInDrive}
            </a>
          </article>

          <article className="archive-action-card">
            <div className="archive-action-icon" aria-hidden="true">
              <Copy size={24} />
            </div>
            <div>
              <h3>{copy.copyCardTitle}</h3>
              <p>{copy.copyCardText}</p>
            </div>
            <button type="button" className="secondary archive-copy-button" onClick={() => void copyDriveLink()}>
              <Copy size={16} aria-hidden="true" />
              {copy.copyLink}
            </button>
          </article>

          <article className="archive-action-card archive-action-card-info">
            <div className="archive-action-icon" aria-hidden="true">
              <Link2 size={24} />
            </div>
            <div>
              <h3>{copy.linkCardTitle}</h3>
              <p className="archive-link-preview">{driveUrl}</p>
            </div>
          </article>

          <article className="archive-action-card archive-action-card-info">
            <div className="archive-action-icon" aria-hidden="true">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3>{copy.safeCardTitle}</h3>
              <p>{copy.safeCardText}</p>
            </div>
          </article>
        </div>
      )}

      <GoogleDriveManagerView />

      {toast && <div className="archive-toast" role="status" aria-live="polite">{toast}</div>}

      <p className="archive-footnote">{copy.footnote}</p>
    </div>
  );
}
