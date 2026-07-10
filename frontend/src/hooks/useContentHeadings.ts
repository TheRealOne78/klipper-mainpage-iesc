import { useEffect, useState } from "react";

export interface ContentHeading {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4;
}

// Must match the slugify used to inject heading ids in Rules.tsx/Troubleshooting.tsx
// (dangerouslySetInnerHTML'd content) — otherwise generated sidebar links won't
// match any real element id on the page.
export const slugifyHeading = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const extractHeadings = (html: string): ContentHeading[] => {
  const headings: ContentHeading[] = [];
  const re = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const level = Number(match[1]) as 1 | 2 | 3 | 4;
    const text = match[2].replace(/<[^>]*>/g, "").trim();
    if (text) headings.push({ id: slugifyHeading(text), text, level });
  }
  return headings;
};

/**
 * Fetches the same server-rendered content Rules.tsx/Troubleshooting.tsx use
 * and extracts its h1-h4 headings, for a dynamically-generated sidebar nav
 * instead of a hardcoded link list.
 */
export function useContentHeadings(
  page: "rules" | "troubleshooting",
  lang: string,
): { headings: ContentHeading[]; loading: boolean } {
  const [headings, setHeadings] = useState<ContentHeading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/content/${page}?lang=${lang}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelled) return;
        setHeadings(extractHeadings(data.html || ""));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHeadings([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, lang]);

  return { headings, loading };
}
