import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Radio, ArrowDown } from 'lucide-react';
import { TranscriptionEntry, GuestProfile } from '../types';

interface TranscriptionFeedProps {
  entries: TranscriptionEntry[];
  // Fill the flex parent instead of a fixed-height cap (mobile layout).
  fill?: boolean;
  // The two debaters — used to color/side each message.
  guests?: GuestProfile[];
}

type Side = 'left' | 'right' | 'center';

interface SpeakerMeta {
  side: Side;
  label: string;       // speaker-name color
  bubble: string;      // bubble bg + border
  avatar: string;      // avatar circle bg
}

const SIDE_STYLES: Record<Side, SpeakerMeta> = {
  left: {
    side: 'left',
    label: 'text-emerald-300',
    bubble: 'bg-emerald-500/10 border-emerald-500/25 text-slate-100',
    avatar: 'bg-emerald-500',
  },
  right: {
    side: 'right',
    label: 'text-sky-300',
    bubble: 'bg-sky-500/10 border-sky-500/25 text-slate-100',
    avatar: 'bg-sky-500',
  },
  center: {
    side: 'center',
    label: 'text-indigo-300',
    bubble: 'bg-indigo-600/20 border-indigo-500/30 text-indigo-50',
    avatar: 'bg-indigo-500',
  },
};

const fmtTime = (ts: number) => {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const TranscriptionFeed: React.FC<TranscriptionFeedProps> = ({
  entries,
  fill = false,
  guests = [],
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  // Map a speaker name → side/colors. Guest 0 = left, guest 1 = right,
  // moderator/host = center.
  const metaFor = useCallback(
    (entry: TranscriptionEntry): SpeakerMeta => {
      if (entry.type === 'user') return SIDE_STYLES.center;
      const idx = guests.findIndex(g => g.name === entry.speaker);
      if (idx === 1) return SIDE_STYLES.right;
      return SIDE_STYLES.left;
    },
    [guests]
  );

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Auto-scroll only when the user is already near the bottom, so reading
  // back through history isn't interrupted by new messages.
  useEffect(() => {
    if (pinned) scrollToBottom();
  }, [entries, pinned, scrollToBottom]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinned(distance < 80);
  };

  return (
    <div className={`relative flex flex-col ${fill ? 'flex-1 min-h-0' : ''}`}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`feed-scroll flex-1 overflow-y-auto px-4 py-4 scroll-smooth bg-slate-900/50 backdrop-blur-sm ${
          fill ? '' : 'max-h-[55vh] min-h-[220px]'
        }`}
      >
        {entries.length === 0 ? (
          <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center gap-3 text-slate-500">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center">
              <Radio className="w-6 h-6 text-indigo-400/70" />
            </div>
            <p className="text-body-small italic max-w-[16rem]">
              The microphones are hot. Start the show to begin the discussion.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {entries.map((entry, i) => {
              const meta = metaFor(entry);
              const prev = entries[i - 1];
              const continuation =
                !!prev && prev.speaker === entry.speaker && prev.type === entry.type;
              const alignment =
                meta.side === 'right'
                  ? 'items-end'
                  : meta.side === 'center'
                  ? 'items-center'
                  : 'items-start';

              return (
                <div key={entry.id} className={`flex flex-col ${alignment} ${continuation ? 'mt-1' : 'mt-4'}`}>
                  {!continuation && (
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white ${meta.avatar}`}>
                        {entry.speaker[0]}
                      </span>
                      <span className={`text-[11px] font-bold uppercase tracking-wide ${meta.label}`}>
                        {entry.speaker}
                      </span>
                      <span className="text-[10px] text-slate-600 tabular-nums">
                        {fmtTime(entry.timestamp)}
                      </span>
                      {entry.isStreaming && (
                        <span className="flex items-center gap-0.5 ml-0.5">
                          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '120ms' }} />
                          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '240ms' }} />
                        </span>
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-2 shadow-lg border text-body-base whitespace-pre-wrap ${meta.bubble} ${
                      entry.isStreaming ? 'border-dashed animate-pulse-subtle' : ''
                    }`}
                  >
                    {entry.text}
                    {entry.isStreaming && <span className="animate-pulse ml-0.5">▌</span>}
                  </div>
                  {entry.laughed && !entry.isStreaming && (
                    <div className="self-center my-1 text-[10px] uppercase tracking-widest text-amber-400/70 flex items-center gap-1.5">
                      <span className="h-px w-6 bg-amber-400/20" />
                      😂 audience laughs
                      <span className="h-px w-6 bg-amber-400/20" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!pinned && entries.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setPinned(true);
            scrollToBottom();
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-semibold shadow-lg hover:bg-indigo-500 transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          Jump to latest
        </button>
      )}
    </div>
  );
};
