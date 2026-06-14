import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResilientProvider } from './factory.js';

describe('ResilientProvider', () => {
  const primary = { name: 'primary' };
  const fallback = { name: 'fallback' };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns primary when health check passes', async () => {
    const healthCheck = vi.fn().mockResolvedValue(true);
    const provider = new ResilientProvider(primary, fallback, healthCheck);

    const result = await provider.getActiveProvider();

    expect(result).toBe(primary);
    expect(healthCheck).toHaveBeenCalledOnce();
  });

  it('returns fallback when health check returns false', async () => {
    const healthCheck = vi.fn().mockResolvedValue(false);
    const provider = new ResilientProvider(primary, fallback, healthCheck);

    const result = await provider.getActiveProvider();

    expect(result).toBe(fallback);
  });

  it('returns fallback when health check throws', async () => {
    const healthCheck = vi.fn().mockRejectedValue(new Error('connection refused'));
    const provider = new ResilientProvider(primary, fallback, healthCheck);

    const result = await provider.getActiveProvider();

    expect(result).toBe(fallback);
  });

  it('returns fallback when health check times out', async () => {
    const healthCheck = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 10_000))
    );
    const provider = new ResilientProvider(primary, fallback, healthCheck, {
      healthCheckTimeoutMs: 50,
    });

    const result = await provider.getActiveProvider();

    expect(result).toBe(fallback);
  });

  it('caches health status and skips re-check within interval', async () => {
    const healthCheck = vi.fn().mockResolvedValue(true);
    const provider = new ResilientProvider(primary, fallback, healthCheck, {
      recheckIntervalMs: 60_000,
    });

    await provider.getActiveProvider();
    await provider.getActiveProvider();
    await provider.getActiveProvider();

    expect(healthCheck).toHaveBeenCalledOnce();
  });

  it('re-checks after cache invalidation', async () => {
    const healthCheck = vi.fn().mockResolvedValue(true);
    const provider = new ResilientProvider(primary, fallback, healthCheck, {
      recheckIntervalMs: 60_000,
    });

    await provider.getActiveProvider();
    provider.invalidateHealthCache();
    await provider.getActiveProvider();

    expect(healthCheck).toHaveBeenCalledTimes(2);
  });

  it('reports primary health status correctly', async () => {
    const healthCheck = vi.fn().mockResolvedValue(false);
    const provider = new ResilientProvider(primary, fallback, healthCheck);

    expect(provider.isPrimaryHealthy()).toBe(true); // default before first check

    await provider.getActiveProvider();

    expect(provider.isPrimaryHealthy()).toBe(false);
  });

  it('exposes primary and fallback directly', () => {
    const healthCheck = vi.fn().mockResolvedValue(true);
    const provider = new ResilientProvider(primary, fallback, healthCheck);

    expect(provider.getPrimary()).toBe(primary);
    expect(provider.getFallback()).toBe(fallback);
  });
});
