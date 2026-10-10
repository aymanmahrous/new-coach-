import { useEffect, useMemo, useState } from "react";
import type { ContentBatchItem } from "./content-batch";
import { fetchStaffMediaSignedUrl } from "./staff-media-storage";
import type { MediaAssetRecord } from "./media-types";

type PreviewSession = { accessToken: string };

export function parseCanvaBrief(visualPrompt: string | undefined): string {
  if (!visualPrompt) return "";
  const match = visualPrompt.match(/CANVA:\s*([^\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

export function ContentBatchMediaPreview({
  item,
  session,
  assetById,
  labels,
}: {
  item: ContentBatchItem;
  session?: PreviewSession;
  assetById: Map<string, MediaAssetRecord>;
  labels: {
    designPreview: string;
    designPending: string;
    canvaBriefLabel: string;
    noPreview: string;
  };
}) {
  const mediaAssetId = typeof item.mediaAssetId === "string" ? item.mediaAssetId : null;
  const asset = mediaAssetId ? assetById.get(mediaAssetId) : undefined;
  const canvaBrief = useMemo(() => parseCanvaBrief(typeof item.visualPrompt === "string" ? item.visualPrompt : undefined), [item.visualPrompt]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    if (!session || !asset?.storagePath) {
      setPreviewUrl(null);
      setPreviewError(false);
      return;
    }
    const controller = new AbortController();
    fetchStaffMediaSignedUrl(session, asset.storagePath, 3600, controller.signal)
      .then((signedUrl) => {
        if (controller.signal.aborted) return;
        setPreviewUrl(signedUrl);
        setPreviewError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPreviewUrl(null);
          setPreviewError(true);
        }
      });
    return () => {
      controller.abort();
      setPreviewUrl(null);
    };
  }, [asset?.assetType, asset?.id, asset?.storagePath, session]);

  const isVideo = asset?.assetType === "video";

  return (
    <div className="content-batch-media-preview" aria-label={labels.designPreview}>
      {previewUrl && isVideo ? (
        <video className="content-batch-design-image" src={previewUrl} controls playsInline preload="metadata" aria-label={item.topic || labels.designPreview} />
      ) : previewUrl ? (
        <img className="content-batch-design-image" src={previewUrl} alt={item.topic || labels.designPreview} loading="lazy" onError={() => setPreviewError(true)} />
      ) : (
        <div className="content-batch-design-placeholder" role="img" aria-label={labels.designPending}>
          <span>{item.mediaSource === "pending" || !mediaAssetId ? labels.designPending : previewError ? labels.noPreview : labels.designPending}</span>
        </div>
      )}
      {canvaBrief && (
        <p className="content-batch-canva-brief">
          <strong>{labels.canvaBriefLabel}</strong> {canvaBrief}
        </p>
      )}
    </div>
  );
}
