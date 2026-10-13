import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatTimeAgo = (timestamp: number) => {
  const now = Date.now();
  const diffInMs = now - timestamp * 1000; // Convert to milliseconds
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));

  if (diffInHours > 24) {
    const days = Math.floor(diffInHours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (diffInHours >= 1) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  } else {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  }
};

// Formatted string like "$3.1T" or "$900B"
export function formatMarketCapValue(marketCap: number): string {
  if (!marketCap || marketCap === 0) return 'N/A';

  if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}T`; // Trillions
  if (marketCap >= 1e3) return `$${(marketCap / 1e3).toFixed(2)}B`; // Billions
  return `$${marketCap.toFixed(2)}M`; // Millions
}

export const getDateRange = (days: number) => {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - days);
  return {
    to: toDate.toISOString().split('T')[0],
    from: fromDate.toISOString().split('T')[0],
  };
};

// Check for required article fields
export const validateArticle = (article: RawNewsArticle) =>
    article.headline && article.summary && article.url && article.datetime;


export const formatArticle = (
    article: RawNewsArticle,
    isCompanyNews: boolean,
    symbol?: string,
    index: number = 0
) => ({
  id: isCompanyNews ? Date.now() + Math.random() : article.id + index,
  headline: article.headline!.trim(),
  summary:
      article.summary!.trim().substring(0, isCompanyNews ? 200 : 150) + '...',
  source: article.source || (isCompanyNews ? 'Company News' : 'Market News'),
  url: article.url!,
  datetime: article.datetime!,
  image: article.image || '',
  category: isCompanyNews ? 'company' : article.category || 'general',
  related: isCompanyNews ? symbol! : article.related || '',
});

// Rounded to cents first, so a tiny negative move shows as 0.00, never "-0.00"
const roundToCents = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
};

export const formatChangePercent = (changePercent?: number) => {
  if (changePercent === undefined || changePercent === null || !Number.isFinite(changePercent)) return '';
  const value = roundToCents(changePercent);
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
};

// Green for a gain and red for a loss, judged on the rounded figure so the color matches the text.
// The light theme uses green 800 and red 700, which pass the 4.5:1 contrast rule on white, light gray and the
// highlighted rows of light panels.
export const getChangeColorClass = (changePercent?: number) => {
  const value = changePercent === undefined || changePercent === null || !Number.isFinite(changePercent) ? 0 : roundToCents(changePercent);
  if (!value) return 'text-gray-400';
  return value > 0 ? 'text-green-800 dark:text-green-500' : 'text-red-700 dark:text-red-500';
};

export const formatPrice = (price: number) => formatCurrency(price, 'USD');

// Number formats are slow to create, so each currency's is made once
const CURRENCY_FORMATS = new Map<string, Intl.NumberFormat>();

// A price in the stock's own currency (dollars when the currency code is unknown)
export const formatCurrency = (value: number, currency = 'USD') => {
  let format = CURRENCY_FORMATS.get(currency);
  if (!format) {
    try {
      format = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      format = CURRENCY_FORMATS.get('USD') ?? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    CURRENCY_FORMATS.set(currency, format);
  }
  return format.format(value);
};

// A price change with its sign, like +1.23 or -0.45 (and 0.00 rather than -0.00)
export const formatSignedNumber = (value: number) => {
  const rounded = roundToCents(value);
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`;
};

// A function so a long-running server gets today's date, not the date it started
export const formatDateToday = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});
