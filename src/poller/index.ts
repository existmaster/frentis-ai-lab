/**
 * Issue Poller
 * Periodically checks for new issues and processes them
 */

import { $ } from 'bun';
import { createGitHubClient, type IGitHubClient } from '../github/client';
import { ClaudeAgent } from '../claude/agent';
import type { RepoConfig, IssueContext } from '../types';

export class IssuePoller {
  private githubClient: IGitHubClient;
  private claudeAgent: ClaudeAgent;
  private repos: RepoConfig[];
  private processedIssues: Set<string> = new Set();
  private processingIssues: Set<string> = new Set(); // Currently being processed
  private intervalId: Timer | null = null;
  private intervalMs: number;

  constructor(repos: RepoConfig[], intervalMs = 30000) {
    this.githubClient = createGitHubClient();
    this.claudeAgent = new ClaudeAgent();
    this.repos = repos.filter((r) => r.enabled);
    this.intervalMs = intervalMs;
  }

  /**
   * Start polling
   */
  start() {
    if (this.intervalId) {
      console.log('[POLLER] Already running');
      return;
    }

    console.log(`[POLLER] Started (interval: ${this.intervalMs / 1000}s)`);
    console.log(`[POLLER] Watching repos: ${this.repos.map((r) => `${r.owner}/${r.name}`).join(', ')}`);

    // Initial check
    this.checkAllRepos();

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkAllRepos();
    }, this.intervalMs);
  }

  /**
   * Stop polling
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[POLLER] Stopped');
    }
  }

  /**
   * Add a repo to watch
   */
  addRepo(repo: RepoConfig) {
    if (repo.enabled) {
      this.repos.push(repo);
      console.log(`[POLLER] Added repo: ${repo.owner}/${repo.name}`);
    }
  }

  /**
   * Check all repos for new issues
   */
  private async checkAllRepos() {
    for (const repo of this.repos) {
      try {
        await this.checkRepo(repo);
      } catch (error) {
        console.error(`[POLLER] Error checking ${repo.owner}/${repo.name}:`, error);
      }
    }
  }

  /**
   * Check a single repo for new issues
   */
  private async checkRepo(repo: RepoConfig) {
    const { owner, name } = repo;

    // Get recent open issues
    const issues = await $`gh issue list --repo ${owner}/${name} --state open --limit 10 --json number,title,body,author,labels,createdAt,url`.json() as Array<{
      number: number;
      title: string;
      body: string | null;
      author: { login: string };
      labels: Array<{ name: string }>;
      createdAt: string;
      url: string;
    }>;

    for (const issue of issues) {
      const issueKey = `${owner}/${name}#${issue.number}`;

      // Skip if already processed or currently processing
      if (this.processedIssues.has(issueKey) || this.processingIssues.has(issueKey)) {
        continue;
      }

      // Check if issue has AI response already (by checking comments)
      const hasAiResponse = await this.hasAiComment(owner, name, issue.number);
      if (hasAiResponse) {
        this.processedIssues.add(issueKey);
        continue;
      }

      console.log(`[POLLER] New issue found: ${issueKey} - ${issue.title}`);

      // Mark as processing BEFORE starting analysis
      this.processingIssues.add(issueKey);

      // Process the issue (don't await - let it run in background)
      this.processIssue(repo, issue)
        .then(() => {
          this.processedIssues.add(issueKey);
        })
        .finally(() => {
          this.processingIssues.delete(issueKey);
        });
    }
  }

  /**
   * Check if issue already has AI comment
   */
  private async hasAiComment(owner: string, repo: string, issueNumber: number): Promise<boolean> {
    try {
      const comments = await $`gh issue view ${issueNumber} --repo ${owner}/${repo} --json comments`.json() as {
        comments: Array<{ body: string }>;
      };

      return comments.comments.some((c) => c.body.includes('🤖 **AI Assistant Response**'));
    } catch {
      return false;
    }
  }

  /**
   * Process a single issue
   */
  private async processIssue(
    repo: RepoConfig,
    issue: {
      number: number;
      title: string;
      body: string | null;
      author: { login: string };
      labels: Array<{ name: string }>;
      createdAt: string;
      url: string;
    }
  ) {
    const { owner, name } = repo;

    const context: IssueContext = {
      issue: {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        user: issue.author?.login || 'unknown',
        labels: (issue.labels || []).map((l) => l.name),
        created_at: issue.createdAt,
        html_url: issue.url,
      },
      repository: {
        owner,
        name,
        full_name: `${owner}/${name}`,
        default_branch: 'main',
        clone_url: `https://github.com/${owner}/${name}.git`,
      },
    };

    try {
      console.log(`[POLLER] Analyzing ${owner}/${name}#${issue.number}...`);

      const analysis = await this.claudeAgent.analyzeIssue(context, repo.localPath);

      console.log(`[POLLER] Result: Type=${analysis.classification.type}, Priority=${analysis.classification.priority}`);

      // Add labels (create if not exists)
      if (repo.autoLabel && analysis.labels.length > 0) {
        for (const label of analysis.labels) {
          // Create label if not exists (ignore errors)
          await $`gh label create ${label} --repo ${owner}/${name} --color 0e8a16 2>/dev/null || true`.nothrow().quiet();
        }
        // Add labels to issue
        const labelArgs = analysis.labels.join(',');
        const labelResult = await $`gh issue edit ${issue.number} --repo ${owner}/${name} --add-label ${labelArgs} 2>&1`.nothrow().text();
        if (labelResult.includes('failed')) {
          console.log(`[POLLER] Label warning: ${labelResult.trim()}`);
        } else {
          console.log(`[POLLER] Labels added: ${analysis.labels.join(', ')}`);
        }
      }

      // Post comment
      if (repo.autoRespond) {
        await $`gh issue comment ${issue.number} --repo ${owner}/${name} --body ${analysis.response}`.quiet();
        console.log(`[POLLER] Comment posted`);
      }
    } catch (error) {
      console.error(`[POLLER] Failed to process ${owner}/${name}#${issue.number}:`, error);
    }
  }
}
