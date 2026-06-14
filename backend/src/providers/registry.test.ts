import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry, resetRegistry, getRegistry, createLocalRegistry } from './registry.js';
import type {
  PreferenceStoreProvider,
  SessionStoreProvider,
  CacheProvider,
  AgentProvider,
} from './interfaces.js';

// Minimal mock providers for testing registry behavior
const mockPreferenceStore: PreferenceStoreProvider = {
  getUserProfile: async () => null,
  updateBrandLoyalty: async () => {},
  setDietaryFlag: async () => {},
  getPreferences: async () => ({
    category: '',
    toleranceLevel: 'moderate',
    priceWeight: 0.5,
    brandWeight: 0.5,
    preferredBrands: [],
  }),
};

const mockFallbackPreferenceStore: PreferenceStoreProvider = {
  getUserProfile: async () => null,
  updateBrandLoyalty: async () => {},
  setDietaryFlag: async () => {},
  getPreferences: async () => ({
    category: '',
    toleranceLevel: 'moderate',
    priceWeight: 0.5,
    brandWeight: 0.5,
    preferredBrands: [],
  }),
};

const mockSessionStore: SessionStoreProvider = {
  getSession: async () => null,
  saveSession: async () => {},
  deleteSession: async () => {},
};

const mockCache: CacheProvider = {
  get: async () => null,
  set: async () => {},
  delete: async () => {},
};

const mockAgent: AgentProvider = {
  invoke: async () => ({ content: 'mock response' }),
};

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    resetRegistry();
    registry = new ProviderRegistry({ environment: 'LOCAL' });
  });

  it('reports environment correctly', () => {
    expect(registry.getEnvironment()).toBe('LOCAL');
    expect(registry.isLocal()).toBe(true);
  });

  it('throws when accessing unregistered provider', async () => {
    await expect(registry.getPreferenceStore()).rejects.toThrow(
      'PreferenceStoreProvider not registered'
    );
  });

  it('returns primary provider when healthy', async () => {
    registry.registerPreferenceStore(
      mockPreferenceStore,
      mockFallbackPreferenceStore,
      async () => true
    );

    const provider = await registry.getPreferenceStore();
    expect(provider).toBe(mockPreferenceStore);
  });

  it('returns fallback provider when primary is unhealthy', async () => {
    registry.registerPreferenceStore(
      mockPreferenceStore,
      mockFallbackPreferenceStore,
      async () => false
    );

    const provider = await registry.getPreferenceStore();
    expect(provider).toBe(mockFallbackPreferenceStore);
  });

  it('registers and retrieves session store', async () => {
    const fallbackSession: SessionStoreProvider = {
      getSession: async () => null,
      saveSession: async () => {},
      deleteSession: async () => {},
    };

    registry.registerSessionStore(mockSessionStore, fallbackSession, async () => true);

    const provider = await registry.getSessionStore();
    expect(provider).toBe(mockSessionStore);
  });

  it('registers and retrieves cache provider', async () => {
    const fallbackCache: CacheProvider = {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
    };

    registry.registerCache(mockCache, fallbackCache, async () => true);

    const provider = await registry.getCache();
    expect(provider).toBe(mockCache);
  });

  it('registers and retrieves agent provider', async () => {
    const fallbackAgent: AgentProvider = {
      invoke: async () => ({ content: 'fallback' }),
    };

    registry.registerAgent(mockAgent, fallbackAgent, async () => true);

    const provider = await registry.getAgent();
    expect(provider).toBe(mockAgent);
  });

  it('reports health status for all registered providers', async () => {
    registry.registerPreferenceStore(
      mockPreferenceStore,
      mockFallbackPreferenceStore,
      async () => true
    );

    // Trigger a health check
    await registry.getPreferenceStore();

    const status = registry.getHealthStatus();
    expect(status.preferenceStore).toBe(true);
    expect(status.sessionStore).toBe(false); // not registered
  });

  it('invalidateAll forces re-check on next access', async () => {
    let healthy = true;
    registry.registerPreferenceStore(
      mockPreferenceStore,
      mockFallbackPreferenceStore,
      async () => healthy
    );

    // First access — primary is healthy
    const first = await registry.getPreferenceStore();
    expect(first).toBe(mockPreferenceStore);

    // Simulate primary going down
    healthy = false;
    registry.invalidateAll();

    const second = await registry.getPreferenceStore();
    expect(second).toBe(mockFallbackPreferenceStore);
  });

  it('property-style getters work the same as method getters', async () => {
    registry.registerPreferenceStore(
      mockPreferenceStore,
      mockFallbackPreferenceStore,
      async () => true
    );
    registry.registerSessionStore(
      mockSessionStore,
      { getSession: async () => null, saveSession: async () => {}, deleteSession: async () => {} },
      async () => true
    );
    registry.registerCache(
      mockCache,
      { get: async () => null, set: async () => {}, delete: async () => {} },
      async () => true
    );
    registry.registerAgent(
      mockAgent,
      { invoke: async () => ({ content: '' }) },
      async () => true
    );

    const pref = await registry.preferenceStore;
    const session = await registry.sessionStore;
    const cache = await registry.cache;
    const agent = await registry.agent;

    expect(pref).toBe(mockPreferenceStore);
    expect(session).toBe(mockSessionStore);
    expect(cache).toBe(mockCache);
    expect(agent).toBe(mockAgent);
  });
});

describe('getRegistry singleton', () => {
  beforeEach(() => {
    resetRegistry();
  });

  it('creates registry with LOCAL environment by default', () => {
    const reg = getRegistry();
    expect(reg.getEnvironment()).toBe('LOCAL');
  });

  it('returns same instance on subsequent calls', () => {
    const reg1 = getRegistry();
    const reg2 = getRegistry();
    expect(reg1).toBe(reg2);
  });

  it('accepts config on first creation', () => {
    const reg = getRegistry({ environment: 'PROD' });
    expect(reg.getEnvironment()).toBe('PROD');
  });

  it('initializes providers on creation', async () => {
    const reg = getRegistry({ environment: 'LOCAL' });

    // In LOCAL mode, all providers should be initialized with fallback implementations
    const pref = await reg.getPreferenceStore();
    expect(pref).toBeDefined();

    const session = await reg.getSessionStore();
    expect(session).toBeDefined();

    const cache = await reg.getCache();
    expect(cache).toBeDefined();

    const agent = await reg.getAgent();
    expect(agent).toBeDefined();
  });
});

describe('createLocalRegistry', () => {
  it('creates an isolated local registry', async () => {
    const reg = createLocalRegistry();
    expect(reg.getEnvironment()).toBe('LOCAL');
    expect(reg.isLocal()).toBe(true);

    // All providers should work immediately
    const pref = await reg.getPreferenceStore();
    expect(pref).toBeDefined();

    const session = await reg.getSessionStore();
    expect(session).toBeDefined();

    const cache = await reg.getCache();
    expect(cache).toBeDefined();

    const agent = await reg.getAgent();
    expect(agent).toBeDefined();
  });

  it('providers function correctly in local mode', async () => {
    const reg = createLocalRegistry();

    // Session store should work
    const sessionStore = await reg.getSessionStore();
    await sessionStore.saveSession('test-session', {
      sessionId: 'test-session',
      userId: 'user-1',
      conversationHistory: [],
      cartState: [],
      agentReasoningHistory: [],
      suggestionsGiven: { basketCompletion: 0, gapFill: 0 },
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    });
    const session = await sessionStore.getSession('test-session');
    expect(session).not.toBeNull();
    expect(session!.sessionId).toBe('test-session');

    // Cache should work
    const cache = await reg.getCache();
    await cache.set('test-key', { value: 42 }, 60);
    const cached = await cache.get<{ value: number }>('test-key');
    expect(cached).toEqual({ value: 42 });

    // Agent should work (rule-based fallback)
    const agent = await reg.getAgent();
    const response = await agent.invoke(
      {
        sessionId: 'test',
        userId: 'user-1',
        conversationHistory: [],
        cartState: [],
      },
      'hello'
    );
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
  });

  it('health status shows all providers as healthy in local mode', async () => {
    const reg = createLocalRegistry();

    // Trigger health checks by accessing providers
    await reg.getPreferenceStore();
    await reg.getSessionStore();
    await reg.getCache();
    await reg.getAgent();

    const status = reg.getHealthStatus();
    expect(status.preferenceStore).toBe(true);
    expect(status.sessionStore).toBe(true);
    expect(status.cache).toBe(true);
    expect(status.agent).toBe(true);
  });
});
