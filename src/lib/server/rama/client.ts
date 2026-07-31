/**
 * Rama REST JSON client — TypeScript talks only to Rama's built-in HTTP API.
 * No custom Clojure HTTP layer. No gRPC.
 *
 * Docs: https://redplanetlabs.com/docs/~/rest.html
 *
 * @lintignore Spike client module; production routes still use Postgres.
 */

export type AckLevel = 'ack' | 'appendAck' | 'none';

export interface RamaClientOptions {
  /** Conductor Cluster UI base, e.g. http://localhost:8888 — used once to discover supervisors */
  conductorUrl: string;
  /** Fully-qualified module name, e.g. mge.tf.rama.match-module/MatchModule */
  moduleName: string;
  /** Optional override: skip discovery and hit a supervisor directly */
  supervisorBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class RamaRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'RamaRestError';
  }
}

/**
 * Encode a JS number as a Rama JSON long (`#__L…`) when needed.
 * Plain JSON numbers are parsed as 32-bit ints by Rama.
 */
export function ramaLong(n: number): string {
  return `#__L${Math.trunc(n)}`;
}

function encodeModule(moduleName: string): string {
  return moduleName.replaceAll('/', '%2F');
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

export class RamaClient {
  readonly moduleName: string;
  private conductorUrl: string;
  private supervisorLocations: string[] | null = null;
  private preferredSupervisor: string | null;
  private fetchImpl: typeof fetch;

  constructor(opts: RamaClientOptions) {
    this.moduleName = opts.moduleName;
    this.conductorUrl = opts.conductorUrl.replace(/\/$/, '');
    this.preferredSupervisor = opts.supervisorBaseUrl?.replace(/\/$/, '') ?? null;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Discover supervisor hosts via Conductor 308 (or use configured override). */
  async ensureSupervisors(): Promise<string[]> {
    if (this.preferredSupervisor) {
      this.supervisorLocations = [this.preferredSupervisor];
      return this.supervisorLocations;
    }
    if (this.supervisorLocations?.length) return this.supervisorLocations;

    const probePath = `/rest/${encodeModule(this.moduleName)}/pstate/$$matches/selectOne`;
    const res = await this.fetchImpl(joinUrl(this.conductorUrl, probePath), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(['__rama_discovery_probe__']),
      redirect: 'manual',
    });

    const locationsHeader = res.headers.get('Supervisor-Locations');
    if (locationsHeader) {
      this.supervisorLocations = JSON.parse(locationsHeader) as string[];
      return this.supervisorLocations;
    }

    if (res.status === 308) {
      const loc = res.headers.get('Location');
      if (loc) {
        const u = new URL(loc);
        this.supervisorLocations = [`${u.protocol}//${u.host}`];
        return this.supervisorLocations;
      }
    }

    // Dev / single-node: Conductor may serve REST itself
    this.supervisorLocations = [this.conductorUrl];
    return this.supervisorLocations;
  }

  private async baseUrl(): Promise<string> {
    const locs = await this.ensureSupervisors();
    const pick = locs[Math.floor(Math.random() * locs.length)]!;
    return pick.includes('://') ? pick : `http://${pick}`;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = joinUrl(await this.baseUrl(), path);
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      redirect: 'follow',
    });

    const text = await res.text();
    if (!res.ok) {
      throw new RamaRestError(`Rama REST ${res.status} for ${path}`, res.status, text);
    }
    if (text.length === 0) return undefined as T;
    return JSON.parse(text) as T;
  }

  /**
   * Append to a depot. Default ackLevel is `ack` (wait for stream topologies).
   * Returns topology-name → ack-return map when ackLevel is `ack`.
   */
  async append(
    depotName: string,
    data: unknown,
    ackLevel: AckLevel = 'ack',
  ): Promise<Record<string, unknown>> {
    const path = `/rest/${encodeModule(this.moduleName)}/depot/${encodeURIComponent(depotName)}/append`;
    return this.post(path, { data, ackLevel });
  }

  /** PState select — returns every navigated value (JSON path navigators). */
  async select(pstateName: string, pathNavigators: unknown[]): Promise<unknown[]> {
    const path = `/rest/${encodeModule(this.moduleName)}/pstate/${encodeURIComponent(pstateName)}/select`;
    return this.post(path, pathNavigators);
  }

  /** PState selectOne — exactly one navigated value. */
  async selectOne(pstateName: string, pathNavigators: unknown[]): Promise<unknown> {
    const path = `/rest/${encodeModule(this.moduleName)}/pstate/${encodeURIComponent(pstateName)}/selectOne`;
    return this.post(path, pathNavigators);
  }

  /** Invoke a query topology with JSON argument list. */
  async invokeQuery(queryName: string, args: unknown[]): Promise<unknown> {
    const path = `/rest/${encodeModule(this.moduleName)}/query/${encodeURIComponent(queryName)}/invoke`;
    return this.post(path, args);
  }
}
