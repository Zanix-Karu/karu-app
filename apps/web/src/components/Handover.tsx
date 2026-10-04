import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import qrcode from 'qrcode-generator';
import type { BookingStatus } from '@karu/shared';
import { Button } from '../ds';

/**
 * The handover moment, made obvious (REQ-6 follow-up).
 *
 * The code used to be a sentence in a yellow box. At a car park, with the
 * keys in one hand and a phone in the other, that is easy to misread and
 * hard to show. Now the customer holds a ticket: big separate digits to read
 * aloud, and a QR the provider can scan instead. The provider gets four boxes
 * that behave like an SMS code field, plus a camera button where the browser
 * can read QR codes.
 */

const CODE_LENGTH = 4;

/** What the QR carries. The reference lets the scanner refuse another booking's code. */
export function handoverQrPayload(reference: string, code: string): string {
  return `KARU:${reference}:${code}`;
}

/** Pull the code back out of a scanned payload, if it is for this booking. */
export function codeFromQr(payload: string, reference: string): string | null {
  const m = /^KARU:([^:]+):(\d{4})$/.exec(payload.trim());
  if (!m || m[1] !== reference) return null;
  return m[2];
}

// ---- Progress ----------------------------------------------------------------

const STEPS: Array<{ key: string; reached: BookingStatus[] }> = [
  { key: 'confirmed', reached: ['confirmed', 'in_progress', 'completed'] },
  { key: 'handover', reached: ['in_progress', 'completed'] },
  { key: 'onTrip', reached: ['in_progress', 'completed'] },
  { key: 'returned', reached: ['completed'] },
];

/** Confirmed → Handed over → On the road → Returned. */
export function TripProgress({ status }: { status: BookingStatus }) {
  const { t } = useTranslation();
  if (!['confirmed', 'in_progress', 'completed'].includes(status)) return null;
  const current = STEPS.reduce((acc, s, i) => (s.reached.includes(status) ? i : acc), 0);

  return (
    <ol className="karu-trip-progress mt-5" aria-label={t('handover.progressLabel')}>
      {STEPS.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s.key} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="karu-trip-progress__dot" aria-hidden>
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className="karu-trip-progress__label">{t(`handover.step.${s.key}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---- Customer: the ticket ----------------------------------------------------

export function HandoverTicket({
  kind,
  code,
  reference,
}: {
  kind: 'handover' | 'return';
  code: string;
  reference: string;
}) {
  const { t } = useTranslation();
  const [showQr, setShowQr] = useState(false);

  const qrSvg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(handoverQrPayload(reference, code));
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }, [reference, code]);

  return (
    <section className="karu-ticket mt-4" aria-labelledby="ticket-title">
      <div className="karu-ticket__head">
        <p id="ticket-title" className="karu-ticket__eyebrow">
          {kind === 'handover' ? t('handover.ticket.handoverTitle') : t('handover.ticket.returnTitle')}
        </p>
        <p className="karu-ticket__ref">{reference}</p>
      </div>

      <div className="karu-ticket__body">
        <div
          className="karu-ticket__digits"
          aria-label={t('handover.ticket.codeAria', { code: code.split('').join(' ') })}
        >
          {code.split('').map((d, i) => (
            <span key={i} className="karu-ticket__digit" aria-hidden>
              {d}
            </span>
          ))}
        </div>
        <p className="karu-ticket__hint">
          {kind === 'handover' ? t('handover.ticket.handoverHint') : t('handover.ticket.returnHint')}
        </p>

        <button
          type="button"
          className="karu-ticket__qr-toggle"
          aria-expanded={showQr}
          onClick={() => setShowQr((v) => !v)}
        >
          {showQr ? t('handover.ticket.hideQr') : t('handover.ticket.showQr')}
        </button>
        {showQr && (
          <div
            className="karu-ticket__qr karu-fade-in"
            role="img"
            aria-label={t('handover.ticket.qrAria')}
            // Generated locally from our own reference and digits, no user HTML.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        )}
      </div>
    </section>
  );
}

// ---- Provider: entering the code ----------------------------------------------

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

function barcodeDetector(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return ctor ?? null;
}

export function CodeEntry({
  label,
  reference,
  pending,
  onSubmit,
  onCancel,
}: {
  label: string;
  reference: string;
  pending: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const canScan = barcodeDetector() !== null && Boolean(navigator.mediaDevices?.getUserMedia);
  const code = digits.join('');

  useEffect(() => {
    boxes.current[0]?.focus();
  }, []);

  const fill = (from: number, raw: string) => {
    const incoming = raw.replace(/\D/g, '').slice(0, CODE_LENGTH - from).split('');
    if (!incoming.length) return;
    const next = [...digits];
    incoming.forEach((d, i) => (next[from + i] = d));
    setDigits(next);
    boxes.current[Math.min(from + incoming.length, CODE_LENGTH - 1)]?.focus();
  };

  return (
    <div className="mt-3">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === CODE_LENGTH) onSubmit(code);
        }}
      >
        <div className="karu-code-boxes" role="group" aria-label={t('handover.entry.aria')}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                boxes.current[i] = el;
              }}
              value={d}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              aria-label={t('handover.entry.digit', { n: i + 1 })}
              className="karu-code-box"
              onChange={(e) => {
                if (e.target.value === '') {
                  const next = [...digits];
                  next[i] = '';
                  setDigits(next);
                } else {
                  fill(i, e.target.value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                if (e.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus();
                if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) boxes.current[i + 1]?.focus();
              }}
              onPaste={(e) => {
                e.preventDefault();
                fill(i, e.clipboardData.getData('text'));
              }}
            />
          ))}
        </div>
        <Button type="submit" variant="primary" disabled={code.length < CODE_LENGTH} loading={pending}>
          {label}
        </Button>
        {canScan && (
          <Button type="button" variant="outline" onClick={() => setScanning(true)}>
            {t('handover.entry.scan')}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </form>

      {scanError && <p className="mt-2 text-sm text-karu-terracotta">{scanError}</p>}

      {scanning && (
        <QrScanner
          onClose={() => setScanning(false)}
          onResult={(payload) => {
            const found = codeFromQr(payload, reference);
            if (!found) {
              setScanError(t('handover.entry.wrongQr'));
              return false;
            }
            setScanError(null);
            setDigits(found.split(''));
            setScanning(false);
            onSubmit(found);
            return true;
          }}
        />
      )}
    </div>
  );
}

/** Camera preview that polls the browser's own BarcodeDetector. No library. */
function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (payload: string) => boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const Detector = barcodeDetector();
    if (!Detector) return;
    const detector = new Detector({ formats: ['qr_code'] });
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        timer = window.setInterval(async () => {
          if (!video.current) return;
          const found = await detector.detect(video.current).catch(() => []);
          for (const f of found) if (onResult(f.rawValue)) return;
        }, 400);
      } catch {
        setError(t('handover.entry.cameraDenied'));
      }
    })();

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // onResult changes identity every render; the scanner only needs the first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="karu-scanner mt-3 karu-fade-in">
      {error ? (
        <p className="text-sm text-karu-terracotta">{error}</p>
      ) : (
        <video ref={video} muted playsInline className="karu-scanner__video" />
      )}
      <Button type="button" variant="outline" className="mt-2" onClick={onClose}>
        {t('handover.entry.stopScan')}
      </Button>
    </div>
  );
}
