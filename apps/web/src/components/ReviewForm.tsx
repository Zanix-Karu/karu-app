import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Review } from '@karu/shared';
import { api } from '../lib/api';
import { Button, Card, ErrorNote } from '../ui';

/** Clickable 1–5 stars. */
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="text-2xl leading-none transition"
          style={{ color: n <= shown ? 'var(--rating)' : 'var(--gray-300)' }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/**
 * Leave a review on a completed booking. Which side is being reviewed is
 * decided server-side from the booking, so this form never sends it.
 */
export function ReviewForm({
  bookingId,
  prompt,
  onDone,
}: {
  bookingId: string;
  prompt: string;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api<Review>(`/bookings/${bookingId}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-reviews'] });
      void qc.invalidateQueries({ queryKey: ['vendors-public'] });
      onDone?.();
    },
  });

  if (submit.isSuccess) {
    return (
      <p className="text-sm font-semibold text-green-700">Thanks — your review is published ✓</p>
    );
  }

  return (
    <Card className="mt-3 border border-karu-ink/10 p-4">
      <p className="text-sm font-semibold">{prompt}</p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (rating > 0) submit.mutate();
        }}
      >
        <StarPicker value={rating} onChange={setRating} />
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="How did it go? (optional)"
          className="w-full rounded-lg border border-karu-ink/15 px-3 py-2 text-sm focus:border-karu-gold focus:outline-none"
        />
        {submit.isError && <ErrorNote>{(submit.error as Error).message}</ErrorNote>}
        <Button type="submit" disabled={rating === 0 || submit.isPending}>
          {submit.isPending ? 'Publishing…' : 'Publish review'}
        </Button>
      </form>
    </Card>
  );
}
