import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingMessage } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { View } from '../lib/roles';
import { Button, Card } from '../ds';
import { ErrorNote } from '../ui';

/** How a sender is labelled to someone who isn't them. */
const ROLE_LABEL: Record<string, string> = {
  customer: 'Customer',
  vendor: 'Provider',
  admin: 'Karu Support',
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The booking's chat thread — the in-app channel between customer and
 * provider, with Karu in the room. Polls rather than subscribes: a rental
 * conversation is minutes-scale, not milliseconds, and polling works in
 * production with zero extra infrastructure.
 *
 * Contact details are removed server-side before a message is stored, so the
 * privacy note here describes what actually happens rather than asking nicely.
 */
export function BookingChat({ bookingId, view }: { bookingId: string; view: View }) {
  const { session } = useAuth();
  const myId = session?.user.id;
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ['booking-messages', bookingId],
    queryFn: () => api<BookingMessage[]>(`/bookings/${bookingId}/messages`),
    refetchInterval: 4000,
    // The app default pauses polling in unfocused windows and disables
    // focus refetch — a chat left open in a second window would freeze
    // until reload. Keep the thread live regardless of focus.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const send = useMutation({
    mutationFn: (message: string) =>
      api<BookingMessage>(`/bookings/${bookingId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['booking-messages', bookingId] });
      void qc.invalidateQueries({ queryKey: ['admin-conversations'] });
    },
  });

  // Stick to the bottom as new messages arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const lastSentRedacted = send.data?.redacted;

  return (
    <Card style={{ marginTop: 16 }}>
      <h2 className="font-display text-lg font-bold">Messages</h2>
      <p className="mt-1 text-sm text-karu-mute">
        {view === 'admin'
          ? 'You are posting as Karu Support — both parties see your messages.'
          : 'Chat with the other party here. Karu can see this conversation, and phone numbers or email addresses are removed automatically — all contact runs through Karu.'}
      </p>

      <div
        ref={scrollRef}
        className="mt-3 max-h-80 space-y-3 overflow-y-auto rounded-lg bg-karu-ink/5 p-3"
      >
        {isLoading && <p className="text-sm text-karu-mute">Loading conversation…</p>}
        {!isLoading && (messages?.length ?? 0) === 0 && (
          <p className="text-sm text-karu-mute">No messages yet — say hello.</p>
        )}
        {messages?.map((m) => {
          const mine = m.sender_id === myId;
          const support = m.sender_role === 'admin';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  mine
                    ? 'bg-karu-ink text-karu-cream'
                    : support
                      ? 'border border-karu-gold/60 bg-karu-yellow/20'
                      : 'bg-white shadow-sm'
                }`}
              >
                <p className={`text-[11px] font-semibold ${mine ? 'text-karu-cream/70' : 'text-karu-mute'}`}>
                  {mine ? 'You' : (ROLE_LABEL[m.sender_role] ?? m.sender_role)} · {timeOf(m.created_at)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{m.body}</p>
                {m.redacted && (
                  <p className={`mt-1 text-[11px] italic ${mine ? 'text-karu-cream/70' : 'text-karu-mute'}`}>
                    Contact details were removed from this message.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (text && !send.isPending) send.mutate(text);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Write a message…"
          className="w-full rounded-lg border border-karu-ink/15 px-3 py-2 text-sm focus:border-karu-gold focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const text = draft.trim();
              if (text && !send.isPending) send.mutate(text);
            }
          }}
        />
        <Button type="submit" disabled={!draft.trim() || send.isPending}>
          {send.isPending ? 'Sending…' : 'Send'}
        </Button>
      </form>
      {lastSentRedacted && (
        <p className="mt-2 text-xs font-semibold text-karu-terracotta">
          Your message was delivered, but contact details were removed — Karu keeps all
          communication on the platform.
        </p>
      )}
      {send.isError && (
        <div className="mt-2">
          <ErrorNote>{(send.error as Error).message}</ErrorNote>
        </div>
      )}
    </Card>
  );
}
