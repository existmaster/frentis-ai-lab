# Frentis AI Agent Platform

GitHub 이슈를 자동으로 분석, 분류, 응답하는 AI 에이전트 플랫폼.

## Features

- **자동 이슈 분류**: bug, feature, question 등으로 자동 분류
- **라벨 자동 부착**: 분류 결과에 따른 라벨 추가
- **AI 응답 생성**: 이슈에 대한 초기 응답 자동 작성
- **컨텍스트 분석**: 코드베이스, 유사 이슈, PR 히스토리 분석

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Framework | Hono |
| AI | claude-code-js (Claude Code SDK) |
| GitHub API | Octokit |
| Validation | Zod |

## Quick Start

### 1. Installation

```bash
git clone https://github.com/frentis/frentis-ai-agent-platform.git
cd frentis-ai-agent-platform
bun install
```

### 2. Configuration

```bash
cp .env.example .env
```

`.env` 파일 편집:

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_WEBHOOK_SECRET=your-webhook-secret
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx  # Optional
```

### 3. Add Repository

`repos.json` 편집:

```json
[
  {
    "owner": "your-org",
    "name": "your-repo",
    "enabled": true,
    "autoLabel": true,
    "autoRespond": true
  }
]
```

### 4. Run Server

```bash
bun run dev
```

### 5. Expose with ngrok

```bash
ngrok http 3000
```

ngrok URL을 GitHub Webhook 설정에 추가 (`https://xxxx.ngrok.io/webhook`).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | 서버 정보 |
| GET | `/health` | 헬스체크 |
| POST | `/webhook` | GitHub 웹훅 수신 |
| GET | `/repos` | 등록된 저장소 목록 |
| POST | `/repos` | 저장소 추가 |
| DELETE | `/repos/:owner/:name` | 저장소 제거 |

## GitHub Webhook Setup

1. Repository Settings → Webhooks → Add webhook
2. Payload URL: `https://your-server/webhook`
3. Content type: `application/json`
4. Secret: `.env`의 `GITHUB_WEBHOOK_SECRET` 값
5. Events: `Issues`, `Issue comments`

## Project Structure

```
frentis-ai-agent-platform/
├── src/
│   ├── index.ts              # 메인 서버 (Hono)
│   ├── config/
│   │   └── index.ts          # 설정 로더
│   ├── types/
│   │   └── index.ts          # 타입 정의
│   ├── webhook/
│   │   └── handler.ts        # Webhook 처리
│   ├── github/
│   │   └── client.ts         # GitHub API 래퍼
│   ├── claude/
│   │   └── agent.ts          # Claude Code SDK 래퍼
│   └── analyzer/
│       └── context-collector.ts  # 컨텍스트 수집
├── docs/
│   ├── PRD.md                # Product Requirements
│   └── ARCHITECTURE.md       # Architecture Design
├── .env.example
├── repos.json
└── package.json
```

## Roadmap

### Phase 1: MVP (Current)

- [x] Webhook 서버 구현
- [x] 이슈 자동 분류
- [x] 라벨 자동 부착
- [x] AI 응답 생성

### Phase 2: Enhancement

- [ ] 코드베이스 분석 통합
- [ ] 유사 이슈 검색 고도화
- [ ] 커스텀 프롬프트 지원

### Phase 3: Automation

- [ ] 자동 PR 생성
- [ ] CI/CD 통합
- [ ] Multi-repo 지원

## Documentation

- [PRD (Product Requirements)](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)

## License

MIT
