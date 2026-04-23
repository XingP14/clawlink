/**
 * Ollama provider stub.
 * Connects to a local Ollama instance for self-hosted models.
 * Enable by setting OLLAMA_BASE_URL (default http://localhost:11434).
 */

import type {
  AIProvider,
  ImportanceResult,
  ExtractionResult,
  UsageHistoryEntry,
} from '../types.js';

export class OllamaProvider implements AIProvider {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  }

  async scoreMemory(
    _key: string,
    _content: string,
    _usageHistory: UsageHistoryEntry[],
  ): Promise<ImportanceResult> {
    return {
      success: true,
      score: 5,
      reasoning: `Ollama stub ready at ${this.baseUrl}`,
    };
  }

  async extractSession(session: {
    id: string;
    transcript: string;
    summary?: string;
    tags?: string[];
  }): Promise<ExtractionResult> {
    void session;
    return {
      success: true,
      summary: 'Ollama stub is ready for local model wiring',
      tags: ['ollama', 'stub'],
      keyEvents: [],
      entities: [],
    };
  }
}
