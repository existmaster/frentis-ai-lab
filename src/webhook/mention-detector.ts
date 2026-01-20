/**
 * Mention Detector
 * Parses @mentions from issue/comment body
 */

export interface MentionResult {
  isMentioned: boolean;
  mentionedAt: number; // Position in text where mention was found
  mentionType: 'direct' | 'reply' | 'none';
}

export class MentionDetector {
  private botUsername: string;
  private mentionPatterns: RegExp[];

  constructor(botUsername: string) {
    this.botUsername = botUsername;

    // Create patterns for both @username and @username[bot]
    const escapedUsername = this.escapeRegExp(botUsername);
    this.mentionPatterns = [
      new RegExp(`@${escapedUsername}(?:\\[bot\\])?\\b`, 'i'),
      new RegExp(`@${escapedUsername}(?:\\[bot\\])?(?:\\s|$)`, 'i'),
    ];
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Check if the bot is mentioned in the text
   */
  detect(text: string): MentionResult {
    if (!text) {
      return { isMentioned: false, mentionedAt: -1, mentionType: 'none' };
    }

    for (const pattern of this.mentionPatterns) {
      const match = pattern.exec(text);
      if (match) {
        return {
          isMentioned: true,
          mentionedAt: match.index,
          mentionType: 'direct',
        };
      }
    }

    return { isMentioned: false, mentionedAt: -1, mentionType: 'none' };
  }

  /**
   * Extract the message content after the mention
   */
  extractMessageAfterMention(text: string): string | null {
    const result = this.detect(text);
    if (!result.isMentioned) {
      return null;
    }

    // Find the mention and extract everything after it
    for (const pattern of this.mentionPatterns) {
      const match = pattern.exec(text);
      if (match) {
        const afterMention = text.slice(match.index + match[0].length).trim();
        return afterMention || null;
      }
    }

    return null;
  }

  /**
   * Check if this is a reply to the bot (quoted reply)
   */
  isReplyToBot(text: string, previousBotComment?: string): boolean {
    if (!previousBotComment) return false;

    // Check for GitHub's quote syntax (lines starting with >)
    const quotePattern = /^>\s*.+$/m;
    if (!quotePattern.test(text)) return false;

    // Extract quoted content
    const quotedLines = text
      .split('\n')
      .filter((line) => line.startsWith('>'))
      .map((line) => line.slice(1).trim())
      .join(' ');

    // Check if quoted content is from bot's previous comment
    return previousBotComment.includes(quotedLines.slice(0, 50));
  }

  /**
   * Get the bot username (for reference)
   */
  getBotUsername(): string {
    return this.botUsername;
  }
}
