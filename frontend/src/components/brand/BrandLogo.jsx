import { cn } from '../../lib/utils';

const MARK_SIZES = { sm: 'h-8 w-[3.8rem]', md: 'h-9 w-[4.275rem]', lg: 'h-11 w-[5.225rem]' };
const WORDMARK_SIZES = { sm: 'text-[13px]', md: 'text-sm', lg: 'text-base' };
const TONES = { auto: 'text-brand dark:text-brand-foreground', dark: 'text-brand', light: 'text-brand-foreground' };

export function LogoMark({ size = 'md', className = '', title = 'SEA-IT-SOLVED' }) {
  return (
    <img src="/sea-logo.png" width="760" height="400" alt={title} aria-hidden={title ? undefined : true} draggable="false" className={cn('shrink-0 object-contain', MARK_SIZES[size] || MARK_SIZES.md, className)} />
  );
}

export function LogoWordmark({ size = 'md', tone = 'auto', className = '' }) {
  return <span className={cn('whitespace-nowrap font-bold tracking-[-0.025em]', WORDMARK_SIZES[size] || WORDMARK_SIZES.md, TONES[tone] || TONES.auto, className)}>SEA<span className="text-primary">-IT-</span>SOLVED</span>;
}

export function BrandLogo({ size = 'md', tone = 'auto', tagline = false, compact = false, className = '' }) {
  return <span className={cn('inline-flex min-w-0 max-w-full items-center overflow-hidden', compact ? 'gap-2' : 'gap-2.5', className)}><LogoMark size={size} title="" className={tagline ? 'h-7 w-[3.325rem]' : ''} /><span className="min-w-0 max-[359px]:hidden"><LogoWordmark size={size} tone={tone} />{tagline && <span className={cn('mt-0.5 block text-[10px] font-medium tracking-wide', tone === 'light' ? 'text-brand-foreground/65' : 'text-muted-foreground')}>Smart Whiteboard for Mathematics</span>}</span></span>;
}
