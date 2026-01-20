/**
 * Frentis AI Agent Platform
 * GitHub Issue Auto-Triage and Response System
 *
 * Uses GitHub App authentication with webhook-only architecture.
 * Responds only when @frentis-agent is mentioned.
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { loadConfig, loadReposConfig } from './config';
import { WebhookHandler } from './webhook/handler';
import type { RepoConfig } from './types';

// Load configuration
const config = loadConfig();
const repos = loadReposConfig();

// Initialize webhook handler with GitHub App config
const webhookHandler = new WebhookHandler(config.github, repos);

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Frentis AI Agent Platform',
    version: '0.2.0',
    status: 'running',
    botUsername: config.github.botUsername,
    endpoints: {
      webhook: '/webhook',
      repos: '/repos',
      health: '/health',
      analyze: '/analyze',
    },
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// GitHub Webhook endpoint
app.post('/webhook', async (c) => {
  return webhookHandler.handle(c.req.raw);
});

// Repo management API
app.get('/repos', (c) => {
  return c.json({ repos });
});

app.post('/repos', async (c) => {
  const body = await c.req.json<RepoConfig>();
  webhookHandler.addRepo(body);
  repos.push(body);

  // Persist to file
  await Bun.write('./repos.json', JSON.stringify(repos, null, 2));

  return c.json({ success: true, repo: body });
});

app.delete('/repos/:owner/:name', async (c) => {
  const { owner, name } = c.req.param();
  webhookHandler.removeRepo(owner, name);

  const index = repos.findIndex((r) => r.owner === owner && r.name === name);
  if (index !== -1) {
    repos.splice(index, 1);
    await Bun.write('./repos.json', JSON.stringify(repos, null, 2));
  }

  return c.json({ success: true });
});

// Manual analysis trigger (for testing without webhook)
app.post('/analyze', async (c) => {
  const { owner, repo, issue_number } = await c.req.json<{
    owner: string;
    repo: string;
    issue_number: number;
  }>();

  const { createGitHubClient } = await import('./github/client');
  const { ClaudeAgent } = await import('./claude/agent');

  const ghClient = createGitHubClient();
  const claudeAgent = new ClaudeAgent();

  // Fetch issue via gh CLI
  const issue = await ghClient.getIssue(owner, repo, issue_number) as {
    number: number;
    title: string;
    body: string | null;
    author: { login: string };
    labels: Array<{ name: string }>;
    createdAt: string;
    url: string;
  };

  const context = {
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
      name: repo,
      full_name: `${owner}/${repo}`,
      default_branch: 'main',
      clone_url: `https://github.com/${owner}/${repo}.git`,
    },
  };

  console.log(`[MANUAL] Analyzing ${owner}/${repo}#${issue_number}...`);

  const analysis = await claudeAgent.analyzeIssue(context);

  console.log(`[RESULT] Type: ${analysis.classification.type}, Priority: ${analysis.classification.priority}`);

  return c.json({
    issue: `${owner}/${repo}#${issue_number}`,
    classification: analysis.classification,
    suggestedLabels: analysis.labels,
    response: analysis.response,
  });
});

// Start server
const port = config.server.port;
const botName = config.github.botUsername;
console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🤖 Frentis AI Agent Platform v0.2.0                     ║
║                                                            ║
║   Server running on http://localhost:${port}                 ║
║   Webhook endpoint: http://localhost:${port}/webhook         ║
║   Bot username: @${botName}                       ║
║                                                            ║
║   Responds only when @${botName} is mentioned     ║
║                                                            ║
║   For external access, use ngrok:                         ║
║   $ ngrok http ${port}                                       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
