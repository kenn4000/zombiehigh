const ROUTE_BOOT_KEY = 'zombiegame-last-route';

export function shouldBootGameRoute(currentUrl: string): boolean {
  const url = new URL(currentUrl, 'http://localhost');
  const isGameRoute = /^\/game\//.test(url.pathname);

  if (!isGameRoute) {
    return false;
  }

  const playerId = url.searchParams.get('playerId');
  const gameId = url.searchParams.get('gameId') || url.pathname.match(/\/game\/([^/?#]+)/)?.[1] || null;

  return Boolean(playerId && gameId);
}

export function shouldForceRouteReload(currentUrl: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined = globalThis.sessionStorage): boolean {
  if (!storage) {
    return false;
  }

  const url = new URL(currentUrl, 'http://localhost');
  const isGameRoute = /^\/game\//.test(url.pathname);

  if (!isGameRoute) {
    storage.removeItem(ROUTE_BOOT_KEY);
    return false;
  }

  const hasFreshMarker = url.searchParams.get('fresh') === '1';
  const nextRoute = `${url.pathname}${url.search}${url.hash}`;
  const lastRoute = storage.getItem(ROUTE_BOOT_KEY);

  if (!hasFreshMarker) {
    storage.setItem(ROUTE_BOOT_KEY, nextRoute);
    return true;
  }

  if (lastRoute === nextRoute) {
    return false;
  }

  storage.setItem(ROUTE_BOOT_KEY, nextRoute);
  return false;
}
