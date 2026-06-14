/**
 * Provider factory pattern and resilient wrapper for KiranaAI.
 *
 * The ProviderFactory<T> base defines how to create primary and fallback
 * provider instances. The ResilientProvider<T> wraps both and automatically
 * switches to the fallback when the primary is unhealthy.
 */

// --- Provider Factory Interface ---

/**
 * Factory interface for creating provider instances.
 * Each provider type (preference store, session store, etc.) implements this.
 */
export interface ProviderFactory<T> {
  /** Create the primary (AWS) provider instance. */
  createPrimary(): T;
  /** Create the fallback (local) provider instance. */
  createFallback(): T;
  /** Create the best available provider (primary if healthy, fallback otherwise). */
  create(): Promise<T>;
}

// --- Resilient Provider Wrapper ---

export interface ResilientProviderOptions {
  /** How often (ms) to re-check the primary provider after failover. Default: 30000. */
  recheckIntervalMs?: number;
  /** Timeout (ms) for health check calls. Default: 5000. */
  healthCheckTimeoutMs?: number;
}

/**
 * Wraps a primary and fallback provider, switching transparently based on health.
 *
 * On each call to getActiveProvider():
 * - If the primary is healthy, return it.
 * - If the primary is unhealthy (health check fails or throws), return fallback.
 *
 * This enables seamless degradation from AWS services to local implementations.
 */
export class ResilientProvider<T> {
  private lastHealthCheck: number = 0;
  private primaryHealthy: boolean = true;
  private readonly recheckIntervalMs: number;
  private readonly healthCheckTimeoutMs: number;

  constructor(
    private readonly primary: T,
    private readonly fallback: T,
    private readonly healthCheck: () => Promise<boolean>,
    options: ResilientProviderOptions = {}
  ) {
    this.recheckIntervalMs = options.recheckIntervalMs ?? 30_000;
    this.healthCheckTimeoutMs = options.healthCheckTimeoutMs ?? 5_000;
  }

  /**
   * Returns the active provider — primary if healthy, fallback otherwise.
   * Caches health status to avoid excessive health-check calls.
   */
  async getActiveProvider(): Promise<T> {
    const now = Date.now();

    // If we recently checked and primary was healthy, skip re-checking
    if (this.primaryHealthy && now - this.lastHealthCheck < this.recheckIntervalMs) {
      return this.primary;
    }

    try {
      const healthy = await this.withTimeout(
        this.healthCheck(),
        this.healthCheckTimeoutMs
      );
      this.primaryHealthy = healthy;
      this.lastHealthCheck = now;

      if (healthy) {
        return this.primary;
      }
    } catch {
      this.primaryHealthy = false;
      this.lastHealthCheck = now;
    }

    return this.fallback;
  }

  /** Returns whether the primary provider is currently considered healthy. */
  isPrimaryHealthy(): boolean {
    return this.primaryHealthy;
  }

  /** Force a health re-check on the next getActiveProvider() call. */
  invalidateHealthCache(): void {
    this.lastHealthCheck = 0;
  }

  /** Get the primary provider directly (bypass health check). */
  getPrimary(): T {
    return this.primary;
  }

  /** Get the fallback provider directly. */
  getFallback(): T {
    return this.fallback;
  }

  private withTimeout<R>(promise: Promise<R>, timeoutMs: number): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Health check timed out after ${timeoutMs}ms`)),
        timeoutMs
      );

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
