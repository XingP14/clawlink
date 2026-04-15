/**
 * SessionStore — business logic layer over ClawDB session operations.
 * Wraps low-level DB calls with typed, intentful session management.
 */

import type { ClawDB } from './db.js';
import type { DBSession } from './types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class SessionStore {
  constructor(private db: ClawDB) {}

  // ─── Core CRUD ────────────────────────────────────────────────────────────

  /**
   * Register a new session in the store.
   * Calls setSession (INSERT OR REPLACE) on the DB layer.
   */
  async registerSession(session: DBSession): Promise<void> {
    // Enforce defaults/constraints at store layer
    const normalized: DBSession = {
      ...session,
      importance: clamp(session.importance, 0, 10),
      accessCount: session.accessCount ?? 0,
      tags: session.tags ?? [],
      extracted: session.extracted ?? false,
      flagged: session.flagged ?? false,
      createdAt: session.createdAt ?? Date.now(),
    };
    await this.db.setSession(normalized);
  }

  /**
   * Update mutable fields of an existing session.
   * Partial updates are merged with the existing record.
   */
  async updateSession(id: string, updates: Partial<DBSession>): Promise<void> {
    const existing = await this.db.getSession(id);
    if (!existing) {
      throw new Error(`Session not found: ${id}`);
    }

    const updated: DBSession = {
      ...existing,
      ...updates,
      // Always preserve id, agentId, framework, createdAt
      id: existing.id,
      agentId: existing.agentId,
      framework: existing.framework,
      createdAt: existing.createdAt,
      // Clamp importance if provided
      importance: updates.importance !== undefined
        ? clamp(updates.importance, 0, 10)
        : existing.importance,
    };

    await this.db.setSession(updated);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  /**
   * Get a single session by id.
   * Returns undefined if not found.
   */
  async getSession(id: string): Promise<DBSession | undefined> {
    return this.db.getSession(id);
  }

  /**
   * List sessions with optional filtering by agentId and/or framework.
   * Supports pagination via limit/offset.
   */
  async listSessions(
    agentId?: string,
    framework?: string,
    limit = 50,
    offset = 0,
  ): Promise<DBSession[]> {
    return this.db.getAllSessions(agentId, framework, limit, offset);
  }

  /**
   * Full-text search across transcript and summary.
   * Returns matching sessions ordered by recency.
   */
  async searchSessions(query: string, limit = 20): Promise<DBSession[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return this.db.sessionSearch(query.trim(), limit);
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  /**
   * Delete a session by id.
   * Returns true if a session was deleted, false if it didn't exist.
   */
  async deleteSession(id: string): Promise<boolean> {
    return this.db.deleteSession(id);
  }

  /**
   * Flag or unflag a session as important.
   */
  async flagSession(id: string, flagged: boolean): Promise<void> {
    const existing = await this.db.getSession(id);
    if (!existing) {
      throw new Error(`Session not found: ${id}`);
    }
    await this.db.setSession({ ...existing, flagged });
  }

  /**
   * Mark a session as extracted (AI extraction complete).
   */
  async markExtracted(id: string): Promise<void> {
    const existing = await this.db.getSession(id);
    if (!existing) {
      throw new Error(`Session not found: ${id}`);
    }
    await this.db.setSession({ ...existing, extracted: true });
  }

  /**
   * Increment the access-count and update last-accessed timestamp.
   * Called whenever a session is read/used.
   */
  async incrementAccessCount(id: string): Promise<void> {
    const existing = await this.db.getSession(id);
    if (!existing) {
      throw new Error(`Session not found: ${id}`);
    }
    await this.db.setSession({
      ...existing,
      accessCount: (existing.accessCount ?? 0) + 1,
      lastAccessedAt: Date.now(),
    });
  }

  /**
   * Record a feedback adjustment for a session's importance score.
   * adjustment is clamped to [-5, +5] per call.
   * Cumulative adjustments are applied at the eviction/retrieval layer.
   */
  async addFeedback(
    sessionId: string,
    agentId: string,
    adjustment: number,
    reason?: string,
  ): Promise<void> {
    const clamped = clamp(adjustment, -5, 5);
    await this.db.addSessionFeedback(sessionId, agentId, clamped, reason);
  }
}
