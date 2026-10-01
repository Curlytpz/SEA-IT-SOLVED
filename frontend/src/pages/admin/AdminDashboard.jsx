import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { DashboardLoadingState, DashboardStatusPanel, Card, PageHeader, StatusChip } from '../../components/ui';
import api from '../../services/api';
import { Check, Clock, Users } from '../../components/icons';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/admin/users?limit=1'), api.get('/admin/instructors/pending')])
      .then(([u, p]) => setStats({ total: u.data.data.total, pending: p.data.data.instructors.length }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pendingApprovals = Number(stats?.pending) || 0;
  const totalUsers = Number(stats?.total) || 0;
  const adminStory = pendingApprovals > 0
    ? { title: pendingApprovals + (pendingApprovals === 1 ? ' approval needs review' : ' approvals need review'), description: 'Review the pending instructor requests.' }
    : { title: 'Everything is up to date', description: 'There are no instructor approvals waiting for review.' };

  return (
    <DashboardLayout>
      <PageHeader title="System Overview" subtitle={loading ? 'User access and instructor approvals.' : `${stats?.pending ? `${stats.pending} instructor ${stats.pending === 1 ? 'approval' : 'approvals'} pending` : 'No instructor approvals pending'} • ${stats?.total ?? 0} registered ${stats?.total === 1 ? 'user' : 'users'}`} />
      {loading ? <DashboardLoadingState cards={2}/> : (
        <>
          <DashboardStatusPanel
            className="mb-6"
            indicator={<div role="img" aria-label={pendingApprovals + ' instructor approvals pending'} className="grid h-32 w-32 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] shadow-[var(--sh-inset)]"><div className="grid text-center">{pendingApprovals > 0 ? <strong className="text-3xl font-semibold leading-none tabular-nums text-foreground">{pendingApprovals}</strong> : <Check size={28} className="mx-auto text-success" aria-hidden="true" />}<span className="mt-1 text-[12px] font-medium text-muted-foreground">{pendingApprovals > 0 ? 'pending' : 'ready'}</span></div></div>}
            title={adminStory.title}
            description={adminStory.description}
            chip={pendingApprovals > 0
              ? <Link to="/admin/instructor-requests" className="inline-flex min-h-10 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><StatusChip status="PENDING" label="Review approvals" /></Link>
              : <StatusChip status="READY" label="Nothing waiting" />}
            slots={[
              { key: 'users', label: 'Users', value: totalUsers, status: 'Registered accounts', icon: <Users size={15} aria-hidden="true" />, to: '/admin/users' },
              { key: 'approvals', label: 'Approvals', value: pendingApprovals, status: pendingApprovals > 0 ? 'Awaiting review' : 'None waiting', icon: <Clock size={15} aria-hidden="true" />, to: '/admin/instructor-requests', emphasized: pendingApprovals > 0 },
            ]}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Link to="/admin/instructor-requests" className="block">
              <Card interactive className="cursor-pointer p-5">
                <div className="mb-3 inline-grid h-10 w-10 place-items-center rounded-[.7rem] bg-primary-subtle text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/.14)] dark:text-primary-subtle-foreground"><Clock size={20}/></div>
                <h3 className="font-semibold text-foreground mb-1">Instructor Requests</h3>
                <p className="text-sm text-muted-foreground">Review and approve pending registrations.</p>
                {stats?.pending > 0 && (
                  <span className="mt-3 inline-flex items-center rounded-full bg-warning-subtle px-2.5 py-0.5 text-xs font-bold text-warning-subtle-foreground dark:bg-warning-subtle dark:text-warning-subtle-foreground">
                    {stats.pending} pending
                  </span>
                )}
              </Card>
            </Link>
            <Link to="/admin/users" className="block">
              <Card interactive className="cursor-pointer p-5">
                <div className="mb-3 inline-grid h-10 w-10 place-items-center rounded-[.7rem] bg-primary-subtle text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/.14)] dark:text-primary-subtle-foreground"><Users size={20}/></div>
                <h3 className="font-semibold text-foreground mb-1">User Management</h3>
                <p className="text-sm text-muted-foreground">View, suspend, reactivate, or delete accounts.</p>
              </Card>
            </Link>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
