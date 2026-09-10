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
  if (!segments?.length) return <p className="text-sm text-slate-500 dark:text-slate-400">No timestamped speech segments were returned.</p>;
  return <div className="space-y-2">
    {segments.map((segment, index) => <div key={`${segment.audioStartMs}-${index}`} className="grid gap-2 rounded-xl border border-slate-200/80 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[.035] sm:grid-cols-[5.5rem_minmax(0,1fr)]">
      <button type="button" onClick={() => onSeek(segment.audioStartMs)} className="premium-interactive h-fit rounded-lg bg-info-subtle px-2.5 py-1.5 text-left text-xs font-bold text-info transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {formatTimestamp(segment.audioStartMs)}
      </button>
      <div className="min-w-0">
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{segment.text}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
          {segment.language && <span>{segment.language}</span>}
          {segment.uncertain && <span className="font-semibold text-amber-600 dark:text-amber-300">Uncertain{segment.uncertaintyReason ? ` — ${segment.uncertaintyReason}` : ''}</span>}
        </div>
      </div>
    </div>)}
  </div>;
}
