import React, { useEffect, useState } from "react";
import { translations } from "../translations";

interface TroubleshootingProps {
  lang: "ro" | "en";
  scrollTarget?: string;
}

export const Troubleshooting: React.FC<TroubleshootingProps> = ({
  lang,
  scrollTarget,
}) => {
  const [troubleHtml, setTroubleHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetch(`/api/content/troubleshooting?lang=${lang}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setTroubleHtml(data.html || "");
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error fetching troubleshooting:", err);
        setTroubleHtml("");
        setError(
          lang === "ro"
            ? "Ghidul nu poate fi încărcat. Verifică dacă backend-ul rulează."
            : "The guide could not be loaded. Check that the backend is running.",
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
  }, [loading, scrollTarget, troubleHtml]);

  const t = translations[lang];

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const addIdsToHeaders = (html: string) => {
    let processed = html.replace(
      /<h2([^>]*)>([\s\S]*?)<\/h2>/gi,
      (_match, attrs, content) => {
        const text = content.replace(/<[^>]*>/g, "");
        const id = slugify(text);
        return `<h2 id="${id}"${attrs}>${content}</h2>`;
      },
    );
    processed = processed.replace(
      /<h3([^>]*)>([\s\S]*?)<\/h3>/gi,
      (_match, attrs, content) => {
        const text = content.replace(/<[^>]*>/g, "");
        const id = slugify(text);
        return `<h3 id="${id}"${attrs}>${content}</h3>`;
      },
    );
    return processed;
  };

  const formatHtml = (html: string) => {
    const warningLabel = lang === "ro" ? "Avertisment" : "Warning";
    const importantLabel = lang === "ro" ? "Important" : "Important";
    const noteLabel = lang === "ro" ? "Notă" : "Note";
    const tipLabel = lang === "ro" ? "Sfat" : "Tip";

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
          <p>{t.loadingTrouble}</p>
        ) : error ? (
          <div className="content-error-state">{error}</div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: formatHtml(troubleHtml) }} />
        )}
      </div>
    </div>
  );
};
