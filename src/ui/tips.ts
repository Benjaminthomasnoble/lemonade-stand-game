// Long-press explains (spec: controls: "Select; explain | Click; hover | Tap;
// long-press"): on a touch screen, holding a finger on anything that explains
// itself on hover shows that explanation as a paper ticket, and the lift that
// ends the hold does nothing else. Supply buttons keep their own hold (fill up).
const HOLD_MS = 500;
const SHOW_MS = 3500;

export function attachTips(root: HTMLElement): void {
  let timer = 0, hideTimer = 0, swallow = false, x = 0, y = 0;
  let tip: HTMLElement | null = null;
  const hide = () => { tip?.remove(); tip = null; clearTimeout(hideTimer); };
  root.addEventListener('pointerdown', (e) => {
    hide();
    clearTimeout(timer);
    swallow = false;
    if (e.pointerType !== 'touch') return;
    const el = (e.target as HTMLElement).closest('[title]') as HTMLElement | null;
    if (!el?.title || el.closest('[data-fill-packs]')) return;
    x = e.clientX; y = e.clientY;
    timer = window.setTimeout(() => {
      swallow = true;
      const box = root.getBoundingClientRect();
      const t = document.createElement('div');
      t.className = 'cl-ticket';
      t.setAttribute('role', 'tooltip');
      t.textContent = el.title;
      const w = Math.min(box.width * 0.8, 320);
      Object.assign(t.style, {
        position: 'absolute', display: 'block', width: `${w}px`, whiteSpace: 'pre-line', pointerEvents: 'none', zIndex: '20',
        left: `${Math.max(8, Math.min(box.width - w - 8, x - box.left - w / 2))}px`,
        top: `${y - box.top > box.height / 2 ? y - box.top - 90 : y - box.top + 36}px`,
      });
      root.appendChild(t);
      tip = t;
      hideTimer = window.setTimeout(hide, SHOW_MS);
    }, HOLD_MS);
  });
  root.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - x, e.clientY - y) > 12) clearTimeout(timer); });
  const stop = () => clearTimeout(timer);
  root.addEventListener('pointerup', stop);
  root.addEventListener('pointercancel', stop);
  // The lift after a tip is shown is not a tap. (Capture: before the HUD's own click listener sees it.)
  root.addEventListener('click', (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
  root.addEventListener('contextmenu', (e) => { if ((e.target as HTMLElement).closest('[title]')) e.preventDefault(); });
}
