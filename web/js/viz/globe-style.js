// The look of every Earth on this site, in one place: the muted NASA Blue Marble picture, the ocean colour, the thin country and coastline
// outlines painted into the texture, the soft atmosphere. globe-trials.js (the Home globe) and views/falsealarm.js (the False-Alarm Planet)
// both use it, so the two read as one family. Nothing here knows about data: the callers draw their own data on top.
import { WEB, tok, isDark } from "./common.js";
import { loadGeo, tracePath } from "./geo.js";

export const IMG_URL = WEB + "vendor/blue-marble-4096.webp";
export const DUMMY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
export const ATMOS_ALT = 0.14;

const loadImage = (url) => new Promise((res) => { const i = new Image(); i.decoding = "async"; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
let assets = null;
/** The Blue Marble picture and the outlines (cached; either may come back null, and the Earth is then drawn without it). */
export function loadEarth() {
  if (!assets) assets = Promise.all([loadImage(IMG_URL), loadGeo({ states: false }).catch(() => null)]).then(([img, geo]) => ({ img, geo }));
  return assets;
}

const X = (W, lon) => ((lon + 180) / 360) * W, Y = (H, lat) => ((90 - lat) / 180) * H;
/** A W x H canvas holding the muted Earth: ocean colour, desaturated Blue Marble, then country lines and coastlines. Re-made when the theme changes. */
export function makeBase(W, H, { img, geo }) {
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"), dark = isDark();
  g.fillStyle = tok("ocean", "#DCE5E8"); g.fillRect(0, 0, W, H);
  if (img) {
    g.filter = dark ? "grayscale(0.75) brightness(0.62) contrast(0.8)" : "grayscale(0.7) brightness(0.92) contrast(0.62)";
    g.drawImage(img, 0, 0, W, H); g.filter = "none";
    g.fillStyle = dark ? "rgba(10,20,29,0.42)" : "rgba(222,230,233,0.62)"; g.fillRect(0, 0, W, H);
  }
  if (geo) {
    const box = { w: -180, e: 180, s: -90, n: 90 }, fx = (lon) => X(W, lon), fy = (lat) => Y(H, lat);
    g.lineJoin = "round"; g.beginPath(); tracePath(g, geo.countries, fx, fy, box);
    g.strokeStyle = dark ? "rgba(190,201,206,0.3)" : "rgba(60,58,48,0.28)"; g.lineWidth = Math.max(0.8, W / 4096); g.stroke();
    g.beginPath(); tracePath(g, geo.land, fx, fy, box);
    g.strokeStyle = dark ? "rgba(214,224,229,0.5)" : "rgba(40,40,32,0.62)"; g.lineWidth = Math.max(0.9, W / 3000); g.stroke();
  }
  return c;
}

/** The atmosphere ring, same colour and thickness on every globe. */
export function styleAtmosphere(g) { g.showAtmosphere(true).atmosphereColor(tok("viz-atmos", "#8FB1CC")).atmosphereAltitude(ATMOS_ALT); }

/** Swap the (1 px placeholder) texture of a globe.gl globe for our canvas, once the library has made it. Returns the THREE texture, or null. */
export async function useCanvasTexture(g, canvas, isDead = () => false) {
  const tex = await new Promise((res) => { let n = 0; const iv = setInterval(() => { const m = g.globeMaterial().map; if (m) { clearInterval(iv); res(m); } else if (++n > 150) { clearInterval(iv); res(null); } }, 25); });
  if (!tex || isDead()) return null;
  tex.dispose(); tex.image = canvas; tex.generateMipmaps = false; tex.minFilter = 1006;
  try { tex.anisotropy = g.renderer().capabilities.getMaxAnisotropy(); } catch (e) { /* ignore */ }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Give a globe the family look and nothing else: the Earth texture, the atmosphere. The caller must have built it with globeImageUrl(DUMMY).
 * Returns { retheme() } (call when light/dark changes). Data (points, polygons) stays the caller's.
 */
export async function dressGlobe(g, { W = 4096, isDead = () => false } = {}) {
  const earth = await loadEarth();
  if (isDead()) return null;
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = W / 2;
  const ctx = canvas.getContext("2d"); ctx.drawImage(makeBase(W, W / 2, earth), 0, 0);
  styleAtmosphere(g);
  const tex = await useCanvasTexture(g, canvas, isDead);
  if (!tex) return null;
  return { retheme() { ctx.drawImage(makeBase(W, W / 2, earth), 0, 0); tex.needsUpdate = true; styleAtmosphere(g); } };
}
