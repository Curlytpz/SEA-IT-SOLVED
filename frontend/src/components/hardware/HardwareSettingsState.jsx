import { Check } from '../icons';

export function SettingsPanelHeader({icon,title,description,editing,configured=true}){
  return <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
    <div><h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">{icon}{title}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p></div>
    <span className={`inline-flex min-h-7 shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 text-[11px] font-bold uppercase tracking-wide ${editing?'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200':configured?'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200':'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'}`}>{!editing&&configured&&<Check size={13}/>} {editing?'Editing':configured?'Configured':'Setup required'}</span>
  </div>;
}

export function ConfiguredSummary({items,children}){
  return <div className="rounded-2xl border border-slate-200/80 bg-slate-100/65 p-4 dark:border-white/10 dark:bg-white/[.035]">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(item=><div key={item.label}><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p><p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{item.value}</p></div>)}</div>
    {children&&<div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/80 pt-4 dark:border-white/10">{children}</div>}
  </div>;
}
