import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { DashboardLoadingState, StatCard, Card, PageHeader } from '../../components/ui';
import api from '../../services/api';
import { Clock, Users } from '../../components/icons';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/admin/users?limit=1'), api.get('/admin/instructors/pending')])
      .then(([u, p]) => setStats({ total: u.data.data.total, pending: p.data.data.instructors.length }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <PageHeader title="System Overview" subtitle={loading ? 'User access and instructor approvals.' : `${stats?.pending ? `${stats.pending} instructor ${stats.pending === 1 ? 'approval' : 'approvals'} pending` : 'No instructor approvals pending'} • ${stats?.total ?? 0} registered ${stats?.total === 1 ? 'user' : 'users'}`} />
      {loading ? <DashboardLoadingState cards={2}/> : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard value={stats?.total ?? '—'} label="Total Users" />
            <StatCard value={stats?.pending ?? '—'} label="Pending Instructors"
              accent={stats?.pending > 0 ? '#f59e0b' : undefined} />
          </div>
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
