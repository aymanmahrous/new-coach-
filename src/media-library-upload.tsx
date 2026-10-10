import { useRef, useState } from "react";
import { z } from "zod";
import { useLanguage } from "./i18n";
import { uploadStaffMediaFile } from "./staff-media-storage";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type UploadSession = { accessToken: string };

async function callRpc(session: UploadSession, rpcName: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(rpcName)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
  if (!response.ok) throw new Error(`RPC_FAILED_${response.status}`);
  return response.json();
}

const RegisterSchema = z.object({ success: z.boolean(), mediaAssetId: z.string().uuid().optional(), code: z.string().optional() });

export default function MediaLibraryUploadPanel({
  session,
  canWrite,
  busy,
  onUploaded,
  onSessionExpired,
}: {
  session: UploadSession;
  canWrite: boolean;
  busy: boolean;
  onUploaded: () => void;
  onSessionExpired: () => void;
}) {
  const { t } = useLanguage();
  const copy = t("media");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  async function handleFiles(fileList: FileList | null) {
    if (!canWrite || busy || uploading || !fileList?.length) return;
    setUploading(true);
    setNotice("");
    try {
      for (const file of Array.from(fileList)) {
        const uploaded = await uploadStaffMediaFile(session, file);
        const registered = RegisterSchema.parse(await callRpc(session, "register_staff_media_upload", {
          p_asset_type: uploaded.assetType,
          p_storage_path: uploaded.storagePath,
          p_metadata: { file_name: uploaded.fileName, mime_type: file.type || null },
        }));
        if (!registered.success) throw new Error(registered.code ?? "REGISTER_FAILED");
      }
      setNotice(copy.uploadSuccess);
      onUploaded();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "UPLOAD_FAILED";
      if (code === "SESSION_EXPIRED") { onSessionExpired(); return; }
      setNotice(copy.uploadError);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="media-upload-panel" aria-labelledby="media-upload-heading">
      <header>
        <h3 id="media-upload-heading">{copy.uploadTitle}</h3>
        <p>{copy.uploadSubtitle}</p>
      </header>
      <label className="media-upload-button">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          multiple
          disabled={!canWrite || busy || uploading}
          onChange={(event) => void handleFiles(event.target.files)}
        />
        {uploading ? copy.uploadBusy : copy.uploadButton}
      </label>
      {notice && <p className="media-upload-notice" role="status">{notice}</p>}
      {!canWrite && <p className="muted">{t("common").readOnlyNote}</p>}
    </section>
  );
}
