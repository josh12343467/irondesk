import { Printer, Scale } from 'lucide-react';
import { useStore } from '../lib/store';
import { legalDoc, type LegalDocKey } from '../lib/legal';
import { Button, Modal } from './ui';

export const LEGAL_LABELS: Record<LegalDocKey, string> = {
  privacy: 'Privacy Notice',
  terms: 'Membership Terms',
  waiver: 'Waiver & Health Declaration',
};

export function LegalModal({ doc, onClose }: { doc: LegalDocKey | null; onClose: () => void }) {
  const { settings } = useStore();
  if (!doc) return null;
  const d = legalDoc(doc, settings);
  const missingDetails = !settings.legalName || !settings.address || !settings.dpoEmail;

  return (
    <Modal open onClose={onClose} title={d.title} wide>
      <div className="print-area space-y-5 text-sm leading-relaxed text-zinc-300 print:text-black">
        <p className="text-zinc-400 print:text-black">{d.summary}</p>
        {missingDetails && (
          <p className="no-print rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            Bracketed fields like [Business address] come from Settings → Privacy & compliance. An admin should fill them in.
          </p>
        )}
        {d.sections.map((s) => (
          <section key={s.heading}>
            <h3 className="mb-1.5 font-semibold text-zinc-100 print:text-black">{s.heading}</h3>
            {s.paragraphs?.map((p, i) => (
              <p key={i} className="mb-2">
                {p}
              </p>
            ))}
            {s.bullets && (
              <ul className="list-disc space-y-1 pl-5">
                {s.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <p className="flex items-start gap-2 rounded-lg bg-zinc-950 p-3 text-xs text-zinc-500 print:bg-white">
          <Scale size={14} className="mt-0.5 shrink-0" />
          Template provided with the IronDesk demo. It is not legal advice and must be reviewed by a Philippine lawyer before real use.
        </p>
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer size={15} /> Print
        </Button>
      </div>
    </Modal>
  );
}

/** Inline "Privacy Notice · Terms · Waiver" links. */
export function LegalLinks({ onOpen, className = '' }: { onOpen: (d: LegalDocKey) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-zinc-500 ${className}`}>
      {(Object.keys(LEGAL_LABELS) as LegalDocKey[]).map((k, i) => (
        <span key={k} className="flex items-center gap-3">
          {i > 0 && <span aria-hidden>·</span>}
          <button type="button" onClick={() => onOpen(k)} className="underline-offset-2 hover:text-zinc-300 hover:underline">
            {LEGAL_LABELS[k]}
          </button>
        </span>
      ))}
    </div>
  );
}
