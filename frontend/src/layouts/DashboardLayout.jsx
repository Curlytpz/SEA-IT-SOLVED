import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { BookOpen, Chart, Clock, GraduationCap, LayoutDashboard, LogOut, Menu, Search, Settings, Shield, Users, X } from '../components/icons';
import { PageTransition } from '../components/PageTransition';
import { BrandLogo } from '../components/brand/BrandLogo';

const NAV = {
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/instructor-requests', label: 'Instructor Requests', icon: Clock },
    { to: '/admin/users', label: 'All Users', icon: Users },
    { to: '/admin/system-evaluation', label: 'System Evaluation', icon: Chart },
  ],
  INSTRUCTOR: [
    { to: '/instructor', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/instructor/sections', label: 'My Teaching', icon: BookOpen },
    { to: '/instructor/settings', label: 'Hardware Settings', icon: Settings },
  ],
  STUDENT: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/student/join-section', label: 'Join Section', icon: Search },
    { to: '/student/classes', label: 'My Classes', icon: BookOpen },
    { to: '/student/results', label: 'Quiz Results', icon: Chart },
  ],
};

const ROLE_ICON = { ADMIN: Shield, INSTRUCTOR: GraduationCap, STUDENT: Users };

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const menuRef = useRef(null);
  const drawerRef = useRef(null);
  const closeRef = useRef(null);
  const shellRef = useRef(null);
  const links = NAV[user?.role] || [];
  const RoleIcon = ROLE_ICON[user?.role] || Users;

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      setDesktop(media.matches);
      if (media.matches) setOpen(false);
    };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!open || desktop) return undefined;
    closeRef.current?.focus();
    function handleKey(event) {
      if (event.key === 'Escape') { setOpen(false); menuRef.current?.focus(); return; }
      if (event.key !== 'Tab') return;
      const focusable = drawerRef.current?.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, desktop]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (reducedMotion.matches || !finePointer.matches) return undefined;

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    const paint = () => {
      shellRef.current?.style.setProperty('--ambient-shift-x', `${pointerX}px`);
      shellRef.current?.style.setProperty('--ambient-shift-y', `${pointerY}px`);
      frame = 0;
    };
    const handlePointerMove = event => {
      pointerX = Math.round(((event.clientX / window.innerWidth) - 0.5) * 16);
      pointerY = Math.round(((event.clientY / window.innerHeight) - 0.5) * 12);
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  function signOut() {
    logout();
    navigate('/login');
  }

  return (
    <div ref={shellRef} className="dashboard-shell min-h-dvh">
      <header className="dashboard-mobile-header glass-panel sticky top-0 z-30 flex min-h-16 items-center justify-between px-3 sm:px-4 lg:hidden">
        <button ref={menuRef} type="button" onClick={()=>setOpen(true)} aria-label="Open navigation" aria-expanded={open}
          className="grid h-11 w-11 place-items-center rounded-xl text-foreground transition hover:bg-primary-subtle hover:text-primary-subtle-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Menu size={21}/>
        </button>
        <BrandLogo compact size="sm" />
        <ThemeToggle compact />
      </header>

      <div aria-hidden="true" className={`fixed inset-0 z-40 bg-slate-950/45 transition-opacity [transition-duration:260ms] [transition-timing-function:cubic-bezier(.22,1,.36,1)] lg:hidden ${open?'opacity-100':'pointer-events-none opacity-0'}`} onClick={()=>setOpen(false)} />

      <aside ref={drawerRef} role={!desktop ? "dialog" : undefined} aria-modal={!desktop && open ? "true" : undefined} aria-label={!desktop ? "Main navigation" : undefined} aria-hidden={!desktop && !open ? "true" : undefined} inert={!desktop && !open ? true : undefined} className={`dashboard-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar text-sidebar-foreground shadow-xl transition-transform [transition-duration:320ms] [transition-timing-function:cubic-bezier(.22,1,.36,1)] lg:z-30 lg:w-64 lg:translate-x-0 ${open?'translate-x-0':'-translate-x-full'}`}>
        <div className="dashboard-sidebar-header flex h-20 shrink-0 items-center justify-between border-b border-border px-5">
          <BrandLogo tagline />
          <button ref={closeRef} type="button" onClick={()=>{setOpen(false);menuRef.current?.focus();}} aria-label="Close navigation" className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground transition-colors duration-200 hover:bg-primary-subtle hover:text-primary-subtle-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"><X size={19}/></button>
        </div>

        <div className="dashboard-sidebar-profile mx-3 mt-4 shrink-0 rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-inset ring-primary/20"><RoleIcon size={19}/></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{user?.firstName} {user?.lastName}</p>
              <p className="mt-0.5 text-[11px] font-semibold capitalize tracking-wide text-primary-subtle-foreground dark:text-primary">{String(user?.role || '').toLowerCase()}</p>
            </div>
          </div>
        </div>

        <nav className="dashboard-sidebar-nav min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-5" aria-label="Main navigation">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground">Workspace</p>
          <div className="space-y-1">
            {links.map(({to,label,icon:NavIcon})=><NavLink key={to} to={to} end={to.split('/').length<=2}
              className={({isActive})=>`nav-interactive group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 after:absolute after:left-0 after:top-1/2 after:h-5 after:w-0.5 after:-translate-y-1/2 after:rounded-full after:bg-primary after:transition-transform after:duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive?'bg-primary-subtle text-primary-subtle-foreground shadow-sm after:scale-y-100':'text-muted-foreground after:scale-y-0 hover:bg-accent hover:text-accent-foreground'}`}>
              <NavIcon size={18} className="transition-transform duration-200 group-hover:scale-105"/><span>{label}</span>
            </NavLink>)}
          </div>
        </nav>

        <div className="dashboard-sidebar-footer shrink-0 space-y-2 border-t border-border p-3">
          <ThemeToggle />
          <button type="button" onClick={signOut} className="group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-xs font-semibold text-muted-foreground transition-colors duration-200 hover:bg-destructive/10 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive">
            <LogOut size={17} className="transition-transform group-hover:translate-x-0.5"/>Sign out
          </button>
        </div>
      </aside>

      <main className="dashboard-main min-h-dvh min-w-0 lg:pl-64">
        <div className="dashboard-content mx-auto w-full max-w-[1920px] px-3 py-4 sm:px-6 sm:py-7 lg:px-8 2xl:px-10"><PageTransition>{children}</PageTransition></div>
      </main>
    </div>
  );
}
