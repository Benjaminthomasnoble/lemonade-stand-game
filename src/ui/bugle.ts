// The Morning Bugle's front page with a photo: the game snaps yesterday's best
// moment from the 3D scene (a rush, an upgrade, a raid held, a helicopter)
// and the dawn paper prints it in halftone. Click to put the paper down.

export interface Snapshot { url: string; headline: string; score: number; day: number; edition?: string /* the campaign's act, for the dateline */ }

export interface Bugle {
  /** Keep this photo if it beats today's best moment so far. */
  offer(shot: Snapshot): void;
  /** Today's best moment, if any is worth printing. */
  best(day: number): Snapshot | null;
  /** Show the front page; it folds itself away after a few seconds. */
  show(shot: Snapshot): void;
}

/** Halftone the photo on a canvas: newsprint dots over a warm sepia wash. */
function halftone(url: string, done: (out: string) => void) {
  const img = new Image();
  img.onload = () => {
    const w = 360, h = Math.round((img.height / img.width) * w) || 220;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) return done(url);
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    g.fillStyle = '#f4ead2'; g.fillRect(0, 0, w, h);
    const step = 3;
    for (let y = 0; y < h; y += step) {
      for (let x = (y / step) % 2 ? step / 2 : 0; x < w; x += step) {
        const i = (y * w + Math.floor(x)) * 4;
        const raw = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255;
        const lum = Math.min(1, Math.max(0, (raw - 0.25) / 0.6)); // punch up the contrast like cheap newsprint
        const r = Math.pow(1 - lum, 1.2) * step * 0.72;
        if (r < 0.3) continue;
        g.fillStyle = '#2E2A4F'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    }
    done(c.toDataURL('image/png'));
  };
  img.onerror = () => done(url);
  img.src = url;
}

export function createBugle(root: HTMLElement): Bugle {
  let today: Snapshot | null = null;
  return {
    offer(shot) {
      if (!today || today.day !== shot.day || shot.score > today.score) today = shot;
    },
    best(day) { return today && today.day === day ? today : null; },
    show(shot) {
      halftone(shot.url, (photo) => {
        const el = document.createElement('div');
        el.className = 'frontpage';
        el.innerHTML = `<div class="paper"><div class="mast">The Citrine Bay Bugle</div><div class="dateline"></div><img alt=""><div class="head"></div><div class="tap">tap to put it down</div></div>`;
        (el.querySelector('.dateline') as HTMLElement).textContent = `Morning edition · ${shot.edition ? `${shot.edition} · ` : ''}Day ${shot.day + 1} · 5¢`;
        (el.querySelector('img') as HTMLImageElement).src = photo;
        (el.querySelector('.head') as HTMLElement).textContent = shot.headline;
        const close = () => { if (!el.isConnected) return; el.classList.add('leaving'); setTimeout(() => el.remove(), 300); };
        el.addEventListener('click', close);
        root.appendChild(el);
        setTimeout(close, 5500);
      });
    },
  };
}
