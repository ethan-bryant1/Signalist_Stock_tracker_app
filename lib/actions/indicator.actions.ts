'use server';

import { headers } from 'next/headers';
import { getSession } from '@/lib/better-auth/auth';
import { getIndicators } from '@/lib/indicator-data';
import type { IndicatorsPayload } from '@/lib/indicators';

// The workspace's Economic indicators widget. Signed-in users only, so strangers can't spend the FRED key's budget.
// The answers come from the same server cache as the Economy page, so the widget adds no FRED calls when both are used.
export async function getIndicatorsForWidget(): Promise<IndicatorsPayload | null> {
  try {
    const session = await getSession(await headers());
    if (!session?.user) return null;
  } catch (e) {
    console.error('Error checking the session:', e);
    return null;
  }
  return getIndicators();
}
