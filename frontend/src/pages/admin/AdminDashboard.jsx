import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { LoadingState, StatCard, Card, PageHeader } from '../../components/ui';
import api from '../../services/api';
import { Clock, Users } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { dashboardGreeting } from '../../utils/dashboardGreeting';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const greeting = dashboardGreeting(user);

  useEffect(() => {
    Promise.all([api.get('/admin/users?limit=1'), api.get('/admin/instructors/pending')])
      .then(([u, p]) => setStats({ total: u.data.data.total, pending: p.data.data.instructors.length }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <PageHeader title={greeting.title} subtitle={[greeting.name, 'System overview and management'].filter(Boolean).join(' • ')} />
      {loading ? <LoadingState /> : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard value={stats?.total ?? '—'} label="Total Users" />
            <StatCard value={stats?.pending ?? '—'} label="Pending Instructors"
              accent={stats?.pending > 0 ? '#f59e0b' : undefined} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Link to="/admin/instructor-requests" className="block">
              <Card className="interactive-card cursor-pointer p-5 hover:border-primary/35 hover:shadow-glass">
                <div className="icon-tile mb-3 h-10 w-10"><Clock size={20}/></div>
                <h3 className="font-semibold text-slate-800 mb-1">Instructor Requests</h3>
                <p className="text-sm text-slate-500">Review and approve pending registrations.</p>
                {stats?.pending > 0 && (
                  <span className="inline-flex items-center mt-3 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                    {stats.pending} pending
                  </span>
                )}
              </Card>
            </Link>
            <Link to="/admin/users" className="block">
              <Card className="interactive-card cursor-pointer p-5 hover:border-primary/35 hover:shadow-glass">
                <div className="icon-tile mb-3 h-10 w-10"><Users size={20}/></div>
                <h3 className="font-semibold text-slate-800 mb-1">User Management</h3>
                <p className="text-sm text-slate-500">View, suspend, reactivate, or delete accounts.</p>
              </Card>
            </Link>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
