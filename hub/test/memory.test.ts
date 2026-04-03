import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryPool } from '../src/memory.js';
import { ClawDB } from '../src/db.js';
import { existsSync, rmSync } from 'fs';

describe('MemoryPool', () => {
  const testDir = '/tmp/woclaw-test-memory-' + Date.now();
  let db: ClawDB;
  let mp: MemoryPool;

  beforeEach(() => {
    db = new ClawDB(testDir);
    mp = new MemoryPool(db);
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('write / read', () => {
    it('writes and reads memory', () => {
      mp.write('project-name', 'my-app', 'agent1');
      const mem = mp.read('project-name');
      expect(mem?.value).toBe('my-app');
      expect(mem?.updatedBy).toBe('agent1');
    });

    it('writes with tags', () => {
      mp.write('key1', 'val1', 'agent1', ['project', 'important']);
      const mem = mp.read('key1');
      expect(mem?.tags).toContain('project');
      expect(mem?.tags).toContain('important');
    });

    it('writes with TTL', () => {
      mp.write('temp', 'data', 'agent1', [], 3600);
      const mem = mp.read('temp');
      expect(mem?.ttl).toBe(3600);
      expect(mem?.expireAt).toBeGreaterThan(Date.now());
    });

    it('returns undefined for non-existent key', () => {
      expect(mp.read('nonexistent')).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes memory entry', () => {
      mp.write('key1', 'val1', 'agent1');
      expect(mp.delete('key1')).toBe(true);
      expect(mp.read('key1')).toBeUndefined();
    });

    it('returns false when deleting non-existent key', () => {
      expect(mp.delete('nonexistent')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns all memory entries', () => {
      mp.write('key1', 'val1', 'a');
      mp.write('key2', 'val2', 'b');
      mp.write('key3', 'val3', 'c');
      const all = mp.getAll();
      expect(all.length).toBe(3);
    });
  });

  describe('queryByTag', () => {
    it('queries memory by tag', () => {
      mp.write('key1', 'val1', 'a', ['project']);
      mp.write('key2', 'val2', 'b', ['research']);
      mp.write('key3', 'val3', 'c', ['project', 'important']);
      const project = mp.queryByTag('project');
      expect(project.length).toBe(2);
      expect(project.map(m => m.key)).toContain('key1');
      expect(project.map(m => m.key)).toContain('key3');
    });

    it('returns empty array for non-existent tag', () => {
      mp.write('key1', 'val1', 'a', ['project']);
      expect(mp.queryByTag('nonexistent')).toEqual([]);
    });
  });

  describe('cleanupExpired', () => {
    it('removes expired entries', () => {
      // Create expired entry directly in DB
      const now = Date.now();
      (db as any).data.memory.push({ key: 'expired', value: 'v', tags: [], ttl: 1, expireAt: now - 1000, updatedAt: now, updatedBy: 'a' });
      mp.write('valid', 'v', 'a', [], 0);
      const removed = mp.cleanupExpired();
      expect(removed).toBe(1);
      expect(mp.getAll().map(m => m.key)).toEqual(['valid']);
    });
  });

  describe('subscriber notifications', () => {
    it('notifies subscribers on memory write', () => {
      const notifications: any[] = [];
      mp.subscribe('agent1', (msg) => notifications.push(msg));
      mp.write('key1', 'val1', 'agent1', [], 0);
      mp.unsubscribe('agent1');
      expect(notifications.length).toBe(1);
      expect(notifications[0].type).toBe('memory_write');
    });

    it('unsubscribe stops notifications', () => {
      const notifications: any[] = [];
      mp.subscribe('agent1', (msg) => notifications.push(msg));
      mp.unsubscribe('agent1');
      mp.write('key1', 'val1', 'agent1');
      expect(notifications.length).toBe(0);
    });
  });

  describe('Semantic Recall (v0.4)', () => {
    it('returns empty for stop-word-only query', () => {
      mp.write('key1', 'the quick brown fox jumps', 'a');
      expect(mp.recall('the is a').length).toBe(0);
    });

    it('returns matching entries for keyword query', () => {
      mp.write('proj', 'my awesome project', 'a', ['project']);
      mp.write('other', 'something else', 'b');
      const results = mp.recall('awesome project');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].key).toBe('proj');
    });

    it('boosts tag matches over value-only matches', () => {
      mp.write('a', 'nodejs code', 'a', ['backend']);
      mp.write('b', 'backend server setup', 'b', []);
      const results = mp.recall('backend');
      expect(results[0].key).toBe('a'); // tag match scores higher
    });

    it('applies intent filter to boost related tags', () => {
      mp.write('a', 'deploy script', 'a', ['devops']);
      mp.write('b', 'deploy docker container', 'b', ['devops', 'docker']);
      const results = mp.recall('deploy', 'docker');
      expect(results[0].key).toBe('b'); // intent=docker boosts docker tag
    });

    it('respects limit parameter', () => {
      mp.write('k1', 'apple fruit', 'a');
      mp.write('k2', 'banana fruit', 'a');
      mp.write('k3', 'cherry fruit', 'a');
      mp.write('k4', 'date fruit', 'a');
      mp.write('k5', 'elderberry', 'a');
      const results = mp.recall('fruit', undefined, 3);
      expect(results.length).toBe(3);
    });

    it('returns empty for non-matching query', () => {
      mp.write('key1', 'nodejs server', 'a');
      expect(mp.recall('python django flask elasticsearch').length).toBe(0);
    });
  });

  describe('Memory Versioning (v0.4)', () => {
    it('getVersions returns empty array for new key', () => {
      mp.write('key1', 'val1', 'agent1');
      expect(mp.getVersions('key1')).toEqual([]);
    });

    it('getVersions returns versions when key is updated', () => {
      mp.write('key1', 'val1', 'agent1');
      mp.write('key1', 'val2', 'agent2');
      const versions = mp.getVersions('key1');
      expect(versions.length).toBe(1);
      expect(versions[0].value).toBe('val1');
      expect(versions[0].version).toBe(1);
      expect(versions[0].updatedBy).toBe('agent1');
    });

    it('getVersions returns multiple versions in descending order', () => {
      mp.write('key1', 'v1', 'a1', ['tag1'], 100);
      mp.write('key1', 'v2', 'a2', ['tag2'], 200);
      mp.write('key1', 'v3', 'a3', ['tag3'], 300);
      const versions = mp.getVersions('key1');
      expect(versions.length).toBe(2);
      // Newest first
      expect(versions[0].value).toBe('v2');
      expect(versions[0].version).toBe(2);
      expect(versions[0].tags).toEqual(['tag2']);
      expect(versions[0].ttl).toBe(200);
      expect(versions[1].value).toBe('v1');
      expect(versions[1].version).toBe(1);
      expect(versions[1].tags).toEqual(['tag1']);
      expect(versions[1].ttl).toBe(100);
    });

    it('current value is preserved, only old values in versions', () => {
      mp.write('key1', 'current', 'agent1');
      mp.write('key1', 'old', 'agent2');
      const mem = mp.read('key1');
      expect(mem?.value).toBe('old');
      expect(mem?.updatedBy).toBe('agent2');
      const versions = mp.getVersions('key1');
      expect(versions.length).toBe(1);
      expect(versions[0].value).toBe('current'); // first value saved as version
    });

    it('getVersions returns empty for non-existent key', () => {
      expect(mp.getVersions('nonexistent')).toEqual([]);
    });

    it('getVersions does not affect other keys', () => {
      mp.write('key1', 'val1', 'a1');
      mp.write('key1', 'val2', 'a2');
      mp.write('key2', 'other', 'a1');
      const v1 = mp.getVersions('key1');
      const v2 = mp.getVersions('key2');
      expect(v1.length).toBe(1);
      expect(v2.length).toBe(0);
    });
  });
});
