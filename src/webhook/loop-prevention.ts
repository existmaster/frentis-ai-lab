/**
 * Loop Prevention
 * Prevents infinite loops from bot responding to itself
 */

export interface LoopCheckResult {
  shouldIgnore: boolean;
  reason?: 'bot_author' | 'recent_response' | 'duplicate_event';
}

interface RecentResponse {
  issueNumber: number;
  timestamp: number;
  eventId: string;
}

export class LoopPrevention {
  private botUsername: string;
  private recentResponses: Map<string, RecentResponse> = new Map();
  private processedEvents: Set<string> = new Set();

  // Cooldown period: don't respond to same issue within this time (ms)
  private readonly cooldownMs: number;
  // Max tracked responses (prevent memory leak)
  private readonly maxTracked: number;

  constructor(
    botUsername: string,
    options: { cooldownMs?: number; maxTracked?: number } = {}
  ) {
    this.botUsername = botUsername;
    this.cooldownMs = options.cooldownMs ?? 30_000; // 30 seconds default
    this.maxTracked = options.maxTracked ?? 1000;
  }

  /**
   * Check if the event should be ignored
   */
  check(
    author: string,
    issueKey: string, // e.g., "owner/repo#123"
    eventId: string
  ): LoopCheckResult {
    // 1. Check if author is the bot
    if (this.isBotUser(author)) {
      return { shouldIgnore: true, reason: 'bot_author' };
    }

    // 2. Check for duplicate event (webhook retry)
    if (this.processedEvents.has(eventId)) {
      return { shouldIgnore: true, reason: 'duplicate_event' };
    }

    // 3. Check cooldown period
    const recent = this.recentResponses.get(issueKey);
    if (recent && Date.now() - recent.timestamp < this.cooldownMs) {
      return { shouldIgnore: true, reason: 'recent_response' };
    }

    return { shouldIgnore: false };
  }

  /**
   * Mark an event as processed
   */
  markProcessed(eventId: string): void {
    this.processedEvents.add(eventId);

    // Cleanup old events (keep last N)
    if (this.processedEvents.size > this.maxTracked) {
      const toDelete = Array.from(this.processedEvents).slice(
        0,
        this.processedEvents.size - this.maxTracked
      );
      toDelete.forEach((id) => this.processedEvents.delete(id));
    }
  }

  /**
   * Record a response to an issue
   */
  recordResponse(issueKey: string, eventId: string): void {
    this.recentResponses.set(issueKey, {
      issueNumber: this.extractIssueNumber(issueKey),
      timestamp: Date.now(),
      eventId,
    });

    // Cleanup old responses
    if (this.recentResponses.size > this.maxTracked) {
      const entries = Array.from(this.recentResponses.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, entries.length - this.maxTracked);
      toDelete.forEach(([key]) => this.recentResponses.delete(key));
    }
  }

  /**
   * Check if username belongs to the bot
   */
  private isBotUser(username: string): boolean {
    return (
      username === this.botUsername ||
      username === `${this.botUsername}[bot]` ||
      username.endsWith('[bot]')
    );
  }

  private extractIssueNumber(issueKey: string): number {
    const match = issueKey.match(/#(\d+)$/);
    return match?.[1] ? parseInt(match[1], 10) : 0;
  }

  /**
   * Get statistics
   */
  stats(): { processedEvents: number; trackedResponses: number } {
    return {
      processedEvents: this.processedEvents.size,
      trackedResponses: this.recentResponses.size,
    };
  }

  /**
   * Clear all tracking (for testing)
   */
  clear(): void {
    this.processedEvents.clear();
    this.recentResponses.clear();
  }
}
