import React, { useEffect, useMemo, useState } from "react";
import {
  Camera,
  AlertTriangle,
  ChevronDown,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { WebcamConfig } from "../usePrinterState";
import { useStoredBool } from "../hooks/useStoredBool";
import { Select } from "../components/Select";

interface WebcamLabels {
  webcam: string;
  expand: string;
  collapse: string;
  fullscreen: string;
  exitFullscreen: string;
  webcamError: string;
  webcamErrorHint: string;
}

interface WebcamPanelProps {
  webcams: WebcamConfig[];
  moonrakerUrl?: string | null;
  labels: WebcamLabels;
}

/**
 * Resolve a possibly-relative webcam URL against the Moonraker host, mirroring
 * how Mainsail derives the absolute stream URL.
 */
function resolveWebcamUrl(url: string, moonrakerUrl?: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("//")) return url;
  if (moonrakerUrl) {
    const base = moonrakerUrl.replace(/\/+$/, "");
    const path = url.replace(/^\/+/, "");
    return `${base}/${path}`;
  }
  return url;
}

/** Build the CSS transform for flip/rotate, like Mainsail's generateTransform. */
function buildTransform(cam: WebcamConfig): string {
  const parts: string[] = [];
  if (cam.flip_horizontal) parts.push("scaleX(-1)");
  if (cam.flip_vertical) parts.push("scaleY(-1)");
  if (cam.rotation) parts.push(`rotate(${cam.rotation}deg)`);
  return parts.join(" ");
}

/**
 * Webcam card. Replicates Mainsail's behaviour: a per-camera selector, flip /
 * rotation transforms, fullscreen, and — crucially — the stream is only kept
 * open while the panel is expanded AND the browser tab is visible. Collapsing
 * the card or switching tabs tears the connection down (empty src), so we never
 * leave a dangling MJPEG connection hammering the Pi. There is deliberately no
 * pause button; visibility governs the stream automatically.
 */
export const WebcamPanel: React.FC<WebcamPanelProps> = ({
  webcams,
  moonrakerUrl,
  labels,
}) => {
  const enabledCams = useMemo(
    () => webcams.filter((c) => c.enabled !== false),
    [webcams],
  );

  const [index, setIndex] = useState(0);
  const [collapsed, setCollapsed] = useStoredBool("webcamCollapsed", false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tabVisible, setTabVisible] = useState<boolean>(
    () => typeof document === "undefined" || !document.hidden,
  );
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const safeIndex = Math.min(index, Math.max(0, enabledCams.length - 1));
  const cam = enabledCams[safeIndex];
  const streamUrl = cam ? resolveWebcamUrl(cam.stream_url, moonrakerUrl) : "";
  const streamActive = !collapsed && tabVisible;

  // Reset the error state whenever the active source or activity changes.
  useEffect(() => {
    setErrored(false);
  }, [streamUrl, streamActive]);

  // Fullscreen locks page scroll behind the overlay.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  if (enabledCams.length === 0 || !cam) return null;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("webcamCollapsed", String(next));
      return next;
    });
  };

  const transform = buildTransform(cam);
  const mediaStyle: React.CSSProperties = transform ? { transform } : {};

  const renderMedia = () => {
    if (errored) {
      return (
        <div className="webcam-overlay webcam-overlay-error">
          <AlertTriangle size={40} />
          <span>{labels.webcamError}</span>
          <span className="webcam-overlay-hint">{labels.webcamErrorHint}</span>
        </div>
      );
    }

    // Tear the stream down while hidden/collapsed to spare the Pi.
    const activeSrc = streamActive ? streamUrl : "";

    if (cam.service === "iframe") {
      return (
        <iframe
          className="webcam-media"
          src={activeSrc}
          style={mediaStyle}
          title={cam.name}
        />
      );
    }
    if (cam.service === "hlsstream" || cam.service === "html-video") {
      return (
        <video
          className="webcam-media"
          src={activeSrc}
          style={mediaStyle}
          autoPlay
          muted
          playsInline
          controls={false}
          onError={() => streamActive && setErrored(true)}
        />
      );
    }
    // default: mjpegstreamer (?action=stream) rendered as an <img>
    return (
      <img
        className="webcam-media"
        src={activeSrc}
        alt={cam.name}
        style={mediaStyle}
        onError={() => streamActive && setErrored(true)}
      />
    );
  };

  return (
    <div className={`dashboard-card webcam-card${fullscreen ? " webcam-fullscreen" : ""}`}>
      <div className="card-title">
        <Camera size={20} />
        {enabledCams.length > 1 ? (
          <Select
            className="webcam-selector"
            value={String(safeIndex)}
            onChange={(value) => setIndex(Number(value))}
            options={enabledCams.map((c, i) => ({
              value: String(i),
              label: c.name,
            }))}
          />
        ) : (
          <span>{cam.name || labels.webcam}</span>
        )}

        <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
          <button
            className="icon-button"
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? labels.exitFullscreen : labels.fullscreen}
          >
            {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button
            className={`icon-button ${collapsed ? "collapsed" : ""}`}
            title={collapsed ? labels.expand : labels.collapse}
            onClick={toggleCollapsed}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      {!collapsed && <div className="webcam-stream-wrap">{renderMedia()}</div>}
    </div>
  );
};
