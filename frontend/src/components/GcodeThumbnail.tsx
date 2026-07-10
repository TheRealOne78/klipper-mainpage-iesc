import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { buildMoonrakerThumbnailUrl } from "../lib/gcodeThumbnails";
import type { GcodeFileMetadata } from "../usePrinterState";

interface GcodeThumbnailProps {
  filename?: string | null;
  metadata?: GcodeFileMetadata | null;
  /** Use these URLs directly instead of computing them from
   * `filename`+`metadata` via `buildMoonrakerThumbnailUrl` — for callers
   * (e.g. the pending-uploads modal) that serve thumbnails through a
   * different, permission-appropriate proxy endpoint rather than the
   * general file-manager one `buildMoonrakerThumbnailUrl` targets. */
  smallUrl?: string | null;
  bigUrl?: string | null;
  /** Size of the inline thumbnail box in px (width = height). */
  size?: number;
  /** Corner radius in px. */
  radius?: number;
  /** Click handler — enables a pointer cursor (e.g. "print again"). */
  onClick?: () => void;
  title?: string;
  className?: string;
  /** Show the enlarged 3D-object popover on hover (default true). */
  popover?: boolean;
  /** Size of the hover popover image in px (default 240). */
  popoverSize?: number;
}

/**
 * Universal G-code object thumbnail. Renders a size-constrained thumbnail that
 * never overflows its row (object-fit: contain inside a fixed box) and, on hover,
 * shows an enlarged preview of the 3D object. Falls back to a package icon when
 * no thumbnail is available (or the image fails to load — a stale/renamed file,
 * a 404 from a permission-gated proxy, etc. — rather than showing a broken-image
 * icon). Reused across the status card, history, queue, file manager and the
 * pending-uploads modal so hover-preview behaviour is identical everywhere.
 */
export function GcodeThumbnail({
  filename,
  metadata,
  smallUrl,
  bigUrl,
  size = 40,
  radius = 6,
  onClick,
  title,
  className,
  popover = true,
  popoverSize = 240,
}: GcodeThumbnailProps) {
  const [hovered, setHovered] = useState(false);
  const [failed, setFailed] = useState(false);
  const small =
    smallUrl !== undefined
      ? smallUrl
      : buildMoonrakerThumbnailUrl({ filename, metadata, variant: "small" });
  const big =
    bigUrl !== undefined
      ? bigUrl
      : buildMoonrakerThumbnailUrl({ filename, metadata, variant: "big" });

  // A new src (different file, or metadata that just finished loading) gets
  // its own chance to load rather than staying stuck on a previous failure.
  useEffect(() => {
    setFailed(false);
  }, [small]);

  const showImage = Boolean(small) && !failed;
  const showPopover = popover && hovered && showImage && Boolean(big);
  const cursor = onClick ? "pointer" : big && popover ? "zoom-in" : "default";

  return (
    <div
      className={`gcode-thumb${className ? ` ${className}` : ""}`}
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      title={title}
      role={onClick ? "button" : undefined}
    >
      {showImage ? (
        <img
          src={small ?? undefined}
          alt=""
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            borderRadius: radius,
            display: "block",
            background: "var(--bg-color)",
            cursor,
          }}
        />
      ) : (
        <div
          className="gcode-thumb-fallback"
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-color)",
            borderRadius: radius,
            cursor,
          }}
        >
          <Package size={Math.max(14, Math.round(size * 0.5))} />
        </div>
      )}
      {showPopover && (
        <div
          className="gcode-thumb-popover"
          style={{
            position: "absolute",
            left: "calc(100% + 10px)",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1000,
            background: "var(--surface-color)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            padding: 6,
            boxShadow: "0 8px 32px var(--shadow-color)",
            pointerEvents: "none",
          }}
        >
          <img
            src={big ?? undefined}
            alt=""
            style={{
              width: popoverSize,
              height: "auto",
              maxHeight: popoverSize,
              objectFit: "contain",
              borderRadius: 6,
              display: "block",
            }}
          />
        </div>
      )}
    </div>
  );
}
