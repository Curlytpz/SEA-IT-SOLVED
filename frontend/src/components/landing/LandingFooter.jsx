import { Link } from 'react-router-dom';
import InteractiveWordmark from './animation/InteractiveWordmark';
import { BrandLink } from './LandingNavbar';
import { landingStyles } from './landingStyles';

const footerLink = 'inline-flex min-h-11 items-center text-sm transition-colors duration-200 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function LandingFooter() {
  return (
    <footer className="landing-footer landing-section-dark border-t border-border bg-sidebar text-muted-foreground">
      <div className={`grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.45fr_0.75fr_0.75fr_0.75fr] lg:py-20 ${landingStyles.container}`}>
        <div className="sm:col-span-2 lg:col-span-1">
          <BrandLink />
          <p className="mt-6 max-w-sm text-sm leading-7">Classroom intelligence for mathematics capture, academic review, structured materials, quizzes, and learning analytics.</p>
        </div>

        <nav aria-label="System links">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">System</h2>
          <div className="mt-4 grid">
            <a className={footerLink} href="#top">About</a>
            <a className={footerLink} href="#features">Features</a>
            <a className={footerLink} href="#how-it-works">How It Works</a>
          </div>
        </nav>

        <nav aria-label="Access links">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">Access</h2>
          <div className="mt-4 grid">
            <Link className={footerLink} to="/login?role=student">Student Login</Link>
            <Link className={footerLink} to="/login?role=instructor">Instructor Login</Link>
            <Link className={footerLink} to="/register/student">Student Registration</Link>
            <Link className={footerLink} to="/register/instructor">Instructor Registration</Link>
          </div>
        </nav>

        <nav aria-label="Project links">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">Project</h2>
          <div className="mt-4 grid">
            <span className="inline-flex min-h-11 items-center text-sm text-foreground">SEA-IT-SOLVED</span>
            <span className="inline-flex min-h-11 items-center text-sm">Holy Angel University</span>
            <span className="inline-flex min-h-11 items-center text-sm">Computer Engineering</span>
          </div>
        </nav>
      </div>

      <div className="landing-footer-wordmark-shell overflow-hidden border-y border-border py-7 sm:py-9" data-landing-wordmark>
        <InteractiveWordmark giant className="block w-full text-center" aria-hidden="true">
          <span className="landing-footer-wordmark inline-block whitespace-nowrap text-center font-semibold leading-[0.78] tracking-[-0.075em] text-foreground">SEA-IT-SOLVED</span>
        </InteractiveWordmark>
      </div>

      <div>
        <div className={`flex flex-col gap-2 py-5 text-xs sm:flex-row sm:items-center sm:justify-between ${landingStyles.container}`}>
          <span>© 2026 SEA-IT-SOLVED</span>
          <span>Smart Whiteboard for Mathematics</span>
        </div>
      </div>
    </footer>
  );
}
