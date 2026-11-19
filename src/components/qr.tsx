import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { CameraOff, Download, Dumbbell, Printer } from 'lucide-react';
import type { Member } from '../types';
import { useStore } from '../lib/store';
import { fmtDate, memberQrValue, shortId } from '../lib/utils';
import { Button, Modal } from './ui';

/* ---------- QR image ---------- */

function useQrDataUrl(value: string, size: number) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#09090b', light: '#ffffff' } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src;
}

export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const src = useQrDataUrl(value, size);
  return src ? (
    <img src={src} width={size} height={size} alt="Member QR code" className="rounded-lg" />
  ) : (
    <div style={{ width: size, height: size }} className="animate-pulse rounded-lg bg-zinc-200" />
  );
}

/* ---------- Printable member ID card ---------- */

export function MemberCardModal({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { settings, plans } = useStore();
  const qrSrc = useQrDataUrl(member ? memberQrValue(member.id) : 'IRONDESK', 240);
  if (!member) return null;
  const plan = plans.find((p) => p.id === member.planId);

  const download = () => {
    const a = document.createElement('a');
    a.href = qrSrc;
    a.download = `${member.name.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    a.click();
  };

  return (
    <Modal open onClose={onClose} title="Member ID card">
      <div className="flex justify-center">
        <div className="print-area w-[320px] overflow-hidden rounded-2xl bg-white text-zinc-900 shadow-xl ring-1 ring-zinc-200">
          <div className="flex items-center gap-2 bg-zinc-950 px-5 py-3 text-white">
            <span className="grid size-7 place-items-center rounded-lg bg-lime-400 text-zinc-950">
              <Dumbbell size={15} strokeWidth={2.5} />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold">{settings.gymName}</div>
              <div className="text-[10px] tracking-widest text-lime-300 uppercase">Member pass</div>
            </div>
          </div>
          <div className="flex flex-col items-center px-5 pt-5 pb-4">
            {qrSrc ? <img src={qrSrc} width={180} height={180} alt="Member QR code" /> : <div className="size-[180px] animate-pulse bg-zinc-100" />}
            <div className="mt-3 text-center">
              <div className="text-lg font-bold">{member.name}</div>
              <div className="font-mono text-xs text-zinc-500">ID #{shortId(member.id)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 border-t border-zinc-200 text-xs">
            <div className="px-5 py-3">
              <div className="text-zinc-500">Plan</div>
              <div className="font-semibold">{plan?.name ?? '—'}</div>
            </div>
            <div className="border-l border-zinc-200 px-5 py-3">
              <div className="text-zinc-500">Valid until</div>
              <div className="font-semibold">{fmtDate(member.expiryDate)}</div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-zinc-500">Show this QR at the front desk to check in. Works with a webcam, a phone, or a USB scanner.</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="outline" onClick={download} disabled={!qrSrc}>
          <Download size={15} /> Save QR
        </Button>
        <Button onClick={() => window.print()}>
          <Printer size={15} /> Print card
        </Button>
      </div>
    </Modal>
  );
}

/* ---------- Camera scanner ---------- */

export function QrScannerModal({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    setError('');
    setReady(false);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('unsupported', 'NotSupportedError');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setReady(true);

        const tick = () => {
          if (stopped) return;
          if (video.readyState >= 2 && ctx && video.videoWidth) {
            const scale = Math.min(1, 640 / video.videoWidth); // downscale for speed
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code?.data) {
              stopped = true;
              resultRef.current(code.data);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        const name = (e as DOMException)?.name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access in your browser, or type the member ID instead.'
            : name === 'NotFoundError'
              ? 'No camera found on this device.'
              : 'Camera is not available here. Use the search box or a USB QR scanner instead.',
        );
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Scan member QR">
      {error ? (
        <div className="flex flex-col items-center py-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-zinc-800 text-zinc-400">
            <CameraOff size={22} />
          </span>
          <p className="mt-3 max-w-xs text-sm text-zinc-400">{error}</p>
        </div>
      ) : (
        <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted className="size-full object-cover" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="size-3/5 rounded-2xl border-2 border-lime-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
          {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-zinc-400">Starting camera…</div>}
        </div>
      )}
      <p className="mt-3 text-center text-xs text-zinc-500">Hold the member's QR inside the frame. It checks them in automatically.</p>
    </Modal>
  );
}
