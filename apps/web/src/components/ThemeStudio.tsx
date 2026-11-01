import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, Moon, Palette, Search, Sun, X } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card } from '../ds';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import {
  THEMES,
  activeThemeId,
  onThemeChange,
  previewTheme,
  setAppearance,
  setPreview,
  themeById,
  themeVars,
  type Appearance,
  type ThemeEntry,
} from '../lib/theme';
import { useToast } from './Toast';
import { ErrorNote } from '../ui';

/**
 * Admin → Appearance. Every Karu and Monkeytype palette, each drawn as a
 * small Karu screen in its own colours. Clicking one previews it across the
 * whole app in this tab only; "Use for light/dark" stages it, and Save
 * applies the pair to every visitor.
 */
type Filter = 'all' | 'light' | 'dark' | 'karu';

const VARS = new Map(THEMES.map((t) => [t.id, themeVars(t)]));

export function useAppearance() {
  return useQuery({
    queryKey: ['appearance'],
    queryFn: () => api<Appearance>('/settings/appearance'),
    staleTime: 5 * 60_000,
  });
}

export function ThemeStudio() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: saved } = useAppearance();
  const [draft, setDraft] = useState<Appearance | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const previewing = useSyncExternalStore(onThemeChange, previewTheme, () => null);
  useSyncExternalStore(onThemeChange, activeThemeId, () => 'karu');

  const current = draft ?? saved ?? { light: 'karu', dark: 'karu_night' };
  const dirty = !!saved && !!draft && (draft.light !== saved.light || draft.dark !== saved.dark);

  const save = useMutation({
    mutationFn: (a: Appearance) => api<Appearance>('/settings/appearance', { method: 'PATCH', body: JSON.stringify(a) }),
    onSuccess: (a) => {
      qc.setQueryData(['appearance'], a);
      setDraft(null);
      setPreview(null);
      setAppearance(a);
      toast(t('admin.appearance.saved'), 'success');
    },
  });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '_');
    return THEMES.filter((th) => {
      if (q && !th.id.includes(q)) return false;
      const dark = VARS.get(th.id)!.dark;
      if (filter === 'light') return !dark;
      if (filter === 'dark') return dark;
      if (filter === 'karu') return th.source === 'karu';
      return true;
    });
  }, [query, filter]);

  const stage = (th: ThemeEntry) => {
    const slot = VARS.get(th.id)!.dark ? 'dark' : 'light';
    setDraft({ ...current, [slot]: th.id });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-text">
            <Palette className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">{t('admin.appearance.title')}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{t('admin.appearance.sub', { count: THEMES.length })}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(dirty || previewing) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft(null);
                setPreview(null);
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              {t('admin.appearance.discard')}
            </Button>
          )}
          <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => draft && save.mutate(draft)}>
            {t('admin.appearance.save')}
          </Button>
        </div>
      </header>

      {save.isError && <ErrorNote>{(save.error as Error).message}</ErrorNote>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Slot icon={<Sun className="h-4 w-4" aria-hidden="true" />} label={t('admin.appearance.lightSlot')} id={current.light} changed={!!saved && current.light !== saved.light} />
        <Slot icon={<Moon className="h-4 w-4" aria-hidden="true" />} label={t('admin.appearance.darkSlot')} id={current.dark} changed={!!saved && current.dark !== saved.dark} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">{t('admin.appearance.search')}</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.appearance.search')}
            className="flex min-h-11 w-full rounded-full border border-slate-300 bg-surface py-2.5 pl-10 pr-4 text-base text-slate-900 placeholder:text-slate-400 transition-colors focus-visible:border-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('admin.appearance.filter')}>
          {(['all', 'light', 'dark', 'karu'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'min-h-11 rounded-full px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text',
                filter === f ? 'bg-slate-900 text-surface' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {t(`admin.appearance.filters.${f}`)}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">{t('admin.appearance.count', { count: shown.length })}</span>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4" role="list">
        {shown.map((th) => {
          const isPreview = previewing === th.id;
          const inUse = th.id === current.light || th.id === current.dark;
          return (
            <li key={th.id}>
              <div
                className={cn(
                  'group overflow-hidden rounded-2xl border bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-250 ease-[var(--ease-smooth-out)] hover:-translate-y-[3px] hover:shadow-lg',
                  isPreview ? 'border-brand-text ring-2 ring-brand' : 'border-slate-200',
                )}
              >
                <button
                  type="button"
                  onClick={() => setPreview(isPreview ? null : th.id)}
                  aria-pressed={isPreview}
                  aria-label={t('admin.appearance.previewOne', { name: th.name })}
                  className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-text"
                >
                  <ThemeSample theme={th} />
                </button>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{th.name}</p>
                    <p className="text-xs text-slate-500">
                      {VARS.get(th.id)!.dark ? t('admin.appearance.isDark') : t('admin.appearance.isLight')}
                      {th.source === 'karu' && ` · ${t('admin.appearance.karuOwn')}`}
                    </p>
                  </div>
                  {inUse ? (
                    <Badge variant="success">{t('admin.appearance.chosen')}</Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => stage(th)}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {VARS.get(th.id)!.dark ? t('admin.appearance.useDark') : t('admin.appearance.useLight')}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Slot({ icon, label, id, changed }: { icon: React.ReactNode; label: string; id: string; changed: boolean }) {
  const { t } = useTranslation();
  const theme = themeById(id);
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className="w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200">
        {theme && <ThemeSample theme={theme} small />}
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {icon}
          {label}
        </p>
        <p className="mt-1 truncate font-display text-lg font-bold text-slate-900">{theme?.name ?? id}</p>
        {changed && <Badge variant="warning" className="label-in mt-1">{t('admin.appearance.unsaved')}</Badge>}
      </div>
    </Card>
  );
}

/** A miniature Karu screen painted in the theme's own tokens. */
export function ThemeSample({ theme, small = false }: { theme: ThemeEntry; small?: boolean }) {
  const { tokens: c } = VARS.get(theme.id) ?? themeVars(theme);
  return (
    <div aria-hidden="true" className={cn('relative', small ? 'h-16 p-2' : 'h-28 p-3')} style={{ background: c.page }}>
      <div className="flex items-center justify-between">
        <span className="font-display text-[10px] font-extrabold tracking-[0.18em]" style={{ color: c['slate-900'] }}>
          KARU
        </span>
        <span className="h-1.5 w-8 rounded-full" style={{ background: c['slate-300'] }} />
      </div>
      <div
        className={cn('mt-2 rounded-lg', small ? 'p-1.5' : 'p-2.5')}
        style={{ background: c.surface, boxShadow: `inset 0 0 0 1px ${c['slate-200']}` }}
      >
        <span className="block h-1.5 w-3/4 rounded-full" style={{ background: c['slate-900'] }} />
        <span className="mt-1 block h-1.5 w-1/2 rounded-full" style={{ background: c['slate-400'] }} />
        {!small && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: c.brand, color: c['on-brand'] }}>
            <Eye className="h-2.5 w-2.5" />
            Book
          </span>
        )}
      </div>
    </div>
  );
}

/** Floating reminder while an admin is previewing a palette in this tab. */
export function PreviewBar() {
  const { t } = useTranslation();
  const id = useSyncExternalStore(onThemeChange, previewTheme, () => null);
  const theme = id ? themeById(id) : undefined;
  if (!theme) return null;
  return (
    <div
      role="status"
      className="label-in fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-full border border-slate-200 bg-surface py-1.5 pl-4 pr-1.5 text-sm text-slate-700 shadow-lg"
    >
      <Eye className="h-4 w-4 text-brand-text" aria-hidden="true" />
      <span>{t('admin.appearance.previewing', { name: theme.name })}</span>
      <button
        type="button"
        onClick={() => setPreview(null)}
        className="inline-flex min-h-9 items-center gap-1 rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        {t('admin.appearance.stop')}
      </button>
    </div>
  );
}
