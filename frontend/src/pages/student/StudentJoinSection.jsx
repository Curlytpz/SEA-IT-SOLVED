import { useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { PageHeader, Alert, Btn, Card, FormField, Input } from '../../components/ui';
import api from '../../services/api';
import { Lightbulb } from '../../components/icons';

export default function StudentJoinSection() {
  const [classCode, setClassCode] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [requestSent, setRequestSent] = useState(false);

  async function findSection(event) {
    event.preventDefault();
    setError('');
    setRequestSent(false);
    const normalizedCode = classCode.trim().toUpperCase();
    if (!normalizedCode) {
      setError('Enter a class code.');
      return;
    }

    setLoading('preview');
    try {
      const { data } = await api.post('/sections/join-code/preview', { joinCode: normalizedCode });
      setPreview(data.data.section);
      setClassCode(normalizedCode);
    } catch (requestError) {
      setPreview(null);
      setError(requestError.response?.data?.error || 'Unable to find that section.');
    } finally {
      setLoading('');
    }
  }

  async function requestToJoin() {
    setError('');
    setLoading('request');
    try {
      await api.post('/sections/join-code', { joinCode: classCode });
      setPreview(null);
      setRequestSent(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to send your enrollment request.');
    } finally {
      setLoading('');
    }
  }

  function cancelPreview() {
    setPreview(null);
    setError('');
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-xl">
        <PageHeader title="Join a Section" subtitle="Enter the class code provided by your instructor." />
        <Card className="p-5 sm:p-7">
          {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
          {requestSent ? (
            <div className="py-2 text-center" role="status" aria-live="polite">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Request sent</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">Your request has been sent to the instructor for approval.</p>
              <Btn disabled className="mt-5 w-full">Pending Approval</Btn>
            </div>
          ) : preview ? (
            <div className="rounded-xl border border-primary/20 bg-primary-subtle p-5 transition-colors" aria-live="polite">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Confirm this section</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="grid grid-cols-[6rem_1fr] gap-3"><dt className="font-medium text-slate-500 dark:text-slate-400">Subject</dt><dd className="font-semibold text-slate-900 dark:text-white">{preview.subjectCode}</dd></div>
                <div className="grid grid-cols-[6rem_1fr] gap-3"><dt className="font-medium text-slate-500 dark:text-slate-400">Section</dt><dd className="font-semibold text-slate-900 dark:text-white">{preview.sectionName}</dd></div>
                <div className="grid grid-cols-[6rem_1fr] gap-3"><dt className="font-medium text-slate-500 dark:text-slate-400">Instructor</dt><dd className="font-semibold text-slate-900 dark:text-white">{preview.instructorName}</dd></div>
              </dl>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Btn loading={loading === 'request'} disabled={Boolean(loading)} onClick={requestToJoin} className="w-full">Request to Join</Btn>
                <Btn variant="secondary" disabled={Boolean(loading)} onClick={cancelPreview} className="w-full">Cancel</Btn>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={findSection}>
                <FormField label="Class Code">
                  <Input
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={classCode}
                    onChange={event => { setClassCode(event.target.value.toUpperCase()); if (error) setError(''); }}
                    placeholder="e.g. AB3KM7NP"
                    maxLength={12}
                    className="font-mono text-lg font-bold tracking-[0.14em]"
                  />
                </FormField>
                <Btn type="submit" loading={loading === 'preview'} disabled={Boolean(loading)} className="w-full">Find Section</Btn>
              </form>
              <div className="mt-5 flex gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-sm leading-6 text-muted-foreground">
                <Lightbulb size={18} className="mt-0.5 shrink-0 text-primary" />
                <span>Finding a section does not send a request. You will confirm before requesting instructor approval.</span>
              </div>
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
