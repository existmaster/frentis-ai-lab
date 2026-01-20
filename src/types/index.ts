/**
 * GitHub Issue Agent - Type Definitions
 */

export interface IssueContext {
  issue: {
    number: number;
    title: string;
    body: string | null;
    user: string;
    labels: string[];
    created_at: string;
    html_url: string;
  };
  repository: {
    owner: string;
    name: string;
    full_name: string;
    default_branch: string;
    clone_url: string;
  };
}

export interface AnalysisResult {
  classification: IssueClassification;
  labels: string[];
  response: string;
  suggestedFix?: CodeSuggestion;
  relatedIssues?: RelatedIssue[];
  confidence: number;
}

export interface IssueClassification {
  type: 'bug' | 'feature' | 'question' | 'documentation' | 'enhancement' | 'other';
  priority: 'critical' | 'high' | 'medium' | 'low';
  area?: string; // e.g., 'frontend', 'backend', 'infra'
}

export interface CodeSuggestion {
  files: Array<{
    path: string;
    suggestion: string;
    diff?: string;
  }>;
  explanation: string;
}

export interface RelatedIssue {
  number: number;
  title: string;
  similarity: number;
  status: 'open' | 'closed';
}

export interface AgentConfig {
  github: {
    token?: string; // Optional when using gh CLI
    webhookSecret: string;
  };
  claude: {
    apiKey?: string; // claude-code uses ANTHROPIC_API_KEY env
  };
  server: {
    port: number;
    host: string;
  };
  repos: RepoConfig[];
}

export interface RepoConfig {
  owner: string;
  name: string;
  localPath?: string; // for code analysis
  enabled: boolean;
  autoLabel: boolean;
  autoRespond: boolean;
}
