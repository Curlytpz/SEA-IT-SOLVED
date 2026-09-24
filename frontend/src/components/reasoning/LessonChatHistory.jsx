import { History, MoreHorizontal, Plus, Search, Trash2, X } from 'lucide-react';
import { Btn, Input } from '../ui';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';

function dayGroup(value) {
  const date = new Date(value);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startToday - startDate) / 86400000);
  if (dayDifference === 0) return 'Today';
  if (dayDifference === 1) return 'Yesterday';
  return 'Earlier';
}

function timestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const group = dayGroup(date);
  return group === 'Today'
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function HistoryContents({ conversations, activeId, search, onSearch, loading, error, onNew, onSelect, onDelete, onClose, idPrefix }) {
  const query = search.trim().toLocaleLowerCase();
  const filtered = conversations.filter(item =>
    item.title?.toLocaleLowerCase().includes(query) || item.preview?.toLocaleLowerCase().includes(query)
  );
  const groups = ['Today', 'Yesterday', 'Earlier'].map(label => ({
    label,
    conversations: filtered.filter(item => dayGroup(item.updatedAt) === label),
  })).filter(group => group.conversations.length);

  return <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-[.65rem] border-b border-border px-[.85rem] py-3">
      <span className="inline-flex min-w-0 items-center gap-2 text-foreground"><History size={17} aria-hidden="true"/><strong className="text-[.82rem] font-[720]">Chat history</strong></span>
      {onClose && <button className="inline-flex min-h-10 w-10 shrink-0 items-center justify-center gap-[.4rem] rounded-[9px] text-muted-foreground hover:bg-primary-subtle hover:text-primary-subtle-foreground" type="button" aria-label="Close chat history" onClick={onClose}><X size={18} aria-hidden="true"/></button>}
    </header>
    <div className="grid shrink-0 gap-[.65rem] p-[.8rem] [&>button]:w-max">
      <Btn size="sm" onClick={onNew}><Plus size={16} aria-hidden="true"/>New Chat</Btn>
      <label className="relative block">
        <span className="sr-only">Search conversations</span>
        <Search className="pointer-events-none absolute left-[.7rem] top-1/2 z-[1] -translate-y-1/2 text-muted-foreground" size={15} aria-hidden="true"/>
        <Input className="min-h-10 pl-8 text-xs" type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder="Search conversations"/>
      </label>
    </div>
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-[.55rem] pb-[max(.85rem,env(safe-area-inset-bottom))] pt-3 [scrollbar-gutter:stable]">
      {loading && <p className="px-[.65rem] py-[1.2rem] text-center text-[.73rem] leading-6 text-muted-foreground" role="status">Loading conversations...</p>}
      {!loading && error && <p className="px-[.65rem] py-[1.2rem] text-center text-[.73rem] leading-6 text-destructive" role="alert">{error}</p>}
      {!loading && !error && !conversations.length && <div className="grid gap-[.55rem] px-[.65rem] py-[1.2rem] text-center text-[.73rem] leading-6 text-muted-foreground"><p>No previous AI conversations yet.</p><button className="min-h-10 font-[680] text-primary-subtle-foreground" type="button" onClick={onNew}>Start a new chat</button></div>}
      {!loading && !error && conversations.length > 0 && !filtered.length && <p className="px-[.65rem] py-[1.2rem] text-center text-[.73rem] leading-6 text-muted-foreground">No conversations match your search.</p>}
      {!loading && !error && groups.map(group => <section className="mt-[.8rem] first:mt-0" key={group.label} aria-labelledby={`${idPrefix}-${group.label.toLowerCase()}`}>
        <h3 className="px-[.45rem] pb-[.35rem] text-[.65rem] font-[750] uppercase tracking-[.055em] text-muted-foreground" id={`${idPrefix}-${group.label.toLowerCase()}`}>{group.label}</h3>
        <div className="grid gap-[.2rem]">{group.conversations.map(item => {const active=activeId===item.id;return <article className={`relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center rounded-[10px] hover:bg-surface ${active?'bg-primary-subtle before:absolute before:bottom-[.55rem] before:left-0 before:top-[.55rem] before:z-[1] before:w-[3px] before:rounded-full before:bg-primary before:content-[\"\"]':''}`} key={item.id}>
          <button type="button" className="grid min-h-16 min-w-0 gap-[.28rem] py-[.62rem] pl-[.62rem] pr-[.35rem] text-left" aria-current={active ? 'page' : undefined} onClick={() => onSelect(item.id)}>
            <span className="flex min-w-0 items-baseline gap-[.4rem]"><strong className="min-w-0 flex-1 truncate text-xs font-[680] text-foreground">{item.title || 'New Conversation'}</strong><time className="shrink-0 text-[.6rem] text-muted-foreground" dateTime={item.updatedAt}>{timestamp(item.updatedAt)}</time></span>
            <small className="truncate text-[.68rem] leading-[1.35] text-muted-foreground">{item.preview || 'Conversation started'}</small>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className={`mr-[.2rem] inline-grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface-elevated hover:text-foreground hover:opacity-100 focus-visible:bg-surface-elevated focus-visible:text-foreground focus-visible:opacity-100 ${active?'bg-surface-elevated text-foreground opacity-100':'opacity-55'}`} aria-label={`Conversation actions for ${item.title || 'conversation'}`}><MoreHorizontal size={17} aria-hidden="true"/></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(item)}><Trash2 size={15} aria-hidden="true"/>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </article>;})}</div>
      </section>)}
    </div>
  </div>;
}

export default function LessonChatHistory(props) {
  return <>
    <aside
      id="lesson-chat-history-panel"
      className={`lesson-chat-history-panel ${props.desktopOpen ? 'is-open' : ''}`}
      aria-label="AI chat history"
      aria-hidden={!props.desktopOpen}
      inert={props.desktopOpen ? undefined : true}
    ><HistoryContents {...props} idPrefix="desktop-chat-history" onClose={() => props.onDesktopOpenChange(false)}/></aside>
    <Dialog open={props.mobileOpen} onOpenChange={props.onMobileOpenChange}>
      <DialogContent id="lesson-chat-history-drawer" showCloseButton={false} className="!left-0 !top-0 !block !h-dvh !max-h-dvh !w-[min(22rem,100vw)] !max-w-[100vw] !translate-x-0 !translate-y-0 !overflow-hidden !rounded-none !border-y-0 !border-l-0 !border-r !pb-0 !pl-0 !pr-0 !pt-[max(.2rem,env(safe-area-inset-top))]">
        <DialogTitle className="sr-only">AI chat history</DialogTitle>
        <HistoryContents {...props} idPrefix="mobile-chat-history" onClose={() => props.onMobileOpenChange(false)}/>
      </DialogContent>
    </Dialog>
  </>;
}
