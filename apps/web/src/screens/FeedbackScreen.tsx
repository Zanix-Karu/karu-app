import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { prettyDate } from '../lib/format';
import { Button, Card, EmptyState, ErrorNote, Field, Select, Spinner } from '../ui';

type Category = 'bug' | 'idea' | 'other';
type Status = 'new' | 'triaging' | 'resolved';

interface Feedback {
  id: string;
  category: Category;
  message: string;
  status: Status;
  image_paths: string[];
  created_at: string;
}

interface SignedUpload {
  path: string;
  signedUrl: string;
}

const MAX_IMAGES = 5;
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'web';

const textareaClass =
  'w-full rounded-md border border-karu-ink/15 bg-white px-3 py-2 text-sm text-karu-ink ' +
  'placeholder:text-karu-mute focus:border-karu-gold focus:outline-none focus:ring-2 focus:ring-karu-gold/30';

export function FeedbackScreen() {
  const { t } = useTranslation();
  const location = useLocation();
  const fileInput = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const mine = useQuery({
    queryKey: ['feedback-mine'],
    queryFn: () => api<Feedback[]>('/feedback/mine'),
  });

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith('image/'));
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  /** Upload each screenshot to its signed URL, return the stored paths. */
  const uploadImages = async (): Promise<string[]> => {
    const paths: string[] = [];
    for (const file of files) {
      const up = await api<SignedUpload>('/feedback/uploads', {
        method: 'POST',
        body: JSON.stringify({ file_name: file.name }),
      });
      const put = await fetch(up.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error(t('feedback.uploadFailed'));
      paths.push(up.path);
    }
    return paths;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const image_paths = files.length ? await uploadImages() : [];
      await api('/feedback', {
        method: 'POST',
        body: JSON.stringify({
          category,
          message: message.trim(),
          page: location.pathname,
          app_version: APP_VERSION,
          image_paths,
        }),
      });
      setSent(true);
      setMessage('');
      setFiles([]);
      setCategory('bug');
      await mine.refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-bold">{t('feedback.title')}</h1>
      <p className="mt-1 text-sm text-karu-mute">{t('feedback.subtitle')}</p>

      <Card className="mt-6">
        {sent && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {t('feedback.thanks')}
          </div>
        )}
        <form onSubmit={submit} className="grid gap-4">
          <Field label={t('feedback.category')}>
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              <option value="bug">{t('feedback.categories.bug')}</option>
              <option value="idea">{t('feedback.categories.idea')}</option>
              <option value="other">{t('feedback.categories.other')}</option>
            </Select>
          </Field>

          <Field label={t('feedback.message')}>
            <textarea
              className={textareaClass}
              rows={5}
              maxLength={4000}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('feedback.messagePlaceholder')}
            />
          </Field>

          <Field label={t('feedback.screenshots')}>
            <div className="grid gap-3">
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative">
                      <img
                        src={URL.createObjectURL(f)}
                        alt=""
                        className="h-20 w-20 rounded-md object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        aria-label={t('feedback.removeImage')}
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-karu-ink text-xs text-karu-cream"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {files.length < MAX_IMAGES && (
                <div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInput.current?.click()}
                  >
                    {t('feedback.addImage')}
                  </Button>
                  <span className="ml-2 text-xs text-karu-mute">
                    {t('feedback.imageHint', { count: MAX_IMAGES })}
                  </span>
                </div>
              )}
            </div>
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div>
            <Button type="submit" disabled={busy || !message.trim()}>
              {busy ? t('feedback.sending') : t('feedback.send')}
            </Button>
          </div>
        </form>
      </Card>

      <h2 className="mt-10 font-display text-xl font-bold">{t('feedback.yourReports')}</h2>
      {mine.isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : !mine.data || mine.data.length === 0 ? (
        <EmptyState title={t('feedback.emptyTitle')} hint={t('feedback.emptyHint')} />
      ) : (
        <div className="mt-4 grid gap-3">
          {mine.data.map((f) => (
            <Card key={f.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-karu-mute">
                    {t(`feedback.categories.${f.category}`)} · {prettyDate(f.created_at)}
                  </p>
                  <p className="mt-1 text-sm text-karu-ink">{f.message}</p>
                </div>
                <span className="whitespace-nowrap rounded-full bg-karu-ink/5 px-3 py-1 text-xs font-semibold text-karu-brown">
                  {t(`feedback.statuses.${f.status}`)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
