import { BadRequestException } from '@nestjs/common';

/**
 * Date-window rules shared by browse, availability and (later) booking
 * creation. All rental windows are inclusive day ranges of ISO dates
 * (YYYY-MM-DD): a same-day pick-up/return is one rental day.
 */

/** Throws 400 unless from/to are parseable and from <= to. */
export function assertValidWindow(from: string, to: string): void {
  const f = Date.parse(from);
  const t = Date.parse(to);
  if (Number.isNaN(f) || Number.isNaN(t)) {
    throw new BadRequestException('Invalid date');
  }
  if (t < f) {
    throw new BadRequestException('to must be on or after from');
  }
}

/** Inclusive-range overlap: [aStart, aEnd] intersects [bStart, bEnd]. */
export function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}
