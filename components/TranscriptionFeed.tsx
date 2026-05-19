
import React, { useEffect, useRef } from 'react';
import { TranscriptionEntry } from '../types';

interface TranscriptionFeedProps {
  entries: TranscriptionEntry[];
  // When true, the feed fills its flex parent instead of a fixed 300px cap
  // (used by the mobile layout where the transcript is the primary surface).
  fill?: boolean;
}

export const TranscriptionFeed: React.FC<TranscriptionFeedProps> = ({ entries, fill = false }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto space-y-4 p-4 scroll-smooth border-t border-slate-800 bg-slate-900/50 backdrop-blur-sm"
      style={fill ? undefined : { maxHeight: '300px' }}
    >
      {entries.length === 0 ? (
        <div className="text-center text-body-small italic mt-8">
          The microphones are hot. Start the show to begin the discussion.
        </div>
      ) : (
        entries.map((entry) => (
          <div 
            key={entry.id} 
            className={`flex flex-col ${entry.type === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className={entry.type === 'user' ? 'text-transcript-speaker-user mb-1 flex items-center gap-2' : 'text-transcript-speaker-ai mb-1 flex items-center gap-2'}>
              {entry.speaker.toUpperCase()}
              {entry.isStreaming && (
                <span className="inline-flex items-center">
                  <span className="animate-pulse text-xs">●</span>
                  <span className="text-body-tiny ml-1">speaking...</span>
                </span>
              )}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-lg ${
              entry.type === 'user' 
                ? 'bg-indigo-600/20 text-indigo-100 border border-indigo-500/30' 
                : 'bg-slate-800 text-slate-200 border border-slate-700'
            } ${entry.isStreaming ? 'border-dashed' : ''}`}>
              {entry.text}
              {entry.isStreaming && <span className="animate-pulse ml-1">▌</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
