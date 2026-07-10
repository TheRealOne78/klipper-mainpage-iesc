import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { Bell } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { AnnouncementEntry } from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface AnnouncementsCardProps {
  t: Translations;
  announcements: AnnouncementEntry[];
  announcementsCollapsed: boolean;
  setAnnouncementsCollapsed: Dispatch<SetStateAction<boolean>>;
}

export const AnnouncementsCard: React.FC<AnnouncementsCardProps> = ({
  t,
  announcements,
  announcementsCollapsed,
  setAnnouncementsCollapsed,
}) => (
  <div className="dashboard-card announcements-card">
    <div className="card-title">
      <Bell size={20} />
      <span>{t.announcements}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={announcementsCollapsed}
          storageKey="announcementsCollapsed"
          setter={setAnnouncementsCollapsed}
          t={t}
        />
      </div>
    </div>

    {!announcementsCollapsed && (
      <div className="announcements-body">
        {announcements.map((a, i) => (
          <div
            className={`announcement-row ${a.priority === "high" ? "high" : ""}`}
            key={a.entry_id ?? i}
          >
            <div className="announcement-title">{a.title}</div>
            {a.description && (
              <div className="announcement-desc">{a.description}</div>
            )}
            {a.url && (
              <a
                className="announcement-link"
                href={a.url}
                target="_blank"
                rel="noreferrer"
              >
                {t.announcementDetails}
              </a>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);
