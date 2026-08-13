const STAMP_LAST_KEY = 'admexo-stamp-last';

export const DEFAULT_STAMP_OPACITY = 46;
export const DEFAULT_STAMP_ROTATE = 0;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export interface StampLast {
  stampOpacity: number;
  stampRotate: number;
}

export function readStampLast(): StampLast {
  try {
    const raw = localStorage.getItem(STAMP_LAST_KEY);
    if (!raw) return { stampOpacity: DEFAULT_STAMP_OPACITY, stampRotate: DEFAULT_STAMP_ROTATE };
    const p = JSON.parse(raw) as Partial<StampLast>;
    const opacity = Number(p.stampOpacity);
    const rotate = Number(p.stampRotate);
    return {
      stampOpacity: Number.isFinite(opacity) ? clamp(Math.round(opacity), 0, 100) : DEFAULT_STAMP_OPACITY,
      stampRotate: Number.isFinite(rotate) ? clamp(Math.round(rotate), -90, 90) : DEFAULT_STAMP_ROTATE,
    };
  } catch {
    return { stampOpacity: DEFAULT_STAMP_OPACITY, stampRotate: DEFAULT_STAMP_ROTATE };
  }
}

export function writeStampLast(prefs: StampLast) {
  try {
    localStorage.setItem(
      STAMP_LAST_KEY,
      JSON.stringify({
        stampOpacity: clamp(Math.round(prefs.stampOpacity), 0, 100),
        stampRotate: clamp(Math.round(prefs.stampRotate), -90, 90),
      })
    );
  } catch {
    /* ignore quota / private mode */
  }
}
