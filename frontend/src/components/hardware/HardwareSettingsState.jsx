import { Check } from '../icons';

export function SettingsPanelHeader({icon,title,description,editing,configured=true}){
  return <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
    <div><h2 className="flex items-center gap-2 text-base font-bold text-foreground dark:text-foreground">{icon}{title}</h2><p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">{description}</p></div>
    <span className={`inline-flex min-h-7 shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 text-[11px] font-bold uppercase tracking-wide ${editing?'bg-warning-subtle text-warning-subtle-foreground dark:bg-warning-subtle dark:text-warning-subtle-foreground':configured?'bg-success-subtle text-success-subtle-foreground dark:bg-success-subtle dark:text-success-subtle-foreground':'bg-surface-elevated text-muted-foreground dark:bg-card/10 dark:text-muted-foreground'}`}>{!editing&&configured&&<Check size={13}/>} {editing?'Editing':configured?'Configured':'Setup required'}</span>
  </div>;
}

export function ConfiguredSummary({items,children}){
  return <div className="rounded-xl border border-border/80 bg-surface-elevated/65 p-4 dark:border-border dark:bg-card/[.035]">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(item=><div key={item.label}><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p><p className="mt-1 text-sm font-semibold text-foreground dark:text-foreground">{item.value}</p></div>)}</div>
    {children&&<div className="mt-4 flex flex-wrap gap-2 border-t border-border/80 pt-4 dark:border-border">{children}</div>}
  </div>;
}
