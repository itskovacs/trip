import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'linkify', standalone: true })
export class LinkifyPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  private isSafeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private escape(text: string): string {
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

  transform(text: string): SafeHtml {
    if (!text) return text;
    const urlRegex = /((https?:\/\/|www\.)[^\s"'<>)]+?)([.,;:!?)'">]*?)(?=\s|$)/g;
    const parts: string[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(urlRegex)) {
      const [, url] = match;
      const index = match.index!;

      parts.push(this.escape(text.slice(lastIndex, index)));
      const href = url.startsWith('http') ? url : `https://${url}`;

      if (this.isSafeUrl(href))
        parts.push(`<a href="${this.escape(href)}" target="_blank" rel="noopener noreferrer">${this.escape(url)}</a>`);
      else parts.push(this.escape(url));
      lastIndex = index + url.length;
    }

    parts.push(this.escape(text.slice(lastIndex)));
    return this.sanitizer.bypassSecurityTrustHtml(parts.join(''));
  }
}
