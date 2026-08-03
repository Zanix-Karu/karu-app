import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { convertFromXaf, type DisplayCurrency } from '@karu/shared';
import i18n from '../i18n';

/**
 * Secondary-currency display for the diaspora.
 *
 * The MVP plan's demand thesis is people abroad booking for family at home,
 * so prices need to be readable in the currency they think in. XAF is always
 * the price actually charged — the converted figure is a courtesy shown
 * beside it, never instead of it.
 *
 * EUR is exact: the CFA franc BEAC is pegged at a fixed 655.957. GBP floats,
 * so it is labelled approximate and its rate comes from configuration
 * (VITE_XAF_PER_GBP) rather than being invented in the code.
 */

const STORAGE_KEY = 'karu.currency';

interface CurrencyState {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  /** Formats XAF, appending the converted value when one is selected. */
  price: (amountXaf: number) => string;
  /** Just the secondary figure, or null when showing XAF only. */
  secondary: (amountXaf: number) => string | null;
}

const CurrencyContext = createContext<CurrencyState | null>(null);

const GBP_RATE = Number(import.meta.env.VITE_XAF_PER_GBP) || undefined;

function readStored(): DisplayCurrency {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'EUR' || v === 'GBP' ? v : 'XAF';
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>(readStored);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, currency);
  }, [currency]);

  const locale = () => (i18n.resolvedLanguage === 'fr' ? 'fr-FR' : 'en-GB');

  const secondary = (amountXaf: number): string | null => {
    if (currency === 'XAF') return null;
    const { amount, approximate } = convertFromXaf(amountXaf, currency, GBP_RATE);
    const formatted = new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
    // '≈' is doing real work: GBP is a floating rate, not a promise.
    return approximate ? `≈ ${formatted}` : formatted;
  };

  const price = (amountXaf: number): string => {
    const xaf = `${amountXaf.toLocaleString('fr-FR')} XAF`;
    const other = secondary(amountXaf);
    return other ? `${xaf} · ${other}` : xaf;
  };

  return (
    <CurrencyContext.Provider
      value={{ currency, setCurrency: setCurrencyState, price, secondary }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyState {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used inside CurrencyProvider');
  return ctx;
}

export const DISPLAY_CURRENCIES: DisplayCurrency[] = ['XAF', 'EUR', 'GBP'];
