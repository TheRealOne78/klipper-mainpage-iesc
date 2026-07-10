import type { GcodeFileMetadata, GcodeThumbnail } from "../usePrinterState";

export type ThumbnailVariant = "small" | "big";

export const getGcodeBasename = (filename?: string | null): string => {
  if (!filename) return "";
  const parts = filename.split("/");
  return parts[parts.length - 1] ?? filename;
};

const sortThumbnails = (
  thumbnails?: GcodeThumbnail[] | null,
): GcodeThumbnail[] => {
  return [...(thumbnails ?? [])]
    .filter((thumb): thumb is GcodeThumbnail => Boolean(thumb?.relative_path))
    .sort((left, right) => (left.width ?? 0) - (right.width ?? 0));
};

export const pickGcodeThumbnail = (
  metadata?: GcodeFileMetadata | null,
  variant: ThumbnailVariant = "big",
): GcodeThumbnail | null => {
  const thumbnails = sortThumbnails(metadata?.thumbnails);
  if (thumbnails.length === 0) return null;
  if (variant === "small") {
    return thumbnails.find((thumb) => (thumb.width ?? 0) >= 96) ?? thumbnails[0];
  }
  return thumbnails[thumbnails.length - 1] ?? null;
};

// Thumbnails are served THROUGH the portal backend (permission-checked proxy),
// not directly from Moonraker — so they render wherever the app is reachable and
// honour view_files. Moonraker stores thumbnail paths relative to the G-code
// file's directory. `moonrakerUrl` is accepted for backward-compat but unused.
export const buildMoonrakerThumbnailUrl = ({
  moonrakerUrl,
  filename,
  metadata,
  variant = "big",
}: {
  moonrakerUrl?: string | null;
  filename?: string | null;
  metadata?: GcodeFileMetadata | null;
  variant?: ThumbnailVariant;
}): string | null => {
  void moonrakerUrl;
  if (!filename || !metadata) return null;
  const thumbnail = pickGcodeThumbnail(metadata, variant);
  if (!thumbnail?.relative_path) return null;

  const lastSlash = filename.lastIndexOf("/");
  const directory = lastSlash >= 0 ? filename.slice(0, lastSlash + 1) : "";
  const relativePath = thumbnail.relative_path.replace(/^\/+/, "");
  // Encode each path segment but keep the slashes for the `*path` wildcard route.
  const encodedPath = `${directory}${relativePath}`
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const modified =
    typeof metadata.modified === "number" && Number.isFinite(metadata.modified)
      ? `&modified=${Math.trunc(metadata.modified)}`
      : "";

  return `/api/files/thumbnail/${encodedPath}?root=gcodes${modified}`;
};
