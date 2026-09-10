import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { LoadingState, EmptyState, PageHeader, Alert, Btn, Badge, ConfirmModal, Select } from '../../components/ui';
import api from '../../services/api';
import { Trash, Users } from '../../components/icons';

const ROLES   = ['All','ADMIN','INSTRUCTOR','STUDENT'];
const STATUSES = ['All','ACTIVE','PENDING','REJECTED','SUSPENDED'];

export default function AllUsers() {
  const [users, setUsers]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [loading, setL]     = useState(true);
  const [role, setRole]     = useState('All');
  const [status, setStatus] = useState('All');
  const [al, setAl]         = useState({});
  const [msg, setMsg]       = useState({ text:'', type:'success' });
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setL(true);
    try {
      const p = new URLSearchParams({ limit:'100' });
      if (role   !== 'All') p.append('role',   role);
      if (status !== 'All') p.append('status', status);
      const { data } = await api.get(`/admin/users?${p}`);
      setUsers(data.data.users); setTotal(data.data.total);
    } finally { setL(false); }
  }, [role, status]);

  useEffect(() => { load(); }, [load]);

  function notify(text, type='success') { setMsg({ text, type }); setTimeout(()=>setMsg({text:''}),4000); }

  async function handleStatus(u, newStatus) {
    setConfirm(null); setAl(p=>({...p,[u.id]:true}));
    try {
      await api.patch(`/admin/users/${u.id}/status`, { status: newStatus });
      notify(`${u.firstName} ${u.lastName} ${newStatus==='SUSPENDED'?'suspended':'reactivated'}.`);
      load();
    } catch(err) { notify(err.response?.data?.error||'Failed.','error'); }
    finally { setAl(p=>({...p,[u.id]:false})); }
  }

  async function handleDelete(u) {
    setConfirm(null); setAl(p=>({...p,[u.id]:true}));
    try {
      await api.delete(`/admin/users/${u.id}`);
      notify(`${u.firstName} ${u.lastName} permanently deleted.`);
      load();
    } catch(err) { notify(err.response?.data?.error||'Delete failed.','error'); }
    finally { setAl(p=>({...p,[u.id]:false})); }
  }
  async function handleForceDelete(u) {
    if (al[u.id]) return;

    setConfirm(null);
    setAl(p => ({ ...p, [u.id]: true }));

    try {
      const { data } = await api.delete(
        `/admin/users/${u.id}/force`
      );

      const deleted = data.data.deleted;

      notify(
        `${u.firstName} ${u.lastName} permanently deleted. ` +
        `${deleted.sections} section(s), ` +
        `${deleted.lessons} lesson(s), and ` +
        `${deleted.enrollments} enrollment(s) were removed.`
      );

      load();
    } catch (err) {
      notify(
        err.response?.data?.error || 'Force delete failed.',
        'error'
      );
    } finally {
      setAl(p => ({ ...p, [u.id]: false }));
    }
  }

  return (
    <DashboardLayout>
      <PageHeader title="All Users" subtitle={`${total} user${total!==1?'s':''} found`} />
      {msg.text && <Alert type={msg.type} onClose={()=>setMsg({text:''})}>{msg.text}</Alert>}

      <div className="glass-panel mb-5 flex flex-wrap gap-3 rounded-2xl p-4">
        <div className="w-full sm:w-36"><label className="block mb-1 text-xs font-semibold text-slate-600">Role</label>
          <Select value={role} onChange={e=>setRole(e.target.value)}>{ROLES.map(r=><option key={r}>{r}</option>)}</Select></div>
        <div className="w-full sm:w-40"><label className="block mb-1 text-xs font-semibold text-slate-600">Status</label>
          <Select value={status} onChange={e=>setStatus(e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</Select></div>
      </div>

      {loading ? <LoadingState /> : users.length===0
        ? <EmptyState icon={<Users size={23}/>} title="No users found" body="Try adjusting your filters." />
        : (
          <div className="table-shell">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 border-slate-200">
                {['Name','Email','Role','Status','Joined','Actions'].map(h=>(
                  <th key={h} className="px-4 py-3 text-xs font-semibold tracking-wider text-left uppercase text-slate-500">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u=>(
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-800">{u.firstName} {u.lastName}</td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3"><Badge status={u.role} /></td>
                    <td className="px-4 py-3"><Badge status={u.status} /></td>
                    <td className="px-4 py-3 text-slate-500">{new Date(u.createdAt).toLocaleDateString('en-PH')}</td>
                    <td className="px-4 py-3">
                      {u.role!=='ADMIN' && (
                        <div className="flex gap-1.5 flex-wrap">
                          {u.status==='SUSPENDED'
                            ? <Btn variant="success" size="sm" loading={al[u.id]} onClick={()=>setConfirm({type:'reactivate',user:u})}>Reactivate</Btn>
                            : <Btn variant="warning"  size="sm" loading={al[u.id]} disabled={u.status==='REJECTED'} onClick={()=>setConfirm({type:'suspend',user:u})}>Suspend</Btn>
                            
                          }
                          <Btn variant="danger" size="sm" loading={al[u.id]} onClick={()=>setConfirm({type:'delete',user:u})}><Trash size={13}/> Delete</Btn>
                          {u.role === 'INSTRUCTOR' && (
                            <Btn
                              variant="danger"
                              size="sm"
                              loading={al[u.id]}
                              onClick={() => setConfirm({ type: 'force-delete', user: u })}
                            >
                              <Trash size={13}/> Force Delete
                            </Btn>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      {confirm?.type==='suspend'    && <ConfirmModal title="Suspend this user?" body={`${confirm.user.firstName} ${confirm.user.lastName} will lose access immediately.`} confirmLabel="Suspend" confirmVariant="warning" onConfirm={()=>handleStatus(confirm.user,'SUSPENDED')} onCancel={()=>setConfirm(null)} />}
      {confirm?.type==='reactivate' && <ConfirmModal title="Reactivate this user?" body={`${confirm.user.firstName} ${confirm.user.lastName} will regain access.`} confirmLabel="Reactivate" confirmVariant="success" onConfirm={()=>handleStatus(confirm.user,'ACTIVE')} onCancel={()=>setConfirm(null)} />}
      {confirm?.type==='delete'     && <ConfirmModal title="Delete this user permanently?" body={`This cannot be undone. ${confirm.user.firstName} ${confirm.user.lastName}'s account will be permanently removed.`} confirmLabel="Delete User" confirmVariant="danger" onConfirm={()=>handleDelete(confirm.user)} onCancel={()=>setConfirm(null)} />}
      {confirm?.type === 'force-delete' && (
        <ConfirmModal
          title="Force delete this instructor?"
          body={
            `This will permanently delete ${confirm.user.firstName} ${confirm.user.lastName}, ` +
            `including all sections, lesson records, pause history, and enrollments owned by this instructor. ` +
            `This action cannot be undone.`
          }
          confirmLabel="Force Delete Instructor"
          confirmVariant="danger"
          onConfirm={() => handleForceDelete(confirm.user)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </DashboardLayout>
  );
}
