import React from "react";
import { Crosshair } from "lucide-react";
import type { Translations } from "../../../translations";

interface ManualProbeCardProps {
  t: Translations;
  probeZ: unknown;
  isOfflineOrNotReady: boolean;
  onManualProbe: (
    action: "testz" | "accept" | "abort",
    delta?: number,
  ) => Promise<any>;
}

export const ManualProbeCard: React.FC<ManualProbeCardProps> = ({
  t,
  probeZ,
  isOfflineOrNotReady,
  onManualProbe,
}) => (
  <div className="dashboard-card manualprobe-card">
    <div className="card-title">
      <Crosshair size={20} />
      <span>{t.manualProbe}</span>
    </div>
    <div className="extruder-body">
      <div className="fan-value">
        Z ={" "}
        {typeof probeZ === "number" ? probeZ.toFixed(3) : "?"} mm
      </div>
      <div className="calibrate-babystep-row">
        {[1, 0.1, 0.05, 0.01].map((step) => (
          <button
            key={`up-${step}`}
            className="btn btn-compact"
            disabled={isOfflineOrNotReady}
            onClick={() => void onManualProbe("testz", step)}
          >
            +{step}
          </button>
        ))}
      </div>
      <div className="calibrate-babystep-row">
        {[1, 0.1, 0.05, 0.01].map((step) => (
          <button
            key={`down-${step}`}
            className="btn btn-compact"
            disabled={isOfflineOrNotReady}
            onClick={() => void onManualProbe("testz", -step)}
          >
            -{step}
          </button>
        ))}
      </div>
      <div className="extruder-actions">
        <button
          className="btn btn-danger"
          disabled={isOfflineOrNotReady}
          onClick={() => void onManualProbe("abort")}
        >
          {t.probeAbort}
        </button>
        <button
          className="btn btn-primary"
          disabled={isOfflineOrNotReady}
          onClick={() => void onManualProbe("accept")}
        >
          {t.probeAccept}
        </button>
      </div>
    </div>
  </div>
);
