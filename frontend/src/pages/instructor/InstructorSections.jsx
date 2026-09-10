import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { LoadingState, EmptyState, PageHeader, Alert, Btn, ConfirmModal, Badge, FormField, Input, Select } from '../../components/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import api from '../../services/api';
import {
  getTeachingWorkspace, createTeachingFolder, renameTeachingFolder,
  reorderTeachingFolders, setTeachingFolderArchived, deleteTeachingFolder,
  moveSectionToFolder,
} from '../../services/teachingWorkspaceApi';
import { Archive, BookOpen, ChevronDown, ChevronUp, Folder, Pencil, Plus, Trash, Users } from '../../components/icons';
import ClassCode from '../../components/sections/ClassCode';

const UNORGANIZED = 'unorganized';

export default function InstructorSections() {
  const [workspace, setWorkspace] = useState({ folders: [], unorganized: { id: null, name: 'Unorganized', sectionCount: 0, subjectGroups: [] } });
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState(UNORGANIZED);
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ text: '', type: 'success' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teaching, subRes] = await Promise.all([getTeachingWorkspace(), api.get('/subjects')]);
      setWorkspace(teaching);
      setSubjects(subRes.data.data.subjects);
      setSelectedKey(current => current === UNORGANIZED || teaching.folders.some(folder => folder.id === current) ? current : UNORGANIZED);
    } catch (error) {
      setMsg({ text: error.response?.data?.error || 'Unable to load your teaching workspace.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeFolders = useMemo(() => workspace.folders.filter(folder => !folder.archivedAt), [workspace.folders]);
  const archivedFolders = useMemo(() => workspace.folders.filter(folder => folder.archivedAt), [workspace.folders]);
  const selectedFolder = selectedKey === UNORGANIZED
    ? workspace.unorganized
    : workspace.folders.find(folder => folder.id === selectedKey) || workspace.unorganized;
  const totalSections = workspace.unorganized.sectionCount + workspace.folders.reduce((sum, folder) => sum + folder.sectionCount, 0);

  function notify(text, type = 'success') {
    setMsg({ text, type });
    window.setTimeout(() => setMsg({ text: '', type: 'success' }), 5000);
  }

  async function run(key, action, success) {
    setBusy(key);
    try {
      await action();
      if (success) notify(success);
      await load();
      return true;
    } catch (error) {
      notify(error.response?.data?.error || 'The change could not be saved.', 'error');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function handleFolderSubmit(name) {
    if (dialog?.type === 'rename') {
      const ok = await run(`folder-${dialog.folder.id}`, () => renameTeachingFolder(dialog.folder.id, name), 'Folder renamed.');
      if (ok) setDialog(null);
      return;
    }
    setBusy('create-folder');
    try {
      const result = await createTeachingFolder(name);
      setDialog(null);
      setSelectedKey(result.folder.id);
      notify('Folder created.');
      await load();
    } catch (error) {
      throw error;
    } finally {
      setBusy('');
    }
  }

  async function moveFolder(folder, direction) {
    const index = activeFolders.findIndex(item => item.id === folder.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= activeFolders.length) return;
    const ids = activeFolders.map(item => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await run('reorder', () => reorderTeachingFolders(ids), 'Folder order updated.');
  }

  async function handleConfirm() {
    const current = confirm;
    if (!current) return;
    if (current.type === 'section') {
      const ok = await run(`section-${current.item.id}`, () => api.delete(`/sections/${current.item.id}`), 'Section deleted.');
      if (ok) setConfirm(null);
    } else {
      const ok = await run(`folder-${current.item.id}`, () => deleteTeachingFolder(current.item.id), 'Folder deleted. Its sections are now Unorganized.');
      if (ok) { setSelectedKey(UNORGANIZED); setConfirm(null); }
    }
  }

  return (
    <DashboardLayout>
      <PageHeader title="My Teaching" subtitle={`${totalSections} section${totalSections !== 1 ? 's' : ''} organized for you only`}>
        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" onClick={() => setDialog({ type: 'create-folder' })}><Folder size={16}/> New Folder</Btn>
          <Btn variant="primary" onClick={() => setDialog({ type: 'create-section' })}><Plus size={16}/> Create Section</Btn>
        </div>
      </PageHeader>

      {msg.text && <Alert type={msg.type} onClose={() => setMsg({ text: '', type: 'success' })}>{msg.text}</Alert>}

      {loading ? <LoadingState /> : totalSections === 0 && activeFolders.length === 0
        ? <EmptyState icon={<BookOpen size={23}/>} title="Start your teaching workspace" body="Create a folder for a semester or subject group, then add your first section.">
            <div className="flex flex-wrap justify-center gap-2"><Btn variant="ghost" onClick={() => setDialog({ type: 'create-folder' })}>Create Folder</Btn><Btn onClick={() => setDialog({ type: 'create-section' })}>Create Section</Btn></div>
          </EmptyState>
        : <div className="teaching-workspace">
            <aside className="teaching-folder-nav scrollbar-hidden glass-panel rounded-2xl p-3" aria-label="Teaching folders">
              <FolderNavItem active={selectedKey === UNORGANIZED} name="Unorganized" count={workspace.unorganized.sectionCount} icon={<BookOpen size={17}/>} onClick={() => setSelectedKey(UNORGANIZED)} />
              <div className="my-3 border-t border-slate-200/70 dark:border-white/10" />
              <div className="mb-2 flex items-center justify-between px-2"><span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Folders</span><Btn size="sm" variant="ghost" aria-label="Create folder" onClick={() => setDialog({ type: 'create-folder' })}><Plus size={14}/></Btn></div>
              <div className="space-y-1">
                {activeFolders.map((folder, index) => <FolderNavItem key={folder.id} active={selectedKey === folder.id} name={folder.name} count={folder.sectionCount} icon={<Folder size={17}/>} onClick={() => setSelectedKey(folder.id)} actions={
                  <span className="flex shrink-0">
                    <button type="button" className="folder-icon-action" aria-label={`Move ${folder.name} up`} disabled={index === 0 || busy === 'reorder'} onClick={event => { event.stopPropagation(); moveFolder(folder, -1); }}><ChevronUp size={13}/></button>
                    <button type="button" className="folder-icon-action" aria-label={`Move ${folder.name} down`} disabled={index === activeFolders.length - 1 || busy === 'reorder'} onClick={event => { event.stopPropagation(); moveFolder(folder, 1); }}><ChevronDown size={13}/></button>
                  </span>
                } />)}
                {!activeFolders.length && <p className="px-2 py-3 text-xs text-slate-400">No active folders.</p>}
              </div>
              {archivedFolders.length > 0 && <details className="mt-4 border-t border-slate-200/70 pt-3 dark:border-white/10">
                <summary className="cursor-pointer px-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Archived ({archivedFolders.length})</summary>
                <div className="mt-2 space-y-1">{archivedFolders.map(folder => <FolderNavItem key={folder.id} active={selectedKey === folder.id} name={folder.name} count={folder.sectionCount} icon={<Archive size={16}/>} onClick={() => setSelectedKey(folder.id)} />)}</div>
              </details>}
            </aside>

            <main className="min-w-0">
              <section className="glass-panel rounded-2xl p-4 sm:p-5">
                <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="flex items-center gap-2"><h2 className="text-lg font-black text-slate-900 dark:text-white">{selectedFolder.name}</h2>{selectedFolder.archivedAt && <Badge status="ARCHIVED"/>}</div><p className="mt-1 text-xs text-slate-500">{selectedFolder.sectionCount} section{selectedFolder.sectionCount !== 1 ? 's' : ''} • grouped automatically by subject</p></div>
                  {selectedKey !== UNORGANIZED && <div className="flex flex-wrap gap-1.5">
                    <Btn size="sm" variant="ghost" onClick={() => setDialog({ type: 'rename', folder: selectedFolder })}><Pencil size={14}/> Rename</Btn>
                    <Btn size="sm" variant="ghost" loading={busy === `folder-${selectedFolder.id}`} onClick={() => run(`folder-${selectedFolder.id}`, () => setTeachingFolderArchived(selectedFolder.id, !selectedFolder.archivedAt), selectedFolder.archivedAt ? 'Folder restored.' : 'Folder archived.')}>{selectedFolder.archivedAt ? <Folder size={14}/> : <Archive size={14}/>} {selectedFolder.archivedAt ? 'Restore' : 'Archive'}</Btn>
                    <Btn size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setConfirm({ type: 'folder', item: selectedFolder })}><Trash size={14}/> Delete Folder</Btn>
                  </div>}
                </div>

                {!selectedFolder.subjectGroups.length
                  ? <div className="py-12 text-center"><Folder size={26} className="mx-auto text-slate-400"/><h3 className="mt-3 font-bold text-slate-700 dark:text-slate-200">No sections here</h3><p className="mt-1 text-sm text-slate-500">Move a section here or create a new one.</p>{!selectedFolder.archivedAt && <Btn className="mt-4" onClick={() => setDialog({ type: 'create-section' })}><Plus size={15}/> Create Section</Btn>}</div>
                  : <div className="mt-5 space-y-6">{selectedFolder.subjectGroups.map(group => <section key={group.subjectId}>
                      <div className="mb-3 flex items-center gap-2"><Badge status={group.subjectCode}/><h3 className="font-bold text-slate-800 dark:text-slate-100">{group.subjectName}</h3><span className="text-xs text-slate-400">{group.sections.length}</span></div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.sections.map(section => <SectionCard key={section.id} section={section} folders={activeFolders} moving={busy === `move-${section.id}`} deleting={busy === `section-${section.id}`} onMove={folderId => run(`move-${section.id}`, () => moveSectionToFolder(section.id, folderId), 'Section moved.')} onDelete={() => setConfirm({ type: 'section', item: section })} />)}</div>
                    </section>)}</div>}
              </section>
            </main>
          </div>}

      {(dialog?.type === 'create-folder' || dialog?.type === 'rename') && <FolderModal folder={dialog.folder} loading={busy === 'create-folder' || busy.startsWith('folder-')} onClose={() => setDialog(null)} onSubmit={handleFolderSubmit}/>} 
      {dialog?.type === 'create-section' && <CreateSectionModal subjects={subjects} folders={activeFolders} initialFolderId={selectedKey !== UNORGANIZED && !selectedFolder.archivedAt ? selectedKey : ''} onClose={() => setDialog(null)} onCreated={() => { setDialog(null); load(); }}/>} 
      {confirm && <ConfirmModal title={confirm.type === 'folder' ? 'Delete this folder?' : 'Delete this section?'} body={confirm.type === 'folder' ? `“${confirm.item.name}” will be removed. Its sections and all academic records will remain intact and move to Unorganized.` : `Students will lose access to "${confirm.item.sectionName}". This action cannot be undone.`} confirmLabel={confirm.type === 'folder' ? 'Delete Folder' : 'Delete Section'} confirmVariant="danger" loading={busy === `folder-${confirm.item.id}` || busy === `section-${confirm.item.id}`} onConfirm={handleConfirm} onCancel={() => setConfirm(null)}/>} 
    </DashboardLayout>
  );
}

function FolderNavItem({ active, name, count, icon, actions, onClick }) {
  return <button type="button" className={`teaching-folder-item ${active ? 'is-active' : ''}`} onClick={onClick}><span className="shrink-0">{icon}</span><span className="min-w-0 flex-1 truncate text-left">{name}</span><span className="folder-count">{count}</span>{actions}</button>;
}

function SectionCard({ section, folders, moving, deleting, onMove, onDelete }) {
  return <article className="teaching-section-card">
    <Link to={`/instructor/sections/${section.id}`} className="block p-4">
      <div className="flex items-start justify-between gap-2"><h4 className="font-black text-slate-800 dark:text-white">{section.sectionName}</h4>{section.pendingCount > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{section.pendingCount} pending</span>}</div>
      <div className="mt-3 flex items-center gap-1 text-xs text-slate-500"><Users size={13}/> {section.enrolledCount} enrolled</div>
    </Link>
    <ClassCode compact code={section.joinCode} subjectCode={section.subjectCode} sectionName={section.sectionName} />
    <div className="grid gap-2 border-t border-slate-200/70 p-3 dark:border-white/10">
      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500" htmlFor={`folder-${section.id}`}>Folder</label>
      <div className="flex gap-2"><Select id={`folder-${section.id}`} value={section.teachingFolderId || ''} disabled={moving} onChange={event => onMove(event.target.value || null)} className="min-w-0 flex-1 text-xs"><option value="">Unorganized</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</Select><Btn size="sm" variant="ghost" loading={deleting} aria-label={`Delete ${section.sectionName}`} className="shrink-0 text-red-500 hover:text-red-700" onClick={onDelete}><Trash size={14}/></Btn></div>
    </div>
  </article>;
}

function FolderModal({ folder, loading, onClose, onSubmit }) {
  const [name, setName] = useState(folder?.name || '');
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) { setError('Folder name is required.'); return; }
    try { await onSubmit(name.trim()); } catch (requestError) { setError(requestError.response?.data?.error || 'Unable to save folder.'); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !loading) onClose(); }}><DialogContent showCloseButton={false}><DialogHeader><DialogTitle>{folder ? 'Rename Folder' : 'Create Folder'}</DialogTitle><DialogDescription>Folders are private organization tools and never change section ownership.</DialogDescription></DialogHeader>{error && <Alert type="error">{error}</Alert>}<form onSubmit={submit}><FormField label="Folder Name"><Input autoFocus maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. First Semester 2026"/></FormField><DialogFooter><Btn variant="ghost" disabled={loading} onClick={onClose}>Cancel</Btn><Btn type="submit" loading={loading}>{folder ? 'Save Name' : 'Create Folder'}</Btn></DialogFooter></form></DialogContent></Dialog>;
}
function CreateSectionModal({ subjects, folders, initialFolderId, onClose, onCreated }) {
  const [form, setForm] = useState({ subjectId: '', sectionName: '', folderId: initialFolderId || '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = key => event => {
    setError('');
    setForm(current => ({ ...current, [key]: event.target.value }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!form.subjectId) return setError('Please select a subject.');
    if (!form.sectionName.trim()) return setError('Section name is required.');

    setLoading(true);
    try {
      await api.post('/sections', {
        subjectId: form.subjectId,
        sectionName: form.sectionName.trim(),
        folderId: form.folderId || null,
      });
      onCreated();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to create section.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !loading) onClose(); }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Create New Section</DialogTitle>
          <DialogDescription>
            Section names only need to be unique within the selected subject for your account.
            A join code is generated automatically.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <form className="space-y-1" aria-busy={loading} onSubmit={handleSubmit}>
          <FormField label="Subject">
            <Select required autoFocus disabled={loading} value={form.subjectId} onChange={set('subjectId')}>
              <option value="">— Select a subject —</option>
              {subjects.map(subject => (
                <option key={subject.id} value={subject.id}>{subject.code} — {subject.name}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Section Name">
            <Input
              required
              maxLength={120}
              disabled={loading}
              placeholder="e.g. CPE-402"
              value={form.sectionName}
              onChange={set('sectionName')}
            />
          </FormField>

          <FormField label="Folder">
            <Select disabled={loading} value={form.folderId} onChange={set('folderId')}>
              <option value="">Unorganized</option>
              {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </Select>
          </FormField>

          <DialogFooter className="pt-2">
            <Btn type="button" variant="ghost" disabled={loading} onClick={onClose}>Cancel</Btn>
            <Btn type="submit" loading={loading}>Create Section</Btn>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
