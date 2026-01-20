/**
 * GitHub API Client
 * Uses Octokit with GitHub App authentication for production
 * Falls back to gh CLI for local development
 */

import { $ } from 'bun';
import { Octokit } from '@octokit/rest';
import type { RelatedIssue, CommentInfo, GitHubAppConfig } from '../types';
import { GitHubAppAuth } from './auth';

export interface IGitHubClient {
  addLabels(owner: string, repo: string, issueNumber: number, labels: string[]): Promise<void>;
  createComment(owner: string, repo: string, issueNumber: number, body: string): Promise<{ id: number }>;
  getIssue(owner: string, repo: string, issueNumber: number): Promise<unknown>;
  getIssueComments(owner: string, repo: string, issueNumber: number): Promise<CommentInfo[]>;
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
  ): Promise<{ id: number }> {
    await $`gh issue comment ${issueNumber} --repo ${owner}/${repo} --body ${body}`;
    // gh CLI doesn't return the comment ID, return dummy
    return { id: 0 };
  }

  async getIssueComments(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<CommentInfo[]> {
    const result = await $`gh issue view ${issueNumber} --repo ${owner}/${repo} --json comments`.json() as {
      comments: Array<{
        id: string;
        author: { login: string };
        body: string;
        createdAt: string;
      }>;
    };

    return result.comments.map((c) => ({
      id: parseInt(c.id, 10),
      author: c.author.login,
      body: c.body,
      createdAt: c.createdAt,
      isBot: c.author.login.endsWith('[bot]'),
    }));
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
 * Octokit based implementation (for production with GitHub App)
 */
export class OctokitClient implements IGitHubClient {
  private auth: GitHubAppAuth;
  private installationId: number;
  private octokitCache: Octokit | null = null;

  constructor(config: GitHubAppConfig, installationId: number) {
    this.auth = new GitHubAppAuth(config);
    this.installationId = installationId;
  }

  private async getOctokit(): Promise<Octokit> {
    const token = await this.auth.getInstallationToken(this.installationId);
    // Create new Octokit with fresh token each time (token might have been refreshed)
    return new Octokit({ auth: token });
  }

  async addLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[]
  ): Promise<void> {
    const octokit = await this.getOctokit();
    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels,
    });
  }

  async createComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<{ id: number }> {
    const octokit = await this.getOctokit();
    const response = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
    return { id: response.data.id };
  }

  async getIssue(owner: string, repo: string, issueNumber: number) {
    const octokit = await this.getOctokit();
    const response = await octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    return response.data;
  }

  async getIssueComments(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<CommentInfo[]> {
    const octokit = await this.getOctokit();
    const response = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    return response.data.map((c) => ({
      id: c.id,
      author: c.user?.login || 'unknown',
      body: c.body || '',
      createdAt: c.created_at,
      isBot: c.user?.login?.endsWith('[bot]') || false,
    }));
  }

  async findSimilarIssues(
    owner: string,
    repo: string,
    query: string,
    limit = 5
  ): Promise<RelatedIssue[]> {
    try {
      const octokit = await this.getOctokit();
      const response = await octokit.search.issuesAndPullRequests({
        q: `${query} repo:${owner}/${repo} is:issue`,
        per_page: limit,
      });

      return response.data.items.map((item) => ({
        number: item.number,
        title: item.title,
        similarity: 0,
        status: item.state as 'open' | 'closed',
      }));
    } catch {
      return [];
    }
  }

  async getRecentClosedIssues(owner: string, repo: string, limit = 10) {
    const octokit = await this.getOctokit();
    const response = await octokit.issues.listForRepo({
      owner,
      repo,
      state: 'closed',
      per_page: limit,
      sort: 'updated',
      direction: 'desc',
    });
    return response.data;
  }

  async getRecentPRs(owner: string, repo: string, limit = 10) {
    const octokit = await this.getOctokit();
    const response = await octokit.pulls.list({
      owner,
      repo,
      state: 'all',
      per_page: limit,
      sort: 'updated',
      direction: 'desc',
    });
    return response.data;
  }

  async cloneRepo(owner: string, repo: string, localPath: string): Promise<void> {
    // Use git CLI for cloning (Octokit doesn't support this directly)
    await $`git clone --depth 1 https://github.com/${owner}/${repo}.git ${localPath}`;
  }

  getBotUsername(): string {
    return this.auth.getBotUsername();
  }

  isBotUser(username: string): boolean {
    return this.auth.isBotUser(username);
  }
}

// Factory function to create the appropriate client
export function createGitHubClient(
  config?: GitHubAppConfig,
  installationId?: number
): IGitHubClient {
  if (config && installationId) {
    return new OctokitClient(config, installationId);
  }
  // Fallback to gh CLI for local development
  return new GhCliClient();
}

// Default export for backward compatibility
export const GitHubClient = GhCliClient;
