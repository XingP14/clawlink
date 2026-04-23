/**
 * ExtractionEngine — orchestrates AI-powered memory scoring, session
 * extraction, and memory reranking.
 *
 * Coordinates between the AI provider (OpenAI/Anthropic/Ollama) and the
 * DB layer to score, summarize, and rank memories.
 */

import { createRequire } from 'module';
import type { AIProvider, ExtractionConfig } from './types.js';
import type { ImportanceResult, ExtractionResult, RerankedMemory } from './types.js';

const require = createRequire(import.meta.url);

function loadProvider(provider: NonNullable<ExtractionConfig['provider']>, config: ExtractionConfig): AIProvider {
  switch (provider) {
    case 'anthropic':
      return new (require('./providers/anthropic.js').AnthropicProvider)(config.apiKey);
    case 'ollama':
      return new (require('./providers/ollama.js').OllamaProvider)(config.baseUrl);
    case 'openai':
    default:
      return new (require('./providers/openai.js').OpenAIProvider)(config.apiKey);
  }
}

export function createExtractionProvider(config: ExtractionConfig = {}): AIProvider {
  const provider = config.provider ?? 'openai';

  return loadProvider(provider, config);
}

export function createExtractionEngine(config: ExtractionConfig = {}): ExtractionEngine {
  return new ExtractionEngine(createExtractionProvider(config), config);
}

export class ExtractionEngine {
  private batchSize: number;
  private batchIntervalMs: number;

  constructor(
    private provider: AIProvider,
    config: Partial<ExtractionConfig> = {},
  ) {
    this.batchSize = Math.max(1, config.batchSize ?? 10);
    this.batchIntervalMs = Math.max(0, config.batchIntervalMs ?? 1000);
  }

  /**
   * Score a memory's importance.
   * Calls the configured AI provider.
   */
  async scoreMemory(
    key: string,
    content: string,
    usageHistory: Array<{ accessedAt: number; query?: string }>,
  ): Promise<ImportanceResult> {
    return this.provider.scoreMemory(key, content, usageHistory);
  }

  /**
   * Extract summary and tags from a session transcript.
   * Returns structured ExtractionResult.
   */
  async extractSession(session: {
    id: string;
    transcript: string;
    summary?: string;
    tags?: string[];
  }): Promise<ExtractionResult> {
    return this.provider.extractSession(session);
  }

  /**
   * Process queued items in batch mode with simple pacing.
   */
  async processBatch<T>(
    queue: T[],
    worker: (item: T) => Promise<void>,
  ): Promise<number> {
    let processed = 0;

    for (let i = 0; i < queue.length && processed < this.batchSize; i++) {
      if (processed > 0 && this.batchIntervalMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.batchIntervalMs));
      }

      await worker(queue[i]);
      processed++;
    }

    return processed;
  }

  /**
   * Rank memory keys using Reciprocal Rank Fusion (RRF).
   *
   * Takes multiple ranked lists (e.g. from BM25, vector search, recency)
   * and fuses them into a single ranked list.
   *
   * @param rankLists Array of { key, rank }[] — one per retrieval strategy
   * @param topK Return top K results
   */
  rankMemories(
    rankLists: Array<Array<{ key: string; rank: number }>>,
    topK = 10,
  ): RerankedMemory[] {
    const scores = new Map<string, number>();

    for (const list of rankLists) {
      for (let i = 0; i < list.length; i++) {
        const { key, rank } = list[i];
        // RRF formula: 1 / (k + rank), k=60 is standard
        const rrf = 1 / (60 + i + 1);
        const current = scores.get(key) ?? 0;
        scores.set(key, current + rrf * (rank > 0 ? rank : 1));
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([key, score]) => ({ key, score: Math.round(score * 1000) / 1000, reason: '' }));
  }
}
