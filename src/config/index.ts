/**
 * Configuration loader
 */

import { z } from 'zod';
import type { AgentConfig } from '../types';

const envSchema = z.object({
  // GitHub App configuration
  GITHUB_APP_ID: z.string(),
  GITHUB_PRIVATE_KEY_PATH: z.string().default('./private-key.pem'),
  GITHUB_WEBHOOK_SECRET: z.string().default('dev-secret'),
  GITHUB_BOT_USERNAME: z.string().default('frentis-agent'),
  GITHUB_INSTALLATION_ID: z.string().optional(),

  // Claude configuration
  ANTHROPIC_API_KEY: z.string().optional(),

  // Server configuration
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),
});

export function loadConfig(): AgentConfig {
  const env = envSchema.parse(process.env);

  return {
    github: {
      appId: env.GITHUB_APP_ID,
      privateKeyPath: env.GITHUB_PRIVATE_KEY_PATH,
      webhookSecret: env.GITHUB_WEBHOOK_SECRET,
      botUsername: env.GITHUB_BOT_USERNAME,
      installationId: env.GITHUB_INSTALLATION_ID
        ? parseInt(env.GITHUB_INSTALLATION_ID, 10)
        : undefined,
    },
    claude: {
      apiKey: env.ANTHROPIC_API_KEY,
    },
    server: {
      port: parseInt(env.PORT, 10),
      host: env.HOST,
    },
    repos: [], // Will be loaded from repos.json or added via API
  };
}

export function loadReposConfig(configPath?: string): AgentConfig['repos'] {
  const path = configPath || `${import.meta.dir}/../../repos.json`;
  try {
    const content = require('fs').readFileSync(path, 'utf-8');
    console.log('[CONFIG] Loaded repos:', content);
    return JSON.parse(content);
  } catch (e) {
    console.log('[CONFIG] Failed to load repos.json:', e);
    return [];
  }
}
