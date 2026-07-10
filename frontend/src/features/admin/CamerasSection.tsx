import React from "react";
import { asNumber, asText } from "../../lib/formCoercion";
import { Select } from "../../components/Select";
import type { AdminConfig, WebcamConfig } from "../../printerTypes";
import type { Translations } from "../../translations";

const CAMERA_TYPE_OPTIONS = [
  { value: "mjpegstreamer", label: "MJPEG-Streamer" },
  { value: "mjpegstreamer-adaptive", label: "MJPEG adaptive" },
  { value: "uv4l-mjpeg", label: "UV4L MJPEG" },
  { value: "ipstream", label: "IP stream" },
  { value: "hlsstream", label: "HLS stream" },
  { value: "iframe", label: "iframe" },
];

const defaultWebcam = (): WebcamConfig => ({
  name: "Camera",
  service: "mjpegstreamer",
  stream_url: "",
  snapshot_url: "",
  enabled: true,
  flip_horizontal: false,
  flip_vertical: false,
  rotation: 0,
  icon: "mdi-webcam",
  source: "admin",
});

interface CamerasSectionProps {
  t: Translations;
  webcams: WebcamConfig[];
  mutateDraft: (updater: (next: AdminConfig) => void) => void;
}

export const CamerasSection: React.FC<CamerasSectionProps> = ({
  t,
  webcams,
  mutateDraft,
}) => (
  <div className="admin-table-wrap">
    <div className="admin-table-toolbar">
      <span>{webcams.length} {t.admConfigured}</span>
      <button
        className="btn btn-compact"
        onClick={() =>
          mutateDraft((next) => {
            next.webcams = [...next.webcams, defaultWebcam()];
          })
        }
      >
        {t.admAddCamera}
      </button>
    </div>
    <div className="admin-camera-table">
      {webcams.map((camera, index) => (
        <div className="admin-camera-row" key={index}>
          <label>
            {t.admCameraName}
            <input
              value={asText(camera.name)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                mutateDraft((next) => {
                  next.webcams[index].name = value;
                });
              }}
            />
          </label>
          <label>
            {t.admCameraType}
            <Select
              value={asText(camera.service) || "mjpegstreamer"}
              onChange={(value) => {
                mutateDraft((next) => {
                  next.webcams[index].service = value;
                });
              }}
              options={CAMERA_TYPE_OPTIONS}
            />
          </label>
          <label>
            {t.admStreamUrl}
            <input
              value={asText(camera.stream_url)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                mutateDraft((next) => {
                  next.webcams[index].stream_url = value;
                });
              }}
            />
          </label>
          <label>
            {t.admSnapshotUrl}
            <input
              value={asText(camera.snapshot_url)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                mutateDraft((next) => {
                  next.webcams[index].snapshot_url = value;
                });
              }}
            />
          </label>
          <label>
            {t.admRotation}
            <input
              type="number"
              value={asNumber(camera.rotation)}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                mutateDraft((next) => {
                  next.webcams[index].rotation = value;
                });
              }}
            />
          </label>
          <label className="admin-check-row inline">
            <input
              type="checkbox"
              checked={Boolean(camera.enabled)}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                mutateDraft((next) => {
                  next.webcams[index].enabled = checked;
                });
              }}
            />
            <span>{t.admEnabled}</span>
          </label>
          <label className="admin-check-row inline">
            <input
              type="checkbox"
              checked={Boolean(camera.flip_horizontal)}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                mutateDraft((next) => {
                  next.webcams[index].flip_horizontal = checked;
                });
              }}
            />
            <span>{t.admFlipHorizontal}</span>
          </label>
          <label className="admin-check-row inline">
            <input
              type="checkbox"
              checked={Boolean(camera.flip_vertical)}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                mutateDraft((next) => {
                  next.webcams[index].flip_vertical = checked;
                });
              }}
            />
            <span>{t.admFlipVertical}</span>
          </label>
          <button
            className="btn btn-compact"
            onClick={() =>
              mutateDraft((next) => {
                next.webcams = next.webcams.filter((_, i) => i !== index);
              })
            }
          >
            {t.admRemove}
          </button>
        </div>
      ))}
    </div>
  </div>
);
