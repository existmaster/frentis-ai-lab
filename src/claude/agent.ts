/**
 * Claude Code Agent Wrapper
 * Uses claude-code-js SDK for programmatic access
 */

import { ClaudeCode } from 'claude-code-js';
import type { IssueContext, AnalysisResult, IssueClassification } from '../types';

export class ClaudeAgent {
  private claude: ClaudeCode;

  constructor() {
    this.claude = new ClaudeCode({
      // Uses ANTHROPIC_API_KEY from environment
    });
  }

  /**
   * Analyze an issue and generate response
   */
  async analyzeIssue(context: IssueContext, repoPath?: string): Promise<AnalysisResult> {
    const session = this.claude.newSession();

    // Build the analysis prompt
    const systemPrompt = this.buildSystemPrompt(context);
    const analysisPrompt = this.buildAnalysisPrompt(context);

    // If we have local repo, set working directory
    const options: Record<string, unknown> = {
      systemPrompt,
    };

    if (repoPath) {
      options.workingDirectory = repoPath;
    }

    // Get classification first
    const classificationResponse = await session.prompt({
      prompt: `${analysisPrompt}\n\n먼저 이 이슈를 분류해주세요. JSON 형식으로 응답:
{
  "type": "bug" | "feature" | "question" | "documentation" | "enhancement" | "other",
  "priority": "critical" | "high" | "medium" | "low",
  "area": "관련 영역 (예: frontend, backend, infra, docs)",
  "suggestedLabels": ["라벨1", "라벨2"]
}`,
      ...options,
    });

    const classification = this.parseClassification(classificationResponse.result);

    // Generate detailed response
    const responsePrompt = repoPath
      ? `GitHub 이슈 댓글로 바로 게시될 응답을 작성하세요.
코드베이스를 분석하고 구체적인 해결 방안을 제시하세요.

주의: 응답만 출력하세요. "접근 방식", "분석 결과" 같은 메타 설명 없이 바로 사용자에게 말하듯 작성하세요.`
      : `GitHub 이슈 댓글로 바로 게시될 응답을 작성하세요.

포함할 내용:
- 문제 이해 확인
- 가능한 원인 또는 해결 방향
- 필요시 추가 정보 요청

주의: 응답만 출력하세요. "접근 방식", "이 응답의 목적" 같은 메타 설명 없이 바로 사용자에게 말하듯 작성하세요.`;

    const detailResponse = await session.prompt({
      prompt: responsePrompt,
    });

    return {
      classification: classification.classification,
      labels: classification.suggestedLabels,
      response: this.formatResponse(detailResponse.result),
      confidence: 0.8, // TODO: Implement confidence scoring
    };
  }

  private buildSystemPrompt(context: IssueContext): string {
    return `You are an AI assistant that responds to GitHub issues.

Repository: ${context.repository.full_name}

CRITICAL RULES:
1. Output ONLY the final response that will be posted as a GitHub comment
2. Do NOT include any meta-commentary like "이 응답의 접근 방식", "요약:", "분석:" etc.
3. Do NOT explain your reasoning or thought process in the response
4. Do NOT wrap the response in markdown code blocks
5. Write the response as if you are directly talking to the issue author

Guidelines:
- Be concise and professional
- Use Korean
- Use Markdown formatting (headers, tables, code blocks) appropriately
- If off-topic, politely redirect without being condescending`;
  }

  private buildAnalysisPrompt(context: IssueContext): string {
    return `## GitHub Issue Analysis

**Repository:** ${context.repository.full_name}
**Issue #${context.issue.number}:** ${context.issue.title}
**Author:** ${context.issue.user}
**Created:** ${context.issue.created_at}
**Current Labels:** ${context.issue.labels.join(', ') || 'None'}

### Issue Body:
${context.issue.body || '(No description provided)'}

---`;
  }

  private parseClassification(response: string): {
    classification: IssueClassification;
    suggestedLabels: string[];
  } {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          classification: {
            type: parsed.type || 'other',
            priority: parsed.priority || 'medium',
            area: parsed.area,
          },
          suggestedLabels: parsed.suggestedLabels || [],
        };
      }
    } catch {
      // Fallback to defaults
    }

    return {
      classification: { type: 'other', priority: 'medium' },
      suggestedLabels: [],
    };
  }

  private formatResponse(response: string): string {
    const header = `> 🤖 **AI Assistant Response**\n>\n> _이 응답은 AI가 자동으로 생성했습니다. 정확하지 않을 수 있으니 참고용으로 활용해주세요._\n\n---\n\n`;

    // Strip outer markdown code blocks if the entire response is wrapped
    let cleaned = response.trim();
    if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
      // Remove opening ``` (with optional language identifier) and closing ```
      cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    // Remove common meta-commentary patterns that might slip through
    cleaned = cleaned
      .replace(/^(접근 방식|분석 결과|요약|이 응답의 목적)[:\s]*\n*/gi, '')
      .replace(/^(Approach|Analysis|Summary)[:\s]*\n*/gi, '')
      .trim();

    return header + cleaned;
  }
}
