/**
 * Unit tests for ExtractionEngine + OpenAIProvider.
 * Mocks global fetch to test HTTP calls without real network.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtractionEngine } from '../src/extraction/engine.js';
import { OpenAIProvider } from '../src/extraction/providers/openai.js';
import type { AIProvider, ImportanceResult, ExtractionResult } from '../src/extraction/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetch(data: unknown, status = 200) {
  return vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    } as unknown as Response),
  );
}

// ─── Test 1: ExtractionEngine.scoreMemory delegates to provider ──────────────

describe('ExtractionEngine.scoreMemory', () => {
  it('should call provider with correct arguments', async () => {
    const mockProvider = {
      scoreMemory: vi.fn(),
      extractSession: vi.fn(),
    } as unknown as AIProvider;

    (mockProvider.scoreMemory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true, score: 8, reasoning: 'important',
    });

    const engine = new ExtractionEngine(mockProvider);
    const history = [{ accessedAt: Date.now() - 3600000, query: 'project status' }];
    const result = await engine.scoreMemory('my-key', 'memory content here', history);

    expect(mockProvider.scoreMemory).toHaveBeenCalledOnce();
    expect(mockProvider.scoreMemory).toHaveBeenCalledWith('my-key', 'memory content here', history);
    expect(result.score).toBe(8);
  });

  it('should return raw result from provider', async () => {
    const mockProvider = {
      scoreMemory: vi.fn(),
      extractSession: vi.fn(),
    } as unknown as AIProvider;

    (mockProvider.scoreMemory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false, score: 5, reasoning: 'fallback',
    });

    const engine = new ExtractionEngine(mockProvider);
    const result = await engine.scoreMemory('k', 'c', []);
    expect(result.success).toBe(false);
    expect(result.reasoning).toBe('fallback');
  });
});

// ─── Test 2: ExtractionEngine.extractSession ───────────────────────────────────

describe('ExtractionEngine.extractSession', () => {
  it('should delegate to provider and return summary + tags', async () => {
    const mockProvider = {
      scoreMemory: vi.fn(),
      extractSession: vi.fn(),
    } as unknown as AIProvider;

    (mockProvider.extractSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      summary: 'Fixed auth bug in login flow',
      tags: ['bugfix', 'auth', 'typescript'],
      keyEvents: ['identified root cause', 'wrote unit test'],
      entities: ['AuthService', 'login.ts'],
    });

    const engine = new ExtractionEngine(mockProvider);
    const session = { id: 'sess-1', transcript: '[{"role":"user","content":"login broken"}]' };
    const result = await engine.extractSession(session);

    expect(result.summary).toBe('Fixed auth bug in login flow');
    expect(result.tags).toContain('auth');
  });
});

// ─── Test 3: ExtractionEngine.rankMemories — RRF ─────────────────────────────

describe('ExtractionEngine.rankMemories', () => {
  it('should fuse two ranked lists by RRF', () => {
    const engine = new ExtractionEngine({} as AIProvider);
    const lists = [
      [{ key: 'mem-a', rank: 1 }, { key: 'mem-b', rank: 2 }],
      [{ key: 'mem-b', rank: 1 }, { key: 'mem-c', rank: 2 }],
    ];

    const results = engine.rankMemories(lists, 3);

    expect(results[0].key).toBe('mem-b'); // appears in top-2 of both lists
    // mem-a and mem-c are tied — order may vary
    const keys = results.map((r) => r.key);
    expect(keys).toContain('mem-a');
    expect(keys).toContain('mem-c');
  });

  it('should return empty array for empty input', () => {
    const engine = new ExtractionEngine({} as AIProvider);
    expect(engine.rankMemories([])).toEqual([]);
  });

  it('should respect topK limit', () => {
    const engine = new ExtractionEngine({} as AIProvider);
    const lists = Array.from({ length: 5 }, (_, i) => [
      { key: `mem-${i}`, rank: i + 1 },
    ]);
    const results = engine.rankMemories(lists, 3);
    expect(results).toHaveLength(3);
  });
});

// ─── Test 4: ExtractionEngine.processBatch ───────────────────────────────────

describe('ExtractionEngine.processBatch', () => {
  it('should process items up to batch size with pacing', async () => {
    vi.useFakeTimers();
    const engine = new ExtractionEngine({} as AIProvider, { batchSize: 2, batchIntervalMs: 100 });
    const worker = vi.fn(async () => undefined);

    const promise = engine.processBatch(['a', 'b', 'c'], worker);
    await vi.runAllTimersAsync();
    const processed = await promise;

    expect(processed).toBe(2);
    expect(worker).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

// ─── Test 4: OpenAIProvider — successful scoring ─────────────────────────────

describe('OpenAIProvider.scoreMemory', () => {
  it('should parse score from OpenAI response', async () => {
    const mockResponse = {
      choices: [{ message: { content: '{"score": 7, "reasoning": "useful project info", "suggestedTags": ["project", "决策"]}' } }],
    };

    vi.stubGlobal('fetch', mockFetch(mockResponse, 200));

    const provider = new OpenAIProvider('test-key');
    const result = await provider.scoreMemory('project-x', 'Deploy to prod on Friday', []);

    expect(result.score).toBe(7);
    expect(result.reasoning).toBe('useful project info');
    expect(result.suggestedTags).toContain('project');

    vi.restoreAllMocks();
  });

  it('should clamp score to [0, 10]', async () => {
    const mockResponse = {
      choices: [{ message: { content: '{"score": 99}' } }],
    };
    vi.stubGlobal('fetch', mockFetch(mockResponse, 200));

    const provider = new OpenAIProvider('test-key');
    const result = await provider.scoreMemory('k', 'c', []);

    expect(result.score).toBe(10);
    vi.restoreAllMocks();
  });

  it('should return fallback on API error', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'bad request' }, 400));

    const provider = new OpenAIProvider('test-key');
    const result = await provider.scoreMemory('k', 'c', []);

    expect(result.success).toBe(false);
    expect(result.score).toBe(5); // fallback
    vi.restoreAllMocks();
  });
});

// ─── Test 5: OpenAIProvider — successful extraction ────────────────────────

describe('OpenAIProvider.extractSession', () => {
  it('should parse summary and tags from OpenAI response', async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: '{"summary": "Discussed WoClaw Hub design trade-offs", "tags": ["woclaw", "architecture", "database"], "keyEvents": ["decided on SQLite"], "entities": ["Hub", "REST API"]}',
        },
      }],
    };

    vi.stubGlobal('fetch', mockFetch(mockResponse, 200));

    const provider = new OpenAIProvider('test-key');
    const result = await provider.extractSession({
      id: 'sess-2',
      transcript: '[{"role":"assistant","content":"Let us discuss the hub design"}]',
    });

    expect(result.summary).toBe('Discussed WoClaw Hub design trade-offs');
    expect(result.tags).toContain('woclaw');
    expect(result.keyEvents).toContain('decided on SQLite');
    expect(result.entities).toContain('Hub');

    vi.restoreAllMocks();
  });

  it('should return error result on API failure', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 500));

    const provider = new OpenAIProvider('test-key');
    const result = await provider.extractSession({ id: 's', transcript: '[]' });

    expect(result.success).toBe(false);
    vi.restoreAllMocks();
  });
});
