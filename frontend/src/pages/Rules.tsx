import React, { useEffect, useState } from "react";
import type { PortalConfig } from "../usePrinterState";
import { translations } from "../translations";
import { addIdsToHeaders } from "../lib/contentHeadings";

interface RulesProps {
  config: PortalConfig | null;
  lang: "ro" | "en" | "pl";
  scrollTarget?: string;
}

export const Rules: React.FC<RulesProps> = ({
  config: _config,
  lang,
  scrollTarget,
}) => {
  const t = translations[lang];
  const [rulesHtml, setRulesHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetch(`/api/content/rules?lang=${lang}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRulesHtml(data.html || "");
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error fetching rules:", err);
        setRulesHtml("");
        setError(
          t.rulesLoadError,
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    if (!loading && scrollTarget) {
      const element = document.getElementById(scrollTarget);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [loading, scrollTarget, rulesHtml]);

  const handleHeadingClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest("h1, h2, h3, h4");
    if (!target || !target.id) return;
    const url = `${window.location.origin}${window.location.pathname}#${target.id}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1500);
      })
      .catch(() => {});
  };

  // Format alert blocks in HTML safely
  const formatHtml = (html: string) => {
    const warningLabel = t.mdWarning;
    const importantLabel = t.mdImportant;
    const noteLabel = t.mdNote;
    const tipLabel = t.mdTip;

    const formatted = html
      .replace(
        /<blockquote>\s*<p>\s*\[!WARNING\]/gi,
        `<div class="alert alert-warning"><div class="alert-title">${warningLabel}</div>`,
      )
      .replace(
        /<blockquote>\s*<p>\s*\[!IMPORTANT\]/gi,
        `<div class="alert alert-important"><div class="alert-title">${importantLabel}</div>`,
      )
      .replace(
        /<blockquote>\s*<p>\s*\[!NOTE\]/gi,
        `<div class="alert alert-note"><div class="alert-title">${noteLabel}</div>`,
      )
      .replace(
        /<blockquote>\s*<p>\s*\[!TIP\]/gi,
        `<div class="alert alert-tip"><div class="alert-title">${tipLabel}</div>`,
      )
      .replace(/<\/p>\s*<\/blockquote>/gi, "</div>");

    return addIdsToHeaders(formatted);
  };

  return (
    <div className="page-content">
      <div className="markdown-container">
        {loading ? (
          <p>
            {t.rulesLoading}
          </p>
        ) : error ? (
          <div className="content-error-state">{error}</div>
        ) : (
          <div
            className="markdown-headings-copyable"
            onClick={handleHeadingClick}
            dangerouslySetInnerHTML={{ __html: formatHtml(rulesHtml) }}
          />
        )}
      </div>
      {linkCopied && <div className="heading-copy-toast">{t.headingLinkCopied}</div>}
    </div>
  );
};
