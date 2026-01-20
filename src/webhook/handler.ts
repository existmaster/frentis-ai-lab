/**
 * GitHub Webhook Handler
 */

import { Webhooks } from '@octokit/webhooks';
import type { IssueContext, RepoConfig } from '../types';
import { createGitHubClient, type IGitHubClient } from '../github/client';
import { ClaudeAgent } from '../claude/agent';

export class WebhookHandler {
  private webhooks: Webhooks;
  private githubClient: IGitHubClient;
  private claudeAgent: ClaudeAgent;
  private repoConfigs: Map<string, RepoConfig>;

  constructor(
    webhookSecret: string,
    githubToken?: string, // Optional: gh CLI doesn't need token
    repos: RepoConfig[] = []
  ) {
    this.webhooks = new Webhooks({ secret: webhookSecret });
    this.githubClient = createGitHubClient(githubToken);
    this.claudeAgent = new ClaudeAgent();
    this.repoConfigs = new Map(
      repos.map((r) => [`${r.owner}/${r.name}`, r])
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // Handle new issues
    this.webhooks.on('issues.opened', async ({ payload }) => {
      const repoKey = payload.repository.full_name;
      const config = this.repoConfigs.get(repoKey);

      if (!config?.enabled) {
        console.log(`[SKIP] Repo not enabled: ${repoKey}`);
        return;
      }

      console.log(`[NEW ISSUE] #${payload.issue.number}: ${payload.issue.title}`);

      const context = this.buildIssueContext(payload);
      await this.processIssue(context, config);
    });

    // Handle issue edits (optional: re-analyze on significant changes)
    this.webhooks.on('issues.edited', async ({ payload }) => {
      const repoKey = payload.repository.full_name;
      const config = this.repoConfigs.get(repoKey);

      if (!config?.enabled) return;

      console.log(`[EDITED] #${payload.issue.number}: ${payload.issue.title}`);
      // Could re-analyze if body changed significantly
    });

    // Handle issue comments (for @bot mentions)
    this.webhooks.on('issue_comment.created', async ({ payload }) => {
      const repoKey = payload.repository.full_name;
      const config = this.repoConfigs.get(repoKey);

      if (!config?.enabled) return;

      // Check if bot is mentioned
      const body = payload.comment.body;
      if (body.includes('@frentis-bot') || body.includes('/analyze')) {
        console.log(`[MENTION] #${payload.issue.number}`);
        const context = this.buildIssueContextFromComment(payload);
        await this.processIssue(context, config);
      }
    });
  }

  private buildIssueContext(payload: {
    issue: {
      number: number;
      title: string;
      body: string | null;
      user: { login: string } | null;
      labels?: Array<{ name: string }>;
      created_at: string;
      html_url: string;
    };
    repository: {
      owner: { login: string };
      name: string;
      full_name: string;
      default_branch: string;
      clone_url: string;
    };
  }): IssueContext {
    return {
      issue: {
        number: payload.issue.number,
        title: payload.issue.title,
        body: payload.issue.body,
        user: payload.issue.user?.login || 'unknown',
        labels: (payload.issue.labels || []).map((l) => l.name),
        created_at: payload.issue.created_at,
        html_url: payload.issue.html_url,
      },
      repository: {
        owner: payload.repository.owner.login,
        name: payload.repository.name,
        full_name: payload.repository.full_name,
        default_branch: payload.repository.default_branch,
        clone_url: payload.repository.clone_url,
      },
    };
  }

  private buildIssueContextFromComment(payload: {
    issue: {
      number: number;
      title: string;
      body: string | null;
      user: { login: string } | null;
      labels?: Array<{ name: string }>;
      created_at: string;
      html_url: string;
    };
    repository: {
      owner: { login: string };
      name: string;
      full_name: string;
      default_branch: string;
      clone_url: string;
    };
  }): IssueContext {
    return this.buildIssueContext(payload);
  }

  private async processIssue(context: IssueContext, config: RepoConfig) {
    try {
      console.log(`[ANALYZING] Issue #${context.issue.number}...`);

      // Analyze with Claude
      const analysis = await this.claudeAgent.analyzeIssue(
        context,
        config.localPath
      );

      console.log(`[RESULT] Type: ${analysis.classification.type}, Priority: ${analysis.classification.priority}`);

      // Add labels if enabled
      if (config.autoLabel && analysis.labels.length > 0) {
        await this.githubClient.addLabels(
          context.repository.owner,
          context.repository.name,
          context.issue.number,
          analysis.labels
        );
        console.log(`[LABELED] ${analysis.labels.join(', ')}`);
      }

      // Post response if enabled
      if (config.autoRespond) {
        await this.githubClient.createComment(
          context.repository.owner,
          context.repository.name,
          context.issue.number,
          analysis.response
        );
        console.log(`[RESPONDED] Comment posted`);
      }
    } catch (error) {
      console.error(`[ERROR] Failed to process issue #${context.issue.number}:`, error);
    }
  }

  /**
   * Verify and handle incoming webhook
   */
  async handle(request: Request): Promise<Response> {
    const id = request.headers.get('x-github-delivery') || '';
    const name = request.headers.get('x-github-event') || '';
    const signature = request.headers.get('x-hub-signature-256') || '';
    const body = await request.text();

    try {
      await this.webhooks.verifyAndReceive({
        id,
        name: name as Parameters<typeof this.webhooks.verifyAndReceive>[0]['name'],
        payload: body,
        signature,
      });
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('[WEBHOOK ERROR]', error);
      return new Response('Webhook verification failed', { status: 401 });
    }
  }

  /**
   * Add or update a repo configuration
   */
  addRepo(config: RepoConfig) {
    this.repoConfigs.set(`${config.owner}/${config.name}`, config);
  }

  /**
   * Remove a repo configuration
   */
  removeRepo(owner: string, name: string) {
    this.repoConfigs.delete(`${owner}/${name}`);
  }
}
