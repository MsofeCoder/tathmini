import { db, type OfflineBundle } from './db';

/**
 * Read/write the offline route snapshot. Written by the route list every
 * time it loads with a connection; read by /offline when there is none.
 */

export type OfflineBundleInput = Omit<OfflineBundle, 'key' | 'cachedAt'>;

export async function saveOfflineBundle(bundle: OfflineBundleInput): Promise<void> {
  await db.cache.put({ ...bundle, key: 'route', cachedAt: Date.now() });
}

export async function loadOfflineBundle(): Promise<OfflineBundle | undefined> {
  return db.cache.get('route');
}
