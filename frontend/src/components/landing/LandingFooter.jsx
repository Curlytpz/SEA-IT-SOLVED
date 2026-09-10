import { Link } from 'react-router-dom';
import { BrandLink } from './LandingNavbar';
import { landingStyles } from './landingStyles';

const footerLink = 'inline-flex min-h-11 items-center text-sm transition-colors duration-200 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function LandingFooter() {
  return (
    <footer className="landing-section-dark border-t border-border bg-sidebar text-muted-foreground">
      <div className={`grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr] lg:py-12 ${landingStyles.container}`}>
        <div>
          <BrandLink />
          <p className="mt-5 max-w-md text-sm leading-7">Classroom software for mathematics capture, instructor review, structured materials, quizzes, and learning analytics.</p>
        </div>

        <nav aria-label="Account links">
          <h2 className="text-xs font-bold text-foreground">Accounts</h2>
          <div className="mt-3 grid">
            <Link className={footerLink} to="/login">Sign In</Link>
            <Link className={footerLink} to="/register/student">Student Registration</Link>
            <Link className={footerLink} to="/register/instructor">Instructor Registration</Link>
          </div>
        </nav>

        <nav aria-label="Product links">
          <h2 className="text-xs font-bold text-foreground">Product</h2>
          <div className="mt-3 grid">
            <a className={footerLink} href="#how-it-works">How it works</a>
            <a className={footerLink} href="#instructors">For instructors</a>
            <a className={footerLink} href="#students">For students</a>
            <a className={footerLink} href="#features">Analytics</a>
          </div>
        </nav>
      </div>

      <div className="border-t border-border">
        <div className={`flex flex-col gap-2 py-4 text-xs sm:flex-row sm:items-center sm:justify-between ${landingStyles.container}`}>
          <span>Copyright 2026 SEA-IT-SOLVED</span>
          <span>Undergraduate academic project</span>
        </div>
      </div>
    </footer>
  );
}
