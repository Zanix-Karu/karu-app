import { useTranslation } from 'react-i18next';
import { DISPLAY_CURRENCIES, useCurrency } from '../lib/currency';

/**
 * Secondary-currency picker in the header. XAF is the default and always the
 * price charged; EUR/GBP add a converted figure beside it for diaspora
 * customers.
 */
export function CurrencySwitcher() {
  const { t } = useTranslation();
  const { currency, setCurrency } = useCurrency();

  return (
    <label className="flex items-center">
      <span className="sr-only">{t('common.currency')}</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value as typeof currency)}
        className="rounded-full bg-transparent px-2 py-1 text-xs font-bold uppercase text-karu-cream/70 focus:outline-none focus:ring-2 focus:ring-karu-yellow/50"
        style={{ colorScheme: 'dark' }}
      >
        {DISPLAY_CURRENCIES.map((c) => (
          <option key={c} value={c} style={{ color: 'var(--ink)' }}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
