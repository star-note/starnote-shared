/**
 * Progressive behaviour of a published article (the HTML from `renderArticleHtml`), for the React blog and
 * the mobile reader; the SSR blog's `blog.js` does the same in plain script. Plain DOM, no dependencies.
 *
 *   - code blocks: shows the copy button (hidden in the static HTML so a page without script never shows a
 *     dead control) and copies the block's text, with a short 「已复制」 state.
 */

const COPIED_MS = 1500;

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // insecure origins / old WebViews: a hidden textarea + execCommand
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/** Wires the article's controls under `root`; returns a cleanup function. Safe to call more than once. */
export function enhanceArticle(root: HTMLElement | null | undefined): () => void {
  if (!root || typeof document === 'undefined') return () => {};
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-sn-copy]'));
  const onClick = async (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const code = button.closest('.richtext-code-block')?.querySelector('pre code');
    if (!code) return;
    const ok = await writeClipboard(code.textContent ?? '');
    if (!ok) return;
    const label = button.getAttribute('aria-label') ?? '';
    button.setAttribute('data-copied', '');
    button.setAttribute('aria-label', button.dataset.copiedLabel || label);
    button.title = button.dataset.copiedLabel || label;
    const timer = setTimeout(() => {
      timers.delete(timer);
      button.removeAttribute('data-copied');
      button.setAttribute('aria-label', label);
      button.title = label;
    }, COPIED_MS);
    timers.add(timer);
  };
  for (const button of buttons) {
    button.hidden = false;
    button.addEventListener('click', onClick);
  }
  return () => {
    for (const button of buttons) button.removeEventListener('click', onClick);
    for (const timer of timers) clearTimeout(timer);
  };
}
