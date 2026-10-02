import { useEffect, useRef, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { BrandLogo } from '../brand/BrandLogo';
import { Btn, ConfirmModal } from '../ui';
import WorkspaceToast from '../reasoning/WorkspaceToast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { regenerateSectionCode } from '../../services/teachingWorkspaceApi';

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

export default function ClassCode({ sectionId, code, subjectCode, sectionName, compact = false }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentCode, setCurrentCode] = useState(() => String(code || '').trim().toUpperCase());
  const [confirmRegeneration, setConfirmRegeneration] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [regenerationNotice, setRegenerationNotice] = useState(null);
  const timerRef = useRef(null);
  const generatingRef = useRef(false);
  const normalizedCode = currentCode;
  const sectionLabel = [subjectCode, sectionName].filter(Boolean).join(' \u00B7 ');

  useEffect(() => () => clearTimeout(timerRef.current), []);
  useEffect(() => {
    setCurrentCode(String(code || '').trim().toUpperCase());
  }, [code]);

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

  async function createNewCode() {
    if (!sectionId || generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    setRegenerationNotice(null);
    try {
      const result = await regenerateSectionCode(sectionId);
      const nextCode = String(result?.section?.joinCode || '').trim().toUpperCase();
      if (!nextCode) throw new Error('The server did not return a section code.');
      setCurrentCode(nextCode);
      setCopied(false);
      setConfirmRegeneration(false);
      setRegenerationNotice({ type: 'success', text: 'New section code created.' });
    } catch {
      setConfirmRegeneration(false);
      setRegenerationNotice({ type: 'error', text: 'Unable to create a new section code. Please try again.' });
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }

  if (!normalizedCode) return null;

  return (
    <>
      <div className={compact ? 'flex min-w-0 items-center gap-2 border-t border-border/70 px-3 py-2.5 dark:border-border' : 'mt-3 flex min-w-0 items-center gap-2'}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={compact
            ? 'group flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-surface-subtle px-2.5 py-1.5 text-left shadow-[var(--sh-inset)] transition-colors hover:bg-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-border'
            : 'group flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-surface-subtle px-2.5 py-1.5 text-left shadow-[var(--sh-inset)] transition-colors hover:bg-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-border'}
          aria-label="Manage class code"
          title="Manage class code"
        >
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-muted-foreground dark:text-muted-foreground">Class code</span>
            <code className={`block truncate font-mono font-semibold tracking-[0.12em] text-foreground dark:text-foreground ${compact ? 'text-sm' : 'text-[15px]'}`}>{normalizedCode}</code>
          </span>
        </button>
        <Btn type="button" variant="outline" size="sm" onClick={copyCode} className="h-11 shrink-0">
          <Copy size={15} aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
        </Btn>
      </div>

      <WorkspaceToast notification={copied ? { id: `class-code-${normalizedCode}`, text: 'Class code copied', description: 'The code is ready to share with students.' } : null} onDismiss={() => setCopied(false)}/>

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
          <p className="text-center text-sm leading-6 text-muted-foreground dark:text-muted-foreground">Students can enter this code from Join a Section.</p>
          {regenerationNotice && <p role="status" className={`text-center text-sm font-semibold ${regenerationNotice.type === 'success' ? 'text-success' : 'text-destructive'}`}>{regenerationNotice.text}</p>}
          <DialogFooter>
            <Btn type="button" variant="ghost" disabled={generating} onClick={() => setOpen(false)}>Close</Btn>
            {sectionId && <Btn type="button" variant="outline" disabled={generating} aria-busy={generating || undefined} onClick={() => setConfirmRegeneration(true)}>
              <RefreshCw size={16} aria-hidden="true" /> {generating ? 'Generating...' : 'Create New Code'}
            </Btn>}
            <Btn type="button" disabled={generating} onClick={copyCode}><Copy size={16} aria-hidden="true" /> Copy Code</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmRegeneration && <ConfirmModal
        title="Generate a new section code?"
        body="Students will no longer be able to use the previous code to join this section."
        confirmLabel="Generate New Code"
        confirmVariant="warning"
        loading={generating}
        loadingLabel="Generating..."
        onCancel={() => { if (!generating) setConfirmRegeneration(false); }}
        onConfirm={createNewCode}
      />}
    </>
  );
}
