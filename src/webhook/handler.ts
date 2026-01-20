/**
 * GitHub Webhook Handler
 * Supports GitHub App authentication with mention-based triggering
 */

import { Webhooks } from '@octokit/webhooks';
import type {
  IssueContext,
  RepoConfig,
  GitHubAppConfig,
  ConversationContext,
} from '../types';
import { createGitHubClient, OctokitClient } from '../github/client';
import { GitHubAppAuth } from '../github/auth';
import { ClaudeAgent } from '../claude/agent';
import { MentionDetector } from './mention-detector';
import { LoopPrevention } from './loop-prevention';

export class WebhookHandler {
  private webhooks: Webhooks;
  private githubConfig: GitHubAppConfig;
  private claudeAgent: ClaudeAgent;
  private repoConfigs: Map<string, RepoConfig>;
  private mentionDetector: MentionDetector;
  private loopPrevention: LoopPrevention;

  constructor(config: GitHubAppConfig, repos: RepoConfig[] = []) {
    this.webhooks = new Webhooks({ secret: config.webhookSecret });
    this.githubConfig = config;
    this.claudeAgent = new ClaudeAgent();
    this.repoConfigs = new Map(
      repos.map((r) => [`${r.owner}/${r.name}`, r])
    );
    this.mentionDetector = new MentionDetector(config.botUsername);
    this.loopPrevention = new LoopPrevention(config.botUsername);

    this.setupHandlers();
  }

  /**
   * Create a GitHub client for a specific installation
   */
  private createClientForInstallation(installationId: number): OctokitClient {
    return new OctokitClient(this.githubConfig, installationId);
  }

  private setupHandlers() {
    // Handle new issues - only respond if bot is mentioned in the issue body
    this.webhooks.on('issues.opened', async ({ payload, id }) => {
      const repoKey = payload.repository.full_name;
      const config = this.repoConfigs.get(repoKey);
      const installationId = payload.installation?.id;

      if (!config?.enabled || !installationId) {
        console.log(`[SKIP] Repo not enabled or no installation: ${repoKey}`);
        return;
      }

      const issueKey = `${repoKey}#${payload.issue.number}`;

      // Check for loop prevention
      const loopCheck = this.loopPrevention.check(
        payload.issue.user?.login || '',
        issueKey,
        id
      );
      if (loopCheck.shouldIgnore) {
        console.log(`[SKIP] Loop prevention: ${loopCheck.reason}`);
        return;
      }

      // Check for mention in issue body
      const mentionResult = this.mentionDetector.detect(payload.issue.body || '');
      if (!mentionResult.isMentioned) {
        console.log(`[SKIP] No mention in issue #${payload.issue.number}`);
        return;
      }

      console.log(`[NEW ISSUE] #${payload.issue.number}: ${payload.issue.title}`);

      const client = this.createClientForInstallation(installationId);
      const context = this.buildIssueContext(payload);
      await this.processIssue(context, config, client, id);
    });

    // Handle issue comments (for @bot mentions)
    this.webhooks.on('issue_comment.created', async ({ payload, id }) => {
      const repoKey = payload.repository.full_name;
      const config = this.repoConfigs.get(repoKey);
      const installationId = payload.installation?.id;

      if (!config?.enabled || !installationId) return;

      const issueKey = `${repoKey}#${payload.issue.number}`;
      const commentAuthor = payload.comment.user?.login || '';

      // Check for loop prevention
      const loopCheck = this.loopPrevention.check(commentAuthor, issueKey, id);
      if (loopCheck.shouldIgnore) {
        console.log(`[SKIP] Loop prevention: ${loopCheck.reason}`);
        return;
      }

      // Check for mention in comment body
      const body = payload.comment.body || '';
      const mentionResult = this.mentionDetector.detect(body);

      if (!mentionResult.isMentioned) {
        console.log(`[SKIP] No mention in comment on #${payload.issue.number}`);
        return;
      }

      console.log(`[MENTION] #${payload.issue.number} by @${commentAuthor}`);

      const client = this.createClientForInstallation(installationId);
      const context = this.buildIssueContext(payload);

      // Collect conversation context
      const conversationContext = await this.collectConversationContext(
        client,
        payload.repository.owner.login,
        payload.repository.name,
        payload.issue.number
      );

      await this.processIssueWithConversation(
        context,
        conversationContext,
        config,
        client,
        id
      );
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

  /**
   * Collect conversation context from issue comments
   */
  private async collectConversationContext(
    client: OctokitClient,
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<ConversationContext> {
    const comments = await client.getIssueComments(owner, repo, issueNumber);

    // Find last bot comment
    const botComments = comments.filter((c) => client.isBotUser(c.author));
    const lastBotComment = botComments[botComments.length - 1];

    return {
      issueNumber,
      owner,
      repo,
      comments,
      lastBotCommentId: lastBotComment?.id,
    };
  }

  /**
   * Process issue (new issue with mention)
   */
  private async processIssue(
    context: IssueContext,
    config: RepoConfig,
    client: OctokitClient,
    eventId: string
  ) {
    try {
      console.log(`[ANALYZING] Issue #${context.issue.number}...`);

      // Mark event as processed
      this.loopPrevention.markProcessed(eventId);

      // Analyze with Claude
      const analysis = await this.claudeAgent.analyzeIssue(
        context,
        config.localPath
      );

      console.log(
        `[RESULT] Type: ${analysis.classification.type}, Priority: ${analysis.classification.priority}`
      );

      // Add labels if enabled
      if (config.autoLabel && analysis.labels.length > 0) {
        await client.addLabels(
          context.repository.owner,
          context.repository.name,
          context.issue.number,
          analysis.labels
        );
        console.log(`[LABELED] ${analysis.labels.join(', ')}`);
      }

      // Post response if enabled
      if (config.autoRespond) {
        const result = await client.createComment(
          context.repository.owner,
          context.repository.name,
          context.issue.number,
          analysis.response
        );
        console.log(`[RESPONDED] Comment posted (ID: ${result.id})`);

        // Record response for loop prevention
        const issueKey = `${context.repository.full_name}#${context.issue.number}`;
        this.loopPrevention.recordResponse(issueKey, eventId);
      }
    } catch (error) {
      console.error(
        `[ERROR] Failed to process issue #${context.issue.number}:`,
        error
      );
    }
  }

  /**
   * Process issue with conversation context (reply to comment mention)
   */
  private async processIssueWithConversation(
    context: IssueContext,
    conversationContext: ConversationContext,
    config: RepoConfig,
    client: OctokitClient,
    eventId: string
  ) {
    try {
      console.log(
        `[ANALYZING] Issue #${context.issue.number} with ${conversationContext.comments.length} comments...`
      );

      // Mark event as processed
      this.loopPrevention.markProcessed(eventId);

      // Build conversation history for Claude
      const conversationHistory = conversationContext.comments
        .map((c) => `@${c.author}: ${c.body}`)
        .join('\n\n---\n\n');

      // Analyze with conversation context
      const analysis = await this.claudeAgent.analyzeIssue(
        {
          ...context,
          issue: {
            ...context.issue,
            body: `${context.issue.body || ''}\n\n## Conversation History\n\n${conversationHistory}`,
          },
        },
        config.localPath
      );

      console.log(
        `[RESULT] Type: ${analysis.classification.type}, Priority: ${analysis.classification.priority}`
      );

      // Post response (always respond to mentions)
      const result = await client.createComment(
        context.repository.owner,
        context.repository.name,
        context.issue.number,
        analysis.response
      );
      console.log(`[RESPONDED] Comment posted (ID: ${result.id})`);

      // Record response for loop prevention
      const issueKey = `${context.repository.full_name}#${context.issue.number}`;
      this.loopPrevention.recordResponse(issueKey, eventId);
    } catch (error) {
      console.error(
        `[ERROR] Failed to process issue #${context.issue.number}:`,
        error
      );
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
