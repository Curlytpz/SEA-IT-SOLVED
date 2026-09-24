function formatTimestamp(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function TranscriptTimeline({ segments, onSeek }) {
  if (!segments?.length) return <p className="text-sm text-muted-foreground dark:text-muted-foreground">No timestamped speech segments were returned.</p>;
  return <div className="space-y-2">
    {segments.map((segment, index) => <div key={`${segment.audioStartMs}-${index}`} className="grid gap-2 rounded-xl border border-border/80 bg-card/60 p-3 dark:border-border dark:bg-card/[.035] sm:grid-cols-[5.5rem_minmax(0,1fr)]">
      <button type="button" onClick={() => onSeek(segment.audioStartMs)} className="relative h-fit rounded-lg bg-info-subtle px-2.5 py-1.5 text-left text-xs font-bold text-info transition active:scale-[.99] hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
        {formatTimestamp(segment.audioStartMs)}
      </button>
      <div className="min-w-0">
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground dark:text-foreground">{segment.text}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {segment.language && <span>{segment.language}</span>}
          {segment.uncertain && <span className="font-semibold text-warning-subtle-foreground dark:text-warning-subtle-foreground">Uncertain{segment.uncertaintyReason ? ` — ${segment.uncertaintyReason}` : ''}</span>}
        </div>
      </div>
    </div>)}
  </div>;
}
