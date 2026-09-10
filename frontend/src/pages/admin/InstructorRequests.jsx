import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { LoadingState, EmptyState, PageHeader, Alert, Btn, Table, Badge } from '../../components/ui';
import api from '../../services/api';
import { Check, CircleX, Clock } from '../../components/icons';

export default function InstructorRequests() {
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setAL] = useState({});
  const [message, setMessage] = useState({ text: '', type: 'success' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/admin/instructors/pending'); setInstructors(data.data.instructors); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handle(id, action) {
    setAL(p => ({ ...p, [id]: action }));
    try {
      await api.patch(`/admin/instructors/${id}/${action}`);
      setMessage({ text: `Instructor ${action}d successfully.`, type: 'success' });
      setInstructors(p => p.filter(i => i.id !== id));
    } catch (err) { setMessage({ text: err.response?.data?.error || 'Action failed.', type: 'error' }); }
    finally { setAL(p => ({ ...p, [id]: null })); }
  }

  return (
    <DashboardLayout>
      <PageHeader title="Instructor Requests" subtitle="Review pending instructor registrations" />
      {message.text && <Alert type={message.type} onClose={() => setMessage({ text: '' })}>{message.text}</Alert>}
      {loading ? <LoadingState /> : instructors.length === 0
        ? <EmptyState icon={<Check size={23}/>} title="No pending requests" body="All instructor registrations have been reviewed." />
        : (
          <Table
            emptyIcon={<Clock size={23}/>} emptyTitle="No pending requests"
            columns={[
              { key: 'name', label: 'Name', render: r => <strong>{r.firstName} {r.lastName}</strong> },
              { key: 'email', label: 'Email', render: r => <span className="text-slate-500">{r.email}</span> },
              { key: 'date', label: 'Registered', render: r => new Date(r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) },
              { key: 'actions', label: 'Actions', render: r => (
                <div className="flex gap-2">
                  <Btn variant="success" size="sm" loading={actionLoading[r.id] === 'approve'} onClick={() => handle(r.id, 'approve')}><Check size={14}/> Approve</Btn>
                  <Btn variant="danger" size="sm" loading={actionLoading[r.id] === 'reject'} onClick={() => handle(r.id, 'reject')}><CircleX size={14}/> Reject</Btn>
                </div>
              )},
            ]}
            rows={instructors}
          />
        )
      }
    </DashboardLayout>
  );
}
