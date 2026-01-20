/**
 * GitHub App Authentication
 * Handles JWT generation and Installation Token retrieval
 */

import { createAppAuth } from '@octokit/auth-app';
import type { GitHubAppConfig } from '../types';
import { tokenCache } from './token-cache';

export class GitHubAppAuth {
  private appId: string;
  private privateKeyPromise: Promise<string>;
  private botUsername: string;

  constructor(config: GitHubAppConfig) {
    this.appId = config.appId;
    this.privateKeyPromise = this.loadPrivateKey(config.privateKeyPath);
    this.botUsername = config.botUsername;
  }

  private async loadPrivateKey(keyPath: string): Promise<string> {
    try {
      const file = Bun.file(keyPath);
      return await file.text();
    } catch (error) {
      throw new Error(`Failed to load private key from ${keyPath}: ${error}`);
    }
  }

  /**
   * Get a valid installation token, refreshing if needed
   */
  async getInstallationToken(installationId: number): Promise<string> {
    // Check cache first
    const cached = tokenCache.get(installationId);
    if (cached) {
      return cached;
    }

    // Generate new token
    const privateKey = await this.privateKeyPromise;
    const auth = createAppAuth({
      appId: this.appId,
      privateKey,
    });

    const { token, expiresAt } = await auth({
      type: 'installation',
      installationId,
    });

    // Cache the token
    tokenCache.set(installationId, token, expiresAt);

    console.log(`[AUTH] New installation token generated, expires at ${expiresAt}`);

    return token;
  }

  /**
   * Get installation ID from webhook payload
   */
  static getInstallationIdFromPayload(payload: { installation?: { id: number } }): number | null {
    return payload.installation?.id ?? null;
  }

  /**
   * Get the bot username for mention detection
   */
  getBotUsername(): string {
    return this.botUsername;
  }

  /**
   * Check if a username is the bot
   */
  isBotUser(username: string): boolean {
    // GitHub App bots have [bot] suffix
    return (
      username === this.botUsername ||
      username === `${this.botUsername}[bot]` ||
      username.endsWith('[bot]')
    );
  }
}
