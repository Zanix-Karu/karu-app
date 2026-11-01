import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Join class names, letting later Tailwind classes win (as in NourishwithB). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
