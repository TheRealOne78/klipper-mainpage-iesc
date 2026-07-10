import { slugifyHeading } from "../hooks/useContentHeadings";

/** Injects `id` attributes into h1-h4 tags so sidebar anchors and copy-link
 * clicks can target them. Shared by Rules.tsx and Troubleshooting.tsx so the
 * slugify algorithm can never drift between the two pages. */
export function addIdsToHeaders(html: string): string {
  return html.replace(
    /<h([1-4])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_match, level, attrs, content) => {
      const text = content.replace(/<[^>]*>/g, "");
      const id = slugifyHeading(text);
      return `<h${level} id="${id}"${attrs}>${content}</h${level}>`;
    },
  );
}
