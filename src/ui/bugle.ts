// The Morning Bugle's front page with a photo: the game snaps yesterday's best
// moment from the 3D scene (a rush, an upgrade, a raid held, a helicopter)
// and the dawn paper prints it in halftone. Click to put the paper down.
// The Bugle tab at Morning Prep prints the whole front page (sim/media.ts):
// the headline and briefs, the forecast, the Market against normal, each
// stand's cost per cup, the week's calendar and today's events.
import { frontPage, inCelsius, marketText, PLOT_BY_ID, SUPPLIES, weatherText, type FrontPage, type GameState } from '../sim/economy.ts';
import * as A from './clay.ts';
import { cents, esc, once } from './recipes.ts';

export interface Snapshot { url: string; headline: string; score: number; day: number; edition?: string /* the campaign's act, for the dateline */ }

export interface Bugle {
  /** Keep this photo if it beats today's best moment so far. */
  offer(shot: Snapshot): void;
  /** Today's best moment, if any is worth printing. */
  best(day: number): Snapshot | null;
  /** Show the front page; it folds itself away after a few seconds. With this morning's page, its headline and briefs print
   * under the photo (celsius: the °C option). */
  show(shot: Snapshot, page?: Pick<FrontPage, 'headline' | 'briefs'>, celsius?: boolean): void;
}

// ---------- the front page at Morning Prep ----------

const megaArt = once(() => A.megaphoneSVG());
const skyArt = once((kind: string) => A.skySVG(kind));
const lemonArt = once(() => A.lemonSVG());
const eggArt = once(() => A.eggSVG());
const boardArt = once(() => A.boardSVG());
const short = (plotId: string) => PLOT_BY_ID[plotId].name.replace(/ lot /, ' ');

/** The Bugle tab: this morning's front page, read off the state. celsius: the °C option (the paper prints in °F). */
export function bugleSheet(s: GameState, celsius = false): string {
  const p = frontPage(s);
  const deg = (t: string) => inCelsius(t, celsius);
  const head = `<div class="cl-card" data-testid="bugle-headline"><span class="cl-pic">${megaArt()}</span><span class="cl-txt"><b>${esc(p.headline[0])}</b><i>${esc(p.headline[1])}</i></span></div>`;
  const briefs = p.briefs.map((b) => `<span class="cl-note" data-testid="bugle-brief">${esc(deg(b))}</span>`).join('');
  const ahead = p.ahead.map((a) => `<i>Day ${a.day}: ${esc(deg(a.text))}</i>`).join('');
  const sky = `<div class="cl-card" data-testid="bugle-weather" title="The forecast is right about 4 days in 5"><span class="cl-pic">${skyArt(p.forecast.kind)}</span><span class="cl-txt"><b>${esc(deg(weatherText(p.forecast)))}</b>${ahead}</span></div>`;
  const rows = p.market.map((m) => `<tr><td>${SUPPLIES[m.id].label}${m.shock ? ` · ${esc(m.shock.name)}` : ''}</td><td class="${m.shock ? 'bad' : ''}">${m.text}${m.shock ? `, ${m.shock.left === 1 ? 'last day' : `${m.shock.left} days`}` : ''}</td></tr>`).join('');
  const costs = p.costs.map((c) => `<tr><td>${esc(short(c.plot))}, a cup</td><td>${cents(c.cost)}</td></tr>`).join('');
  const market = `<div class="cl-card" title="${esc(marketText(p.market))}"><span class="cl-pic">${lemonArt()}</span><span class="cl-txt"><b>The Market</b><table class="cl-books" data-testid="bugle-market">${rows}${costs}</table></span></div>`;
  const week = p.calendar.length ? `<div class="cl-ticket" data-testid="calendar" title="The week's calendar">${eggArt()}<b>This week</b>${p.calendar.map((l) => `<span class="cl-note">${esc(l)}</span>`).join('')}</div>` : '';
  const events = p.events.map((e) => `<div class="cl-card" data-testid="bugle-event" title="${esc(`How to play it: ${e.counter}`)}"><span class="cl-pic">${boardArt()}</span><span class="cl-txt"><b>${esc(e.name)}</b><i>${esc(e.where)}, ${esc(e.when)}</i><i>${esc(e.counter)}</i></span></div>`).join('');
  return `<span class="cl-label" title="Morning edition · Day ${p.day} · 5¢">The Citrine Bay Bugle</span>${head}${briefs}${events}${sky}${market}${week}`;
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
    show(shot, page, celsius = false) {
      halftone(shot.url, (photo) => {
        const el = document.createElement('div');
        el.className = 'frontpage';
        el.innerHTML = `<div class="paper"><div class="mast">The Citrine Bay Bugle</div><div class="dateline"></div><div class="head"></div><img alt=""><div class="tap">tap to put it down</div></div>`;
        (el.querySelector('.dateline') as HTMLElement).textContent = `Morning edition · ${shot.edition ? `${shot.edition} · ` : ''}Day ${shot.day + 1} · 5¢`;
        (el.querySelector('img') as HTMLImageElement).src = photo;
        const head = el.querySelector('.head') as HTMLElement;
        if (!page) {
          head.textContent = shot.headline;
          head.before(el.querySelector('img')!); // the photo's caption under it
        } else {
          head.textContent = `${page.headline[0]} ${page.headline[1]}`;
          // Under the photo: its own caption, then the briefs, in the dateline's small hand.
          for (const text of [shot.headline, ...page.briefs.map((b) => inCelsius(b, celsius))]) {
            const line = document.createElement('div');
            line.className = 'dateline';
            line.textContent = text;
            el.querySelector('.tap')!.before(line);
          }
        }
        const close = () => { if (!el.isConnected) return; el.classList.add('leaving'); setTimeout(() => el.remove(), 300); };
        el.addEventListener('click', close);
        root.appendChild(el);
        setTimeout(close, 5500);
      });
    },
  };
}
