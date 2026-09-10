import { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { BrandLogo } from '../brand/BrandLogo';
import { Btn } from '../ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

async function writeClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const fallback = document.createElement('textarea');
  fallback.value = value;
  fallback.setAttribute('readonly', '');
  fallback.style.position = 'fixed';
  fallback.style.opacity = '0';
  document.body.appendChild(fallback);
  fallback.select();
  const copied = document.execCommand('copy');
  fallback.remove();
  if (!copied) throw new Error('Clipboard copy failed.');
}

export default function ClassCode({ code, subjectCode, sectionName, compact = false }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  const normalizedCode = String(code || '').trim().toUpperCase();
  const sectionLabel = [subjectCode, sectionName].filter(Boolean).join(' \u00B7 ');

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function copyCode() {
    if (!normalizedCode) return;
    try {
      await writeClipboard(normalizedCode);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  }

  if (!normalizedCode) return null;

  return (
    <>
      <div className={compact ? 'flex min-w-0 items-center gap-2 border-t border-slate-200/70 px-3 py-2.5 dark:border-white/10' : 'mt-4 flex min-w-0 flex-wrap items-stretch gap-2'}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={compact
            ? 'group flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 text-left transition-colors hover:bg-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            : 'group flex min-h-14 min-w-[14rem] flex-1 items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary-subtle px-4 text-left transition-colors hover:border-primary/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'}
          aria-label={`View class code ${normalizedCode}`}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Class Code</span>
            <code className={`mt-0.5 block truncate font-mono font-bold tracking-[0.14em] text-primary-subtle-foreground dark:text-primary ${compact ? 'text-sm' : 'text-lg'}`}>{normalizedCode}</code>
          </span>
          <span className="shrink-0 text-xs font-semibold text-primary-subtle-foreground group-hover:text-primary-hover dark:text-primary">View</span>
        </button>
        <Btn type="button" variant="outline" size="sm" onClick={copyCode} className={compact ? 'shrink-0' : 'min-h-14 shrink-0'}>
          <Copy size={15} aria-hidden="true" /> {compact ? 'Copy' : 'Copy Code'}
        </Btn>
      </div>

      {copied && <div role="status" aria-live="polite" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[70] rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl dark:bg-white dark:text-slate-950">Class code copied</div>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <BrandLogo size="sm" />
            <DialogTitle className="pt-2 text-xl">Join this section</DialogTitle>
            <DialogDescription>{sectionLabel}</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-primary/20 bg-primary-subtle px-4 py-8 text-center">
            <code className="block break-all font-mono text-[clamp(1.8rem,8vw,2.75rem)] font-bold leading-none tracking-[0.12em] text-primary-subtle-foreground">{normalizedCode}</code>
          </div>
          <p className="text-center text-sm leading-6 text-slate-600 dark:text-slate-300">Students can enter this code from Join a Section.</p>
          <DialogFooter>
            <Btn type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Btn>
            <Btn type="button" onClick={copyCode}><Copy size={16} aria-hidden="true" /> Copy Code</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
