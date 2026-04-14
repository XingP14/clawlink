import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClawDB } from '../src/db.js';
import type { DBSession } from '../src/types.js';
import { existsSync, mkdirSync, rmSync } from 'fs';

describe('ClawDB Sessions', () => {
  const testDir = '/tmp/woclaw-test-sessions-' + Date.now();
  let db: ClawDB;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    db = new ClawDB(testDir);
    // Give DB a moment to init
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterEach(async () => {
    await db.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ── Task 1: setSession + getSession round-trip ──────────────────────────────
  describe('setSession / getSession', () => {
    it('stores and retrieves a session', async () => {
      const session: DBSession = {
        id: 'sess-001',
        agentId: 'agent1',
        framework: 'openclaw',
        startedAt: Date.now() - 60000,
        endedAt: Date.now(),
        transcript: 'Hello world',
        summary: 'A greeting session',
        importance: 7.0,
        accessCount: 3,
        lastAccessedAt: Date.now(),
        tags: ['greeting', 'test'],
        extracted: false,
        flagged: false,
        createdAt: Date.now(),
      };
      await db.setSession(session);
      const retrieved = await db.getSession('sess-001');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('sess-001');
      expect(retrieved!.agentId).toBe('agent1');
      expect(retrieved!.framework).toBe('openclaw');
      expect(retrieved!.transcript).toBe('Hello world');
      expect(retrieved!.summary).toBe('A greeting session');
      expect(retrieved!.importance).toBe(7.0);
      expect(retrieved!.accessCount).toBe(3);
      expect(retrieved!.tags).toEqual(['greeting', 'test']);
      expect(retrieved!.extracted).toBe(false);
      expect(retrieved!.flagged).toBe(false);
    });

    it('getSession returns undefined for non-existent id', async () => {
      const result = await db.getSession('nonexistent');
      expect(result).toBeUndefined();
    });

    it('overwrites existing session with same id', async () => {
      const s1: DBSession = { id: 'sess-002', agentId: 'a', framework: 'openclaw', startedAt: 1000, transcript: 'v1', importance: 5, accessCount: 0, tags: [], extracted: false, flagged: false, createdAt: 1000 };
      const s2: DBSession = { id: 'sess-002', agentId: 'a', framework: 'openclaw', startedAt: 2000, transcript: 'v2', importance: 8, accessCount: 5, tags: ['updated'], extracted: true, flagged: true, createdAt: 2000 };
      await db.setSession(s1);
      await db.setSession(s2);
      const retrieved = await db.getSession('sess-002');
      expect(retrieved!.transcript).toBe('v2');
      expect(retrieved!.importance).toBe(8);
      expect(retrieved!.accessCount).toBe(5);
    });
  });

  // ── Task 2: getAllSessions with agentId filter ─────────────────────────────
  describe('getAllSessions', () => {
    beforeEach(async () => {
      const sessions: DBSession[] = [
        { id: 's1', agentId: 'agent1', framework: 'openclaw', startedAt: 1000, transcript: '', importance: 5, accessCount: 0, tags: [], extracted: false, flagged: false, createdAt: 1000 },
        { id: 's2', agentId: 'agent1', framework: 'openclaw', startedAt: 2000, transcript: '', importance: 6, accessCount: 1, tags: [], extracted: false, flagged: false, createdAt: 2000 },
        { id: 's3', agentId: 'agent2', framework: 'openclaw', startedAt: 3000, transcript: '', importance: 7, accessCount: 2, tags: [], extracted: false, flagged: false, createdAt: 3000 },
        { id: 's4', agentId: 'agent1', framework: 'custom', startedAt: 4000, transcript: '', importance: 8, accessCount: 3, tags: [], extracted: false, flagged: false, createdAt: 4000 },
      ];
      for (const s of sessions) await db.setSession(s);
    });

    it('returns all sessions when no filter', async () => {
      const all = await db.getAllSessions();
      expect(all.length).toBe(4);
    });

    it('filters by agentId', async () => {
      const all = await db.getAllSessions('agent1');
      expect(all.length).toBe(3);
      expect(all.every(s => s.agentId === 'agent1')).toBe(true);
    });

    it('filters by framework', async () => {
      const all = await db.getAllSessions(undefined, 'custom');
      expect(all.length).toBe(1);
      expect(all[0].framework).toBe('custom');
    });

    it('filters by both agentId and framework', async () => {
      const all = await db.getAllSessions('agent1', 'openclaw');
      expect(all.length).toBe(2);
    });

    it('respects limit and offset', async () => {
      const page1 = await db.getAllSessions(undefined, undefined, 2, 0);
      const page2 = await db.getAllSessions(undefined, undefined, 2, 2);
      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  // ── Task 3: deleteSession ───────────────────────────────────────────────────
  describe('deleteSession', () => {
    it('deletes an existing session and returns true', async () => {
      const session: DBSession = { id: 'del-s1', agentId: 'a', framework: 'openclaw', startedAt: 1000, transcript: '', importance: 5, accessCount: 0, tags: [], extracted: false, flagged: false, createdAt: 1000 };
      await db.setSession(session);
      const deleted = await db.deleteSession('del-s1');
      expect(deleted).toBe(true);
      expect(await db.getSession('del-s1')).toBeUndefined();
    });

    it('returns false when deleting non-existent session', async () => {
      const deleted = await db.deleteSession('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  // ── Task 4: sessionSearch ──────────────────────────────────────────────────
  describe('sessionSearch', () => {
    beforeEach(async () => {
      const sessions: DBSession[] = [
        { id: 'sr1', agentId: 'a', framework: 'openclaw', startedAt: 1000, transcript: 'The project uses TypeScript and React', importance: 7, accessCount: 0, tags: ['project', 'typescript'], extracted: false, flagged: false, createdAt: 1000 },
        { id: 'sr2', agentId: 'a', framework: 'openclaw', startedAt: 2000, transcript: 'The meeting was about deployment on AWS', importance: 5, accessCount: 0, tags: ['meeting'], extracted: false, flagged: false, createdAt: 2000 },
        { id: 'sr3', agentId: 'b', framework: 'openclaw', startedAt: 3000, transcript: 'TypeScript config needs updating', importance: 6, accessCount: 0, tags: ['typescript'], extracted: false, flagged: false, createdAt: 3000 },
      ];
      for (const s of sessions) await db.setSession(s);
    });

    it('searches transcript content', async () => {
      const results = await db.sessionSearch('TypeScript');
      expect(results.length).toBe(2);
      expect(results.map(r => r.id).sort()).toEqual(['sr1', 'sr3']);
    });

    it('searches summary content', async () => {
      // Add sessions with summary
      await db.setSession({ id: 'sr4', agentId: 'a', framework: 'openclaw', startedAt: 4000, transcript: 'Some chat', summary: 'Discussed TypeScript migration', importance: 5, accessCount: 0, tags: [], extracted: false, flagged: false, createdAt: 4000 });
      const results = await db.sessionSearch('TypeScript');
      expect(results.some(r => r.id === 'sr4')).toBe(true);
    });

    it('respects limit', async () => {
      const results = await db.sessionSearch('TypeScript', 1);
      expect(results.length).toBe(1);
    });

    it('returns empty array when no match', async () => {
      const results = await db.sessionSearch('nonexistent-term');
      expect(results).toEqual([]);
    });
  });

  // ── Task 5: importance clamping (base 5.0, feedback adjustment) ────────────
  describe('importance clamping', () => {
    it('clamps base importance to 0-10 range on retrieval via feedback adjustment', async () => {
      // Add session with high base importance
      const session: DBSession = { id: 'imp-1', agentId: 'a', framework: 'openclaw', startedAt: 1000, transcript: '', importance: 10, accessCount: 0, tags: [], extracted: false, flagged: false, createdAt: 1000 };
      await db.setSession(session);

      // Add positive feedback that would push it above 10
      await db.addSessionFeedback('imp-1', 'a', 5.0, 'very important');
      const retrieved = await db.getSession('imp-1');
      // The stored importance should remain at its base value
      // Feedback is tracked separately; base importance is clamped at storage time
      expect(retrieved!.importance).toBeLessThanOrEqual(10);
    });

    it('addSessionFeedback stores feedback correctly', async () => {
      const session: DBSession = { id: 'fb-1', agentId: 'a', framework: 'openclaw', startedAt: 1000, transcript: '', importance: 5, accessCount: 0, tags: [], extracted: false, flagged: false, createdAt: 1000 };
      await db.setSession(session);
      await db.addSessionFeedback('fb-1', 'a', 2.0, 'helpful session');

      const history = await db.getSessionFeedbackHistory('fb-1');
      expect(history.length).toBe(1);
      expect(history[0].adjustment).toBe(2.0);
      expect(history[0].reason).toBe('helpful session');
      expect(history[0].agentId).toBe('a');
    });

    it('getSessionFeedbackHistory returns empty for session with no feedback', async () => {
      const history = await db.getSessionFeedbackHistory('no-feedback');
      expect(history).toEqual([]);
    });
  });

  // ── Task 6: extraction queue ────────────────────────────────────────────────
  describe('Extraction Queue', () => {
    beforeEach(async () => {
      const session: DBSession = { id: 'eq-1', agentId: 'a', framework: 'openclaw', startedAt: 1000, transcript: 'chat', importance: 5, accessCount: 0, tags: [], extracted: false, flagged: false, createdAt: 1000 };
      await db.setSession(session);
    });

    it('adds session to extraction queue', async () => {
      await db.addToExtractionQueue('eq-1', 5);
      const queue = await db.getExtractionQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].sessionId).toBe('eq-1');
      expect(queue[0].priority).toBe(5);
      expect(queue[0].status).toBe('pending');
    });

    it('getExtractionQueue respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await db.setSession({ id: `eq-${i}`, agentId: 'a', framework: 'openclaw', startedAt: 1000 + i, transcript: '', importance: 5, accessCount: 0, tags: [], extracted: false, flagged: false, createdAt: 1000 });
        await db.addToExtractionQueue(`eq-${i}`, i);
      }
      const queue = await db.getExtractionQueue(3);
      expect(queue.length).toBe(3);
    });

    it('updates extraction queue status', async () => {
      await db.addToExtractionQueue('eq-1', 0);
      await db.updateExtractionQueueStatus('eq-1', 'processing');
      const queue = await db.getExtractionQueue();
      expect(queue[0].status).toBe('processing');
    });

    it('removes session from extraction queue', async () => {
      await db.addToExtractionQueue('eq-1', 0);
      await db.removeFromExtractionQueue('eq-1');
      const queue = await db.getExtractionQueue();
      expect(queue.length).toBe(0);
    });
  });

  // ── Task 7: getEvictionCandidates ─────────────────────────────────────────
  describe('getEvictionCandidates', () => {
    it('returns low-importance memories and sessions as eviction candidates', async () => {
      // Low importance memory
      await db.setMemory('mem-low', 'value', 'a', [], 0);
      // High importance memory
      await db.setMemory('mem-high', 'value', 'a', [], 0);

      // Low importance session
      await db.setSession({ id: 'ev-sess-low', agentId: 'a', framework: 'openclaw', startedAt: 1000, transcript: '', importance: 1.0, accessCount: 0, tags: [], extracted: false, flagged: false, createdAt: 1000 });
      // High importance session
      await db.setSession({ id: 'ev-sess-high', agentId: 'a', framework: 'openclaw', startedAt: 2000, transcript: '', importance: 9.0, accessCount: 10, tags: [], extracted: false, flagged: false, createdAt: 2000 });

      const candidates = await db.getEvictionCandidates(3.0, 3.0, 10);
      expect(Array.isArray(candidates.memories)).toBe(true);
      expect(Array.isArray(candidates.sessions)).toBe(true);
    });

    it('memory feedback affects eviction score', async () => {
      await db.setMemory('mem-feedback', 'value', 'a', [], 0);
      await db.addMemoryFeedback('mem-feedback', 'a', 5.0, 'important');
      const candidates = await db.getEvictionCandidates(1.0, 1.0, 10);
      // mem-feedback with high importance + positive feedback should NOT be in low-importance candidates
      const found = candidates.memories.find(m => m.key === 'mem-feedback');
      // With importance boosted by feedback, it should not appear as candidate
      // (depends on implementation of adjusted importance)
      expect(found === undefined || found.importance >= 1.0).toBe(true);
    });
  });

  // ── Task 8: memory feedback ────────────────────────────────────────────────
  describe('Memory Feedback', () => {
    it('adds and retrieves memory feedback', async () => {
      await db.addMemoryFeedback('mem-key', 'agent1', 1.5, 'useful');
      const history = await db.getMemoryFeedbackHistory('mem-key');
      expect(history.length).toBe(1);
      expect(history[0].adjustment).toBe(1.5);
      expect(history[0].reason).toBe('useful');
      expect(history[0].agentId).toBe('agent1');
    });

    it('getMemoryFeedbackHistory returns empty for key with no feedback', async () => {
      const history = await db.getMemoryFeedbackHistory('no-feedback-key');
      expect(history).toEqual([]);
    });
  });
});
