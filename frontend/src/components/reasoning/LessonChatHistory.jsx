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

  return <div className="lesson-chat-history-content">
    <header className="lesson-chat-history-heading">
      <span><History size={17} aria-hidden="true"/><strong>Chat history</strong></span>
      {onClose && <button type="button" aria-label="Close chat history" onClick={onClose}><X size={18} aria-hidden="true"/></button>}
    </header>
    <div className="lesson-chat-history-controls">
      <Btn size="sm" onClick={onNew}><Plus size={16} aria-hidden="true"/>New Chat</Btn>
      <label className="lesson-chat-history-search">
        <span className="sr-only">Search conversations</span>
        <Search size={15} aria-hidden="true"/>
        <Input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder="Search conversations"/>
      </label>
    </div>
    <div className="lesson-chat-history-scroll">
      {loading && <p className="lesson-chat-history-state" role="status">Loading conversations...</p>}
      {!loading && error && <p className="lesson-chat-history-state is-error" role="alert">{error}</p>}
      {!loading && !error && !conversations.length && <div className="lesson-chat-history-empty"><p>No previous AI conversations yet.</p><button type="button" onClick={onNew}>Start a new chat</button></div>}
      {!loading && !error && conversations.length > 0 && !filtered.length && <p className="lesson-chat-history-state">No conversations match your search.</p>}
      {!loading && !error && groups.map(group => <section className="lesson-chat-history-group" key={group.label} aria-labelledby={`${idPrefix}-${group.label.toLowerCase()}`}>
        <h3 id={`${idPrefix}-${group.label.toLowerCase()}`}>{group.label}</h3>
        <div>{group.conversations.map(item => <article className={`lesson-chat-history-item ${activeId === item.id ? 'is-active' : ''}`} key={item.id}>
          <button type="button" className="lesson-chat-history-select" aria-current={activeId === item.id ? 'page' : undefined} onClick={() => onSelect(item.id)}>
            <span><strong>{item.title || 'New Conversation'}</strong><time dateTime={item.updatedAt}>{timestamp(item.updatedAt)}</time></span>
            <small>{item.preview || 'Conversation started'}</small>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="lesson-chat-history-menu-trigger" aria-label={`Conversation actions for ${item.title || 'conversation'}`}><MoreHorizontal size={17} aria-hidden="true"/></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(item)}><Trash2 size={15} aria-hidden="true"/>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </article>)}</div>
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
      <DialogContent id="lesson-chat-history-drawer" showCloseButton={false} className="lesson-chat-history-drawer">
        <DialogTitle className="sr-only">AI chat history</DialogTitle>
        <HistoryContents {...props} idPrefix="mobile-chat-history" onClose={() => props.onMobileOpenChange(false)}/>
      </DialogContent>
    </Dialog>
  </>;
}
