/**
 * Context Collector
 * Gathers relevant context from the repository for better analysis
 */

import { createGitHubClient, type IGitHubClient } from '../github/client';
import type { IssueContext, RelatedIssue } from '../types';

export interface CollectedContext {
  relatedIssues: RelatedIssue[];
  recentPRs: Array<{
    number: number;
    title: string;
    state: string;
    merged: boolean;
  }>;
  recentCommits?: Array<{
    sha: string;
    message: string;
  }>;
}

export class ContextCollector {
  private githubClient: IGitHubClient;

  constructor(githubClient?: IGitHubClient) {
    this.githubClient = githubClient || createGitHubClient();
  }

  /**
   * Collect all relevant context for an issue
   */
  async collect(context: IssueContext): Promise<CollectedContext> {
    const { owner, name } = context.repository;
    const keywords = this.extractKeywords(context.issue.title, context.issue.body);

    // Collect in parallel
    const [relatedIssues, recentPRs] = await Promise.all([
      this.findRelatedIssues(owner, name, keywords),
      this.getRecentPRs(owner, name),
    ]);

    return {
      relatedIssues,
      recentPRs,
    };
  }

  private extractKeywords(title: string, body: string | null): string {
    // Simple keyword extraction - could be enhanced with NLP
    const text = `${title} ${body || ''}`;
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .filter((w) => !STOP_WORDS.has(w));

    // Return top keywords
    return [...new Set(words)].slice(0, 5).join(' ');
  }

  private async findRelatedIssues(
    owner: string,
    repo: string,
    keywords: string
  ): Promise<RelatedIssue[]> {
    try {
      return await this.githubClient.findSimilarIssues(owner, repo, keywords, 5);
    } catch {
      return [];
    }
  }

  private async getRecentPRs(owner: string, repo: string) {
    try {
      const prs = await this.githubClient.getRecentPRs(owner, repo, 5) as Array<{
        number: number;
        title: string;
        state: string;
        mergedAt?: string | null;
      }>;
      return prs.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        merged: pr.mergedAt !== null,
      }));
    } catch {
      return [];
    }
  }
}

const STOP_WORDS = new Set([
  'the', 'this', 'that', 'with', 'from', 'have', 'been',
  'will', 'would', 'could', 'should', 'when', 'where',
  'what', 'which', 'there', 'their', 'they', 'them',
  'some', 'other', 'about', 'into', 'more', 'also',
]);
