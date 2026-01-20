# Architecture Document

## Frentis AI Agent Platform

**Version:** 0.1.0
**Last Updated:** 2026-01-20

---

## 1. System Overview

```
                                    ┌─────────────────────────────┐
                                    │       GitHub.com            │
                                    │  ┌─────────────────────┐    │
                                    │  │    Repository       │    │
                                    │  │  ┌───────────────┐  │    │
                                    │  │  │    Issues     │  │    │
                                    │  │  └───────────────┘  │    │
                                    │  └─────────────────────┘    │
                                    └────────────┬────────────────┘
                                                 │
                                    ┌────────────▼────────────┐
                                    │      Webhook Event      │
                                    │   (issues.opened, etc)  │
                                    └────────────┬────────────┘
                                                 │
┌────────────────────────────────────────────────▼─────────────────────────────────────────────┐
│                              Frentis AI Agent Platform                                        │
│                                                                                               │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐   │
│  │  Hono Server    │───▶│ Webhook Handler │───▶│ Context         │───▶│ Claude Agent    │   │
│  │  (Entry Point)  │    │ (Verification)  │    │ Collector       │    │ (Analysis)      │   │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘   │
│           │                                              │                     │             │
│           │                                              ▼                     ▼             │
│           │                                    ┌─────────────────┐    ┌─────────────────┐   │
│           │                                    │ GitHub Client   │    │ Response        │   │
│           │                                    │ (Octokit)       │    │ Generator       │   │
│           │                                    └─────────────────┘    └─────────────────┘   │
│           │                                              │                     │             │
│           ▼                                              ▼                     ▼             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              GitHub API                                              │   │
│  │                    (Labels, Comments, Issue Updates)                                 │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                               │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Details

### 2.1 Hono Server (`src/index.ts`)

**책임:**
- HTTP 서버 실행 및 라우팅
- 미들웨어 적용 (CORS, Logger)
- API 엔드포인트 제공

**엔드포인트:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | 서버 정보 |
| GET | `/health` | 헬스체크 |
| POST | `/webhook` | GitHub 웹훅 수신 |
| GET | `/repos` | 등록된 저장소 목록 |
| POST | `/repos` | 저장소 추가 |
| DELETE | `/repos/:owner/:name` | 저장소 제거 |
| POST | `/analyze` | 수동 분석 트리거 |

### 2.2 Webhook Handler (`src/webhook/handler.ts`)

**책임:**
- Webhook 서명 검증
- 이벤트 타입별 라우팅
- 저장소 설정 확인

**처리 이벤트:**

| Event | Action |
|-------|--------|
| `issues.opened` | 새 이슈 분석 |
| `issues.edited` | (선택적) 재분석 |
| `issue_comment.created` | @멘션 처리 |

### 2.3 Claude Agent (`src/claude/agent.ts`)

**책임:**
- Claude Code SDK 초기화
- 이슈 분석 프롬프트 생성
- 응답 파싱 및 포맷팅

**분석 흐름:**

```
1. 시스템 프롬프트 생성 (저장소 컨텍스트)
       ↓
2. 분류 요청 (type, priority, labels)
       ↓
3. JSON 응답 파싱
       ↓
4. 상세 응답 요청 (해결 방안)
       ↓
5. 결과 포맷팅
```

### 2.4 GitHub Client (`src/github/client.ts`)

**책임:**
- Octokit 래퍼
- 라벨/댓글 관리
- 유사 이슈 검색
- 저장소 클론

### 2.5 Context Collector (`src/analyzer/context-collector.ts`)

**책임:**
- 관련 이슈 검색
- 최근 PR 수집
- 키워드 추출

---

## 3. Data Flow

### 3.1 Issue Processing Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GitHub    │────▶│   Webhook   │────▶│   Handler   │
│   Event     │     │   POST      │     │   Verify    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌──────────────────────────┘
                    ▼
        ┌─────────────────────────────────────────────────┐
        │              Parallel Processing                 │
        │  ┌───────────────┐    ┌───────────────┐         │
        │  │ Context       │    │ Similar Issue │         │
        │  │ Collection    │    │ Search        │         │
        │  └───────┬───────┘    └───────┬───────┘         │
        └──────────┼────────────────────┼─────────────────┘
                   │                    │
                   └─────────┬──────────┘
                             ▼
                   ┌─────────────────────┐
                   │   Claude Agent      │
                   │   Analysis          │
                   └──────────┬──────────┘
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
      ┌───────────┐    ┌───────────┐    ┌───────────┐
      │ Add Label │    │ Post      │    │ Link      │
      │           │    │ Comment   │    │ Related   │
      └───────────┘    └───────────┘    └───────────┘
```

### 3.2 Data Models

```typescript
// Issue Context (입력)
interface IssueContext {
  issue: {
    number: number;
    title: string;
    body: string | null;
    user: string;
    labels: string[];
  };
  repository: {
    owner: string;
    name: string;
    full_name: string;
  };
}

// Analysis Result (출력)
interface AnalysisResult {
  classification: {
    type: 'bug' | 'feature' | 'question' | ...;
    priority: 'critical' | 'high' | 'medium' | 'low';
    area?: string;
  };
  labels: string[];
  response: string;
  confidence: number;
}
```

---

## 4. Configuration

### 4.1 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub API 인증 토큰 |
| `GITHUB_WEBHOOK_SECRET` | Yes | Webhook 서명 검증 시크릿 |
| `ANTHROPIC_API_KEY` | No | Claude API 키 (CLI 인증 사용 시 불필요) |
| `PORT` | No | 서버 포트 (기본: 3000) |
| `HOST` | No | 바인딩 호스트 (기본: 0.0.0.0) |

### 4.2 Repository Configuration

```json
// repos.json
[
  {
    "owner": "org-name",
    "name": "repo-name",
    "localPath": "/path/to/local/clone",
    "enabled": true,
    "autoLabel": true,
    "autoRespond": true
  }
]
```

---

## 5. Security Considerations

### 5.1 Authentication

| Component | Method |
|-----------|--------|
| GitHub Webhook | HMAC-SHA256 서명 검증 |
| GitHub API | Personal Access Token |
| Claude API | API Key (환경변수) |

### 5.2 Security Best Practices

- 환경변수로 시크릿 관리
- `.env` 파일 `.gitignore`에 포함
- Webhook 서명 항상 검증
- Rate limiting 적용
- 민감 정보 로깅 금지

---

## 6. Error Handling

### 6.1 Error Categories

| Category | Handling |
|----------|----------|
| Webhook 검증 실패 | 401 반환, 로깅 |
| Claude API 오류 | 재시도 (3회), 폴백 응답 |
| GitHub API 오류 | Rate limit 대기, 재시도 |
| 분석 실패 | 에러 로깅, 무응답 (silent fail) |

### 6.2 Retry Strategy

```typescript
// Exponential backoff
const delays = [1000, 2000, 4000]; // ms
for (const delay of delays) {
  try {
    return await operation();
  } catch {
    await sleep(delay);
  }
}
```

---

## 7. Deployment

### 7.1 Local Development

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 편집

# 2. 서버 실행
bun run dev

# 3. ngrok 터널
ngrok http 3000
```

### 7.2 Production (Future)

```
┌─────────────────────────────────────────────────────────┐
│                     Production Setup                     │
│                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Load       │───▶│  Container  │───▶│  Claude     │  │
│  │  Balancer   │    │  (Docker)   │    │  API        │  │
│  └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                             │
│         ▼                  ▼                             │
│  ┌─────────────┐    ┌─────────────┐                     │
│  │  SSL/TLS    │    │  Logging    │                     │
│  │  (Cert)     │    │  (Sentry)   │                     │
│  └─────────────┘    └─────────────┘                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Future Enhancements

### 8.1 Phase 2: Code Analysis

```
┌─────────────────────────────────────────────────────┐
│                 Enhanced Analysis                    │
│                                                      │
│  Issue ──▶ Clone Repo ──▶ Claude Code ──▶ PR        │
│                            (with tools)              │
│                                                      │
│  Tools: Read, Grep, Glob, Edit                      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 8.2 Phase 3: Multi-Agent

```
┌─────────────────────────────────────────────────────┐
│                 Multi-Agent System                   │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Triage     │  │  Code       │  │  Review     │  │
│  │  Agent      │  │  Agent      │  │  Agent      │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                │          │
│         └────────────────┼────────────────┘          │
│                          ▼                           │
│                 ┌─────────────────┐                  │
│                 │   Orchestrator  │                  │
│                 └─────────────────┘                  │
│                                                      │
└─────────────────────────────────────────────────────┘
```
