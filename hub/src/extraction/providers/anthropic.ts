/**
 * Anthropic provider stub.
 * Currently returns error — plug in your Anthropic API key via env var
 * ANTHROPIC_API_KEY to enable.
 */

import type {
  AIProvider,
  ImportanceResult,
  ExtractionResult,
  UsageHistoryEntry,
} from '../types.js';

export class AnthropicProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  }

  async scoreMemory(
    _key: string,
    _content: string,
    _usageHistory: UsageHistoryEntry[],
  ): Promise<ImportanceResult> {
    if (!this.apiKey) {
      return {
        success: false,
        score: 5,
        reasoning: 'Anthropic provider not configured (ANTHROPIC_API_KEY not set)',
      };
    }
    return {
      success: false,
      score: 5,
      reasoning: 'Anthropic extraction not yet implemented',
    };
  }

  async extractSession(session: {
    id: string;
    transcript: string;
    summary?: string;
    tags?: string[];
  }): Promise<ExtractionResult> {
    void session;
    if (!this.apiKey) {
      return {
        success: false,
        summary: 'Anthropic provider not configured',
        tags: [],
      };
    }
    return {
      success: false,
      summary: 'Anthropic extraction not yet implemented',
      tags: [],
    };
  }
}
