import { lazy } from 'react';

const CHUNK_LOAD_ERROR = /(?:failed to fetch dynamically imported module|loading chunk|importing a module script failed|error loading dynamically imported module)/i;

function storage() {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
}

/**
 * Recover once when an already-open browser references an obsolete deployed
 * route chunk. Real component errors are rethrown and remain visible to React.
 */
export function lazyWithRecovery(importer, routeKey) {
  const recoveryKey = `sea-route-recovery:${routeKey}`;
  return lazy(async () => {
    try {
      const loaded = await importer();
      storage()?.removeItem(recoveryKey);
      return loaded;
    } catch (error) {
      const canReload = typeof window !== 'undefined'
        && CHUNK_LOAD_ERROR.test(String(error?.message || error));
      const session = storage();
      if (canReload && session?.getItem(recoveryKey) !== 'attempted') {
        session?.setItem(recoveryKey, 'attempted');
        window.location.reload();
        return new Promise(() => {});
      }
      session?.removeItem(recoveryKey);
      throw error;
    }
  });
}
