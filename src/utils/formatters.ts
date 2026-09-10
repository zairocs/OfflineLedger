// OfflineLedger — Helper formatters & validators
import { palette } from '../theme/colors';

/** Extracts up to 2 initials from a full name */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Deterministic avatar background color based on name hash (Grayscale Palette) */
const AVATAR_COLORS = [
  '#222222', // charcoal
  '#333333', // dark gray
  '#4D4D4D', // slate gray
  '#666666', // mid gray
  '#1A1A1A', // onyx
  '#555555', // granite
  '#3A3A3A', // graphite
  '#2A2A2A', // jet
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(name.length - 1 - i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Format a currency amount as a readable string */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Compact currency formatter for list items and badges.
 * Converts numbers into compact K/M/B units with points handled cleanly:
 * - 950 -> "950"
 * - 1,500 -> "1.5K"
 * - 100,000 -> "100K"
 * - 1,250,000 -> "1.25M"
 * - 1,000,000,000 -> "1B"
 */
export function formatCompactCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absAmount < 1000) {
    return `${sign}${absAmount.toLocaleString('en-PK', { maximumFractionDigits: 1 })}`;
  }

  const lookup = [
    { value: 1e12, symbol: 'T' },
    { value: 1e9, symbol: 'B' },
    { value: 1e6, symbol: 'M' },
    { value: 1e3, symbol: 'K' },
  ];

  const item = lookup.find(l => absAmount >= l.value);
  if (!item) return `${sign}${absAmount}`;

  const formatted = (absAmount / item.value)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');

  return `${sign}${formatted}${item.symbol}`;
}

/** Format a Date as "Jan 15, 2025" */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Format a Date as "02:45 PM" */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Format a Date with Day, Date, and Time, e.g. "Monday, Jan 15, 2025 at 02:45 PM" */
export function formatDateTimeDay(date: Date | number | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'number' ? new Date(date) : date;
  const dayName = d.toLocaleDateString('en-PK', { weekday: 'long' });
  const formattedDate = d.toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = d.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${dayName}, ${formattedDate} at ${formattedTime}`;
}

/** Auto-format Pakistani phone number (e.g. 03xx-xxxxxxx) */
export function formatPhoneInput(text: string): string {
  const digits = text.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4, 11)}`;
}

/** Validate Pakistani phone number format */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  // Valid Pakistani phone numbers: 11 digits starting with 03 (e.g. 03xx-xxxxxxx) or 12 digits starting with 923
  return /^03\d{9}$/.test(digits) || /^923\d{9}$/.test(digits);
}

/** Auto-format CNIC number (e.g. 3330333333333 -> 33303-3333333-3) */
export function formatCnicInput(text: string): string {
  const digits = text.replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
}

/** Validate CNIC number format (13 digits / 55555-7777777-1) */
export function isValidCnic(cnic: string): boolean {
  if (!cnic.trim()) return true; // CNIC is optional
  const digits = cnic.replace(/\D/g, '');
  return digits.length === 13;
}
