import DOMPurify from 'dompurify';

// Bereinigt fremdes HTML (z. B. geteilte Dokumente) mit DOMPurify (Allowlist, gepflegt gegen mXSS-Tricks).
// Gibt direkt ein DOM-Fragment zurück, damit kein zweites Einlesen über innerHTML nötig ist.
export const sanitizeHtmlToFragment = (html: string): DocumentFragment =>
  DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
    RETURN_DOM_FRAGMENT: true,
  });
