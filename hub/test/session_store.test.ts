/**
 * Unit tests for SessionStore.
 * Tests session lifecycle, importance clamping, and mutations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStore } from '../src/session_store.js';
import type { ClawDB } from '../src/db.js';
import type { DBSession } from '../src/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<DBSession> = {}): DBSession {
  const now = Date.now();
  return {
    id: 'sess-test',
    agentId: 'agent-x',
    framework: 'openclaw',
    startedAt: now - 86400000,
    endedAt: now,
    transcript: '[]',
    importance: 5.0,
    accessCount: 0,
    tags: [],
    extracted: false,
    flagged: false,
    createdAt: now - 86400000,
    ...overrides,
  };
}

function createMockDB() {
  const sessions = new Map<string, DBSession>();
  return {
    setSession: vi.fn(async (s: DBSession) => { sessions.set(s.id, s); }),
    getSession: vi.fn(async (id: string) => sessions.get(id)),
    getAllSessions: vi.fn(async (_?: string, __?: string, limit = 50, _offset = 0) =>
      Array.from(sessions.values()).slice(0, limit)),
    sessionSearch: vi.fn(async (_q: string, _limit = 20) => Array.from(sessions.values())),
    deleteSession: vi.fn(async (id: string) => {
      const existed = sessions.has(id);
      sessions.delete(id);
      return existed;
    }),
    addSessionFeedback: vi.fn(),
  } as unknown as ClawDB;
}

// ─── Test 1: registerSession ─────────────────────────────────────────────────

describe('registerSession', () => {
  it('should store session via setSession', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    const s = makeSession({ id: 'new-sess', importance: 7.5 });
    await store.registerSession(s);
    expect(db.setSession).toHaveBeenCalledOnce();
    const stored = (db.setSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(stored.id).toBe('new-sess');
  });

  it('should clamp importance to [0, 10]', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    await store.registerSession(makeSession({ importance: 99 }));
    const stored = (db.setSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(stored.importance).toBe(10);
    await store.registerSession(makeSession({ importance: -5 }));
    const stored2 = (db.setSession as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(stored2.importance).toBe(0);
  });

  it('should default accessCount to 0', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    await store.registerSession(makeSession({ accessCount: undefined }));
    const stored = (db.setSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(stored.accessCount).toBe(0);
  });

  it('should default tags to []', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    await store.registerSession(makeSession({ tags: undefined }));
    const stored = (db.setSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(stored.tags).toEqual([]);
  });
});

// ─── Test 2: updateSession ───────────────────────────────────────────────────

describe('updateSession', () => {
  it('should merge updates with existing session', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    const original = makeSession({ id: 's1', importance: 5.0, tags: ['old'] });
    await store.registerSession(original);
    await store.updateSession('s1', { importance: 8.0, tags: ['new'] });
    const updated = (db.setSession as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(updated.importance).toBe(8.0);
    expect(updated.tags).toEqual(['new']);
  });

  it('should preserve immutable fields', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    const original = makeSession({ id: 's2', agentId: 'agent-x', framework: 'openclaw' });
    await store.registerSession(original);
    await store.updateSession('s2', { id: 'changed', agentId: 'changed', framework: 'changed' });
    const updated = (db.setSession as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(updated.id).toBe('s2');
    expect(updated.agentId).toBe('agent-x');
    expect(updated.framework).toBe('openclaw');
  });

  it('should throw if session not found', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    await expect(store.updateSession('does-not-exist', { importance: 9 })).rejects.toThrow('Session not found');
  });
});

// ─── Test 3: getSession / listSessions ───────────────────────────────────────

describe('getSession / listSessions', () => {
  it('getSession returns stored session', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    const s = makeSession({ id: 'find-me' });
    await store.registerSession(s);
    const found = await store.getSession('find-me');
    expect(found?.id).toBe('find-me');
  });

  it('listSessions returns all sessions', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    await store.registerSession(makeSession({ id: 'a' }));
    await store.registerSession(makeSession({ id: 'b' }));
    const all = await store.listSessions();
    expect(all).toHaveLength(2);
  });
});

// ─── Test 4: deleteSession ───────────────────────────────────────────────────

describe('deleteSession', () => {
  it('should return true when session existed', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    await store.registerSession(makeSession({ id: 'to-delete' }));
    const result = await store.deleteSession('to-delete');
    expect(result).toBe(true);
  });

  it('should return false when session did not exist', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    const result = await store.deleteSession('non-existent');
    expect(result).toBe(false);
  });
});

// ─── Test 5: flagSession / markExtracted ─────────────────────────────────────

describe('flagSession / markExtracted', () => {
  it('flagSession should update flagged field', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    await store.registerSession(makeSession({ id: 'flag-test' }));
    await store.flagSession('flag-test', true);
    const updated = (db.setSession as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(updated.flagged).toBe(true);
  });

  it('markExtracted should set extracted=true', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    await store.registerSession(makeSession({ id: 'extract-test', extracted: false }));
    await store.markExtracted('extract-test');
    const updated = (db.setSession as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(updated.extracted).toBe(true);
  });
});

// ─── Test 6: incrementAccessCount ─────────────────────────────────────────────

describe('incrementAccessCount', () => {
  it('should increment accessCount', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    await store.registerSession(makeSession({ id: 'acc-test', accessCount: 3 }));
    await store.incrementAccessCount('acc-test');
    const updated = (db.setSession as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(updated.accessCount).toBe(4);
    expect(updated.lastAccessedAt).toBeGreaterThan(0);
  });
});

// ─── Test 7: searchSessions ──────────────────────────────────────────────────

describe('searchSessions', () => {
  it('should return empty for blank query', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    const results = await store.searchSessions('');
    expect(results).toEqual([]);
  });

  it('should delegate to db.sessionSearch', async () => {
    const db = createMockDB();
    const store = new SessionStore(db);
    await store.searchSessions('login bug');
    expect(db.sessionSearch).toHaveBeenCalledWith('login bug', 20);
  });
});
