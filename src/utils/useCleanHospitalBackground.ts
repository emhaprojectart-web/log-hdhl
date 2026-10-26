import { useEffect, useState } from 'react';

export const HOSPITAL_RAW_BG_SRC = '/assets/aistudio/image_bbb86ce6_645f332c.jpg';

let cachedCleanBgDataUrl: string | null = null;
let pendingPromise: Promise<string | null> | null = null;

function generateCleanHospitalBackground(): Promise<string | null> {
  if (cachedCleanBgDataUrl) {
    return Promise.resolve(cachedCleanBgDataUrl);
  }
  if (pendingPromise) {
    return pendingPromise;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  pendingPromise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const w = img.naturalWidth || 1376;
        const h = img.naturalHeight || 768;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        // Seamlessly patch the center card area from adjacent clean hospital facade & sky strips
        const rx = Math.round(w * 0.302);
        const ry = Math.round(h * 0.05);
        const rw = Math.round(w * 0.396);
        const rh = Math.round(h * 0.798);
        const radius = Math.round(w * 0.018);

        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = w;
        patchCanvas.height = h;
        const pCtx = patchCanvas.getContext('2d');

        if (pCtx) {
          pCtx.drawImage(img, 0, 0, w, h);
          const stripSampleW = Math.max(16, Math.round(w * 0.025));
          const leftSampleX = Math.max(0, rx - stripSampleW - 6);
          const rightSampleX = Math.min(w - stripSampleW, rx + rw + 6);
          const bandStep = 8;

          for (let y = ry; y < ry + rh; y += bandStep) {
            const bh = Math.min(bandStep, ry + rh - y);
            pCtx.drawImage(
              img,
              leftSampleX,
              y,
              stripSampleW,
              bh,
              rx,
              y,
              Math.ceil(rw * 0.52),
              bh
            );
            pCtx.drawImage(
              img,
              rightSampleX,
              y,
              stripSampleW,
              bh,
              rx + Math.floor(rw * 0.48),
              y,
              Math.ceil(rw * 0.52),
              bh
            );
          }

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(rx - 4, ry - 4, rw + 8, rh + 8, radius);
          ctx.clip();
          ctx.filter = 'blur(26px)';
          ctx.drawImage(patchCanvas, 0, 0, w, h);
          ctx.restore();
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        cachedCleanBgDataUrl = dataUrl;
        resolve(dataUrl);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = HOSPITAL_RAW_BG_SRC;
  });

  return pendingPromise;
}

export function useCleanHospitalBackground(): {
  bgSrc: string;
  isProcessed: boolean;
  hasError: boolean;
  onImageError: () => void;
} {
  const [cleanDataUrl, setCleanDataUrl] = useState<string | null>(cachedCleanBgDataUrl);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    if (cachedCleanBgDataUrl) {
      setCleanDataUrl(cachedCleanBgDataUrl);
      return;
    }
    generateCleanHospitalBackground().then((res) => {
      if (!cancelled && res) {
        setCleanDataUrl(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    bgSrc: cleanDataUrl || HOSPITAL_RAW_BG_SRC,
    isProcessed: Boolean(cleanDataUrl),
    hasError,
    onImageError: () => setHasError(true)
  };
}
