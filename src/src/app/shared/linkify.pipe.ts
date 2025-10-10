import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'linkify', standalone: true })
export class LinkifyPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  private basicEscape(text: string): string {
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

    const urlRegex = /((https?:\/\/|www\.)[^\s]+)/g;
    const safeText = this.basicEscape(text);

    const html = safeText.replace(urlRegex, (url) => {
      const href = url.startsWith('http') ? url : `https://${url}`;
      return `<a href="${href}" target="_blank">${url}</a>`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
