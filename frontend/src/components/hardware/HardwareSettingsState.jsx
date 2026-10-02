import { StatusChip, Tooltip } from '../ui';

export function SettingsPanelHeader({icon,title,description,editing,configured=true,simulated=false}){
  return <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
    <div><h2 className="flex items-center gap-2 text-lg font-bold text-foreground dark:text-foreground">{icon}{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground dark:text-muted-foreground">{description}</p></div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
      <StatusChip status={editing ? 'DRAFT' : configured ? 'READY' : 'PENDING'} label={editing ? 'Editing' : configured ? 'Configured' : 'Setup required'} />
      {simulated && <Tooltip label="This setting uses the development simulator."><span className="inline-flex min-h-6 items-center rounded-full border border-border bg-secondary px-2 text-[11px] font-semibold text-muted-foreground">Simulated</span></Tooltip>}
    </div>
  </div>;
}

export function ConfiguredSummary({items,children}){
  return <div className="rounded-2xl border border-white/60 bg-surface-elevated/65 p-4 shadow-[var(--neu-shadow-inset)] dark:border-border/80 dark:bg-card/[.035]">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(item=><div key={item.label}><p className="text-xs font-semibold text-muted-foreground">{item.label}</p><p className="mt-1 text-sm font-semibold text-foreground dark:text-foreground">{item.value}</p></div>)}</div>
    {children&&<div className="mt-4 flex flex-wrap gap-2 border-t border-border/80 pt-4 dark:border-border">{children}</div>}
  </div>;
}
