/**
 * Optional photographic backdrop for the dusk: drop an image at public/art/dusk-backdrop.{webp,jpg,jpeg,png}
 * and the intro shows it behind the cherry trees instead of the painted print (DuskLandscape). Loading
 * starts behind the gate (preload.ts). The colour of its top rows becomes the sky above it, so the
 * frame's upper edge melts into the atmosphere as the camera lifts.
 */
import * as THREE from 'three';

const NAMES = ['webp', 'jpg', 'jpeg', 'png'].map((ext) => `/art/dusk-backdrop.${ext}`);

export const backdrop = {
  texture: null as THREE.Texture | null,
  /** average colour of the image's top rows (sRGB), the sky continues in it */
  sky: null as THREE.Color | null,
};

let pending: Promise<THREE.Texture | null> | null = null;

function tryLoad(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img.naturalWidth > 1 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function topColour(img: HTMLImageElement) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 3).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  const n = d.length / 4;
  return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

/** Load the first backdrop that exists (once). Resolves null when there is none. */
export function loadBackdrop(): Promise<THREE.Texture | null> {
  if (pending) return pending;
  pending = (async () => {
    for (const url of NAMES) {
      const img = await tryLoad(url);
      if (!img) continue;
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
      backdrop.texture = t;
      backdrop.sky = topColour(img);
      return t;
    }
    return null;
  })();
  return pending;
}
