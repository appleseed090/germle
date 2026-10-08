import { handleApiRequest } from './api';
import type { D1Database } from './d1';
import { createD1ResultsStore } from './d1-results-store';

/** The bindings `wrangler.jsonc` declares. */
interface Env {
  /** The community scores database. Absent in preview deployments, which must not write to it. */
  readonly DB?: D1Database;
  /** The static site in `dist/`. */
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

/**
 * The site's Worker. `assets.run_worker_first` sends only `/api/*` here first; any other request
 * reaches it only when no static asset matches, and is handed back to the assets so that it gets
 * exactly the response the site gave before it had a Worker.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const store = env.DB === undefined ? undefined : createD1ResultsStore(env.DB);
    return handleApiRequest(request, store, new Date());
  },
};
