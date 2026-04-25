/**
 * Session Archiver — archives sessions to JSONL/ZIP before eviction.
 * Supports restore for recovery scenarios.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import type { DBSession } from './types.js';

const gzip = promisify(zlib.gzip);

export interface ArchivedSession {
  sessionId: string;
  archivedAt: number;
  filePath: string;
  sizeBytes: number;
}

export interface ArchiveStats {
  archivedCount: number;
  totalSizeBytes: number;
  oldestArchivedAt: number | null;
}

export class SessionArchiver {
  private archiveDir: string;

  constructor(archiveDir: string = './data/archive') {
    this.archiveDir = archiveDir;
    fs.mkdirSync(this.archiveDir, { recursive: true });
  }

  /**
   * Archive a session to gzip-compressed JSONL.
   */
  async archiveSession(session: DBSession): Promise<ArchivedSession> {
    const date = new Date(session.startedAt);
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const subDir = path.join(this.archiveDir, yearMonth);
    fs.mkdirSync(subDir, { recursive: true });

    const fileName = `${session.id}.jsonl.gz`;
    const filePath = path.join(subDir, fileName);

    const jsonLine = JSON.stringify({
      ...session,
      _archivedAt: Date.now(),
    }) + '\n';
    const compressed = await gzip(Buffer.from(jsonLine));
    fs.writeFileSync(filePath, compressed);

    const stats = fs.statSync(filePath);
    return {
      sessionId: session.id,
      archivedAt: Date.now(),
      filePath,
      sizeBytes: stats.size,
    };
  }

  /**
   * Restore a session from archive.
   */
  async restoreSession(sessionId: string): Promise<DBSession | null> {
    // Search all archive subdirs
    const entries = fs.readdirSync(this.archiveDir);
    for (const entry of entries) {
      const filePath = path.join(this.archiveDir, entry, `${sessionId}.jsonl.gz`);
      if (fs.existsSync(filePath)) {
        const compressed = fs.readFileSync(filePath);
        const decompressed = zlib.gunzipSync(compressed);
        const line = decompressed.toString().trim();
        const obj = JSON.parse(line);
        delete obj._archivedAt;
        return obj as DBSession;
      }
    }
    return null;
  }

  /**
   * List all archived sessions.
   */
  listArchived(): ArchivedSession[] {
    const result: ArchivedSession[] = [];
    if (!fs.existsSync(this.archiveDir)) return result;

    for (const yearMonth of fs.readdirSync(this.archiveDir)) {
      const subDir = path.join(this.archiveDir, yearMonth);
      if (!fs.statSync(subDir).isDirectory()) continue;

      for (const file of fs.readdirSync(subDir)) {
        if (!file.endsWith('.jsonl.gz')) continue;
        const sessionId = file.replace('.jsonl.gz', '');
        const filePath = path.join(subDir, file);
        const stats = fs.statSync(filePath);
        result.push({
          sessionId,
          archivedAt: stats.mtimeMs,
          filePath,
          sizeBytes: stats.size,
        });
      }
    }
    return result.sort((a, b) => a.archivedAt - b.archivedAt);
  }

  /**
   * Archive stats summary.
   */
  stats(): ArchiveStats {
    const archived = this.listArchived();
    return {
      archivedCount: archived.length,
      totalSizeBytes: archived.reduce((sum, a) => sum + a.sizeBytes, 0),
      oldestArchivedAt: archived.length > 0 ? archived[0].archivedAt : null,
    };
  }
}
