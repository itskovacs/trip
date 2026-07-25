import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]!,
  );
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Configured once for the whole app. Images and raw HTML are rendered as inert
// escaped text rather than interpreted, and links are restricted to http/https
// with target=_blank rel=noopener noreferrer. The resulting HTML string must
// never be passed to bypassSecurityTrustHtml — binding it directly via
// [innerHTML] lets Angular's own sanitizer strip anything unsafe that still
// makes it through (script tags, event handler attributes, unsafe URL schemes).
marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!isSafeUrl(href)) return text;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    image({ text }) {
      return escapeHtml(text ?? '');
    },
    html({ text }) {
      return escapeHtml(text);
    },
  },
});

@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  transform(text: string | null | undefined): string {
    if (!text) return '';
    return marked.parse(text, { async: false });
  }
}
