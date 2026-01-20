/**
 * GitHub API Client
 * Uses gh CLI for local development, can switch to Octokit for production
 */

import { $ } from 'bun';
import type { RelatedIssue } from '../types';

export interface IGitHubClient {
  addLabels(owner: string, repo: string, issueNumber: number, labels: string[]): Promise<void>;
  createComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void>;
  getIssue(owner: string, repo: string, issueNumber: number): Promise<unknown>;
  findSimilarIssues(owner: string, repo: string, query: string, limit?: number): Promise<RelatedIssue[]>;
  getRecentClosedIssues(owner: string, repo: string, limit?: number): Promise<unknown[]>;
  getRecentPRs(owner: string, repo: string, limit?: number): Promise<unknown[]>;
  cloneRepo(owner: string, repo: string, localPath: string): Promise<void>;
}

/**
 * gh CLI based implementation (for local development)
 */
export class GhCliClient implements IGitHubClient {
  async addLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[]
  ): Promise<void> {
    const labelArgs = labels.join(',');
    await $`gh issue edit ${issueNumber} --repo ${owner}/${repo} --add-label ${labelArgs}`;
  }

  async createComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<void> {
    await $`gh issue comment ${issueNumber} --repo ${owner}/${repo} --body ${body}`;
  }

  async getIssue(owner: string, repo: string, issueNumber: number) {
    const result = await $`gh issue view ${issueNumber} --repo ${owner}/${repo} --json number,title,body,author,labels,createdAt,url`.json();
    return result;
  }

  async findSimilarIssues(
    owner: string,
    repo: string,
    query: string,
    limit = 5
  ): Promise<RelatedIssue[]> {
    try {
      const result = await $`gh search issues --repo ${owner}/${repo} ${query} --limit ${limit} --json number,title,state`.json() as Array<{
        number: number;
        title: string;
        state: string;
      }>;

      return result.map((item) => ({
        number: item.number,
        title: item.title,
        similarity: 0, // gh CLI doesn't provide similarity score
        status: item.state as 'open' | 'closed',
      }));
    } catch {
      return [];
    }
  }

  async getRecentClosedIssues(owner: string, repo: string, limit = 10) {
    const result = await $`gh issue list --repo ${owner}/${repo} --state closed --limit ${limit} --json number,title,body,labels,createdAt`.json();
    return result as unknown[];
  }

  async getRecentPRs(owner: string, repo: string, limit = 10) {
    const result = await $`gh pr list --repo ${owner}/${repo} --state all --limit ${limit} --json number,title,state,mergedAt`.json();
    return result as unknown[];
  }

  async cloneRepo(owner: string, repo: string, localPath: string): Promise<void> {
    await $`gh repo clone ${owner}/${repo} ${localPath} -- --depth 1`;
  }
}

/**
 * Octokit based implementation (for production with token)
 * Uncomment and use when deploying to server
 */
/*
import { Octokit } from '@octokit/rest';

export class OctokitClient implements IGitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async addLabels(owner: string, repo: string, issueNumber: number, labels: string[]): Promise<void> {
    await this.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels,
    });
  }

  async createComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  }

  // ... implement other methods similarly
}
*/

// Factory function to create the appropriate client
export function createGitHubClient(_token?: string): IGitHubClient {
  // For now, always use gh CLI
  // Later: return token ? new OctokitClient(token) : new GhCliClient();
  return new GhCliClient();
}

// Default export for backward compatibility
export const GitHubClient = GhCliClient;
