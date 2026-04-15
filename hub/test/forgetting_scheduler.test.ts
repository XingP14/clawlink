/**
 * Unit tests for ForgettingScheduler.
 * Tests scheduling logic, eviction candidate selection, and cron job lifecycle.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ForgettingScheduler } from '../src/scheduler.js';
import type { ClawDB } from '../src/db.js';
import type { SessionStore } from '../src/session_store.js';
import type { DBSession } from '../src/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<DBSession> = {}): DBSession {
  return {
    id: 'sess-test',
    agentId: 'agent-x',
    framework: 'openclaw',
    startedAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
    transcript: '[]',
    importance: 5.0,
    accessCount: 1,
    tags: [],
    extracted: false,
    flagged: false,
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

function createMockDB() {
  return {
    getAllSessions: vi.fn(),
    addToExtractionQueue: vi.fn(),
    getExtractionQueue: vi.fn(),
    updateExtractionQueueStatus: vi.fn(),
    removeFromExtractionQueue: vi.fn(),
    deleteMemory: vi.fn(),
    getEvictionCandidates: vi.fn(),
    setForgettingScheduler: vi.fn(),
    deleteSession: vi.fn(),
  } as unknown as ClawDB;
}

function createMockSessionStore() {
  return {
    registerSession: vi.fn(),
    updateSession: vi.fn(),
    getSession: vi.fn(),
    listSessions: vi.fn(),
    deleteSession: vi.fn(),
    searchSessions: vi.fn(),
    flagSession: vi.fn(),
    markExtracted: vi.fn(),
    incrementAccessCount: vi.fn(),
    addFeedback: vi.fn(),
  } as unknown as SessionStore;
}

// ─── Test 1: Constructor & Defaults ─────────────────────────────────────────

describe('ForgettingScheduler constructor', () => {
  it('should apply default config when no overrides given', () => {
    const scheduler = new ForgettingScheduler(
      createMockDB(),
      createMockSessionStore(),
      null,
    );
    const status = scheduler.getStatus();
    expect(status.running).toBe(false);
    expect(status.config.enabled).toBe(true);
    expect(status.config.maxEvictionsPerRun).toBe(50);
    expect(status.config.importanceFloor).toBe(3.0);
  });

  it('should override defaults with partial config', () => {
    const scheduler = new ForgettingScheduler(
      createMockDB(),
      createMockSessionStore(),
      null,
      { enabled: false, maxEvictionsPerRun: 5 },
    );
    const status = scheduler.getStatus();
    expect(status.config.enabled).toBe(false);
    expect(status.config.maxEvictionsPerRun).toBe(5);
  });
});

// ─── Test 2: runDailyExtractionScan ─────────────────────────────────────────

describe('runDailyExtractionScan', () => {
  let scheduler: ForgettingScheduler;
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    scheduler = new ForgettingScheduler(db, createMockSessionStore(), null);
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('should queue sessions with importance >= 6 and not yet extracted', async () => {
    const now = Date.now();
    const oldEnough = now - 8 * 24 * 60 * 60 * 1000; // 8 days ago

    db.getAllSessions.mockResolvedValueOnce([
      makeSession({ id: 'old-high', importance: 7.5, extracted: false, startedAt: oldEnough }),
      makeSession({ id: 'old-low', importance: 4.0, extracted: false, startedAt: oldEnough }),
      makeSession({ id: 'new-high', importance: 8.0, extracted: false, startedAt: now }), // too recent
      makeSession({ id: 'already-extracted', importance: 7.0, extracted: true, startedAt: oldEnough }),
    ]);
    db.addToExtractionQueue.mockResolvedValueOnce(undefined);

    // Spy to capture what was queued
    let queuedId = '';
    db.addToExtractionQueue = vi.fn().mockImplementation(async (id: string) => {
      queuedId = id;
    });

    // Re-create scheduler with spied db
    scheduler = new ForgettingScheduler(db, createMockSessionStore(), null);
    await scheduler.runDailyExtractionScan();

    expect(db.addToExtractionQueue).toHaveBeenCalledWith('old-high', 8);
    expect(queuedId).toBe('old-high');
  });

  it('should not queue anything when no sessions meet criteria', async () => {
    db.getAllSessions.mockResolvedValueOnce([
      makeSession({ id: 'low-imp', importance: 2.0 }),
      makeSession({ id: 'already-extracted', importance: 7.0, extracted: true }),
    ]);

    const scheduler = new ForgettingScheduler(db, createMockSessionStore(), null);
    await scheduler.runDailyExtractionScan();

    expect(db.addToExtractionQueue).not.toHaveBeenCalled();
  });
});

// ─── Test 3: runWeeklyEviction ───────────────────────────────────────────────

describe('runWeeklyEviction', () => {
  let scheduler: ForgettingScheduler;
  let db: ReturnType<typeof createMockDB>;
  let sessionStore: ReturnType<typeof createMockSessionStore>;

  beforeEach(() => {
    db = createMockDB();
    sessionStore = createMockSessionStore();
    scheduler = new ForgettingScheduler(db, sessionStore, null);
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('should delete sessions returned by getEvictionCandidates', async () => {
    const evictSessions = [
      { id: 'sess-evict-1', importance: 1.0, lastAccessedAt: 0, accessCount: 0 },
      { id: 'sess-evict-2', importance: 1.5, lastAccessedAt: 0, accessCount: 0 },
    ];

    db.getEvictionCandidates.mockResolvedValueOnce({
      memories: [],
      sessions: evictSessions,
    });
    (sessionStore.deleteSession as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const result = await scheduler.runWeeklyEviction();

    expect(sessionStore.deleteSession).toHaveBeenCalledWith('sess-evict-1');
    expect(sessionStore.deleteSession).toHaveBeenCalledWith('sess-evict-2');
    expect(result.sessions).toBe(2);
  });

  it('should delete memories returned by getEvictionCandidates', async () => {
    const evictMemories = [
      { key: 'forget-me', importance: 0.5, lastAccessedAt: 0, accessCount: 0 },
    ];

    db.getEvictionCandidates.mockResolvedValueOnce({
      memories: evictMemories,
      sessions: [],
    });
    (db.deleteMemory as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const scheduler = new ForgettingScheduler(db, sessionStore, null);
    const result = await scheduler.runWeeklyEviction();

    expect(db.deleteMemory).toHaveBeenCalledWith('forget-me');
  });

  it('should respect maxEvictionsPerRun limit', async () => {
    const db = createMockDB();
    const sessionStore = createMockSessionStore();

    const many = Array.from({ length: 100 }, (_, i) => ({
      id: `s-${i}`,
      importance: 0.5,
      lastAccessedAt: 0,
      accessCount: 0,
    }));

    // Simulate DB returning exactly maxEvictionsPerRun sessions (DB respects limit param)
    (db.getEvictionCandidates as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      memories: [],
      sessions: many.slice(0, 10),
    });

    // deleteSession must return true for sessions to be counted
    (sessionStore.deleteSession as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const scheduler = new ForgettingScheduler(
      db,
      sessionStore,
      null,
      { maxEvictionsPerRun: 10 },
    );
    const result = await scheduler.runWeeklyEviction();

    // Only maxEvictionsPerRun sessions should be processed
    expect(sessionStore.deleteSession).toHaveBeenCalledTimes(10);
    expect(result.sessions).toBe(10);
  });
});

// ─── Test 4: getStatus ───────────────────────────────────────────────────────

describe('getStatus', () => {
  it('should return running=false when disabled', () => {
    const scheduler = new ForgettingScheduler(
      createMockDB(),
      createMockSessionStore(),
      null,
      { enabled: false },
    );
    const status = scheduler.getStatus();
    expect(status.running).toBe(false);
    expect(status.config.enabled).toBe(false);
  });

  it('should return running=true after start', () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const scheduler = new ForgettingScheduler(
      createMockDB(),
      createMockSessionStore(),
      null,
      { enabled: true },
    );
    scheduler.start();
    const status = scheduler.getStatus();
    expect(status.running).toBe(true);
    scheduler.stop();
    vi.useRealTimers();
  });
});

// ─── Test 5: Disabled scheduler ──────────────────────────────────────────────

describe('ForgettingScheduler disabled', () => {
  it('should not start cron jobs when disabled', () => {
    const scheduler = new ForgettingScheduler(
      createMockDB(),
      createMockSessionStore(),
      null,
      { enabled: false },
    );
    scheduler.start();
    const status = scheduler.getStatus();
    expect(status.running).toBe(false);
    scheduler.stop(); // should be a no-op
  });
});
