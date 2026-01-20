# Frentis AI Agent Platform

GitHub 이슈를 자동으로 분석, 분류, 응답하는 AI 에이전트 플랫폼.

**v0.2.0** - GitHub App 기반 Webhook 전용 아키텍처

## Features

- **멘션 기반 트리거**: `@frentis-agent` 멘션 시에만 응답
- **자동 이슈 분류**: bug, feature, question 등으로 자동 분류
- **라벨 자동 부착**: 분류 결과에 따른 라벨 추가
- **AI 응답 생성**: 이슈에 대한 초기 응답 자동 작성
- **대화 컨텍스트**: 이슈 댓글 히스토리 기반 응답
- **무한루프 방지**: 봇 자기 댓글 감지 및 중복 이벤트 필터링

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Framework | Hono |
| AI | claude-code-js (Claude Code SDK) |
| GitHub API | Octokit + @octokit/auth-app |
| Validation | Zod |
| Tunnel | Cloudflare Tunnel |

## Architecture

```
GitHub Issue/Comment
        ↓
   Webhook 수신 (agent.dream-flow.com)
        ↓
   Cloudflare Tunnel
        ↓
   localhost:3000
        ↓
  서명 검증 (HMAC)
        ↓
  @frentis-agent 멘션? ──No──→ 무시
        ↓ Yes
  봇 자신 댓글? ──Yes──→ 무시
        ↓ No
  대화 컨텍스트 수집
        ↓
  Claude 분석
        ↓
  댓글 게시 (as frentis-agent[bot])
```

## Quick Start

### 1. Installation

```bash
git clone https://github.com/frentis/frentis-ai-agent-platform.git
cd frentis-ai-agent-platform
bun install
```

### 2. GitHub App 생성

https://github.com/settings/apps/new 에서 App 생성:

| 필드 | 값 |
|------|-----|
| App name | `frentis-agent` |
| Homepage URL | `https://dream-flow.com` |
| Webhook URL | `https://agent.dream-flow.com/webhook` |
| Webhook secret | (openssl rand -hex 32로 생성) |

**Repository permissions:**
- Issues: Read and write
- Metadata: Read-only

**Subscribe to events:**
- ☑️ Issues
- ☑️ Issue comment

생성 후:
1. App ID 복사
2. Private Key 생성 및 다운로드 → `private-key.pem`으로 저장

### 3. Configuration

```bash
cp .env.example .env
```

`.env` 파일 편집:

```env
GITHUB_APP_ID=2691714
GITHUB_PRIVATE_KEY_PATH=./private-key.pem
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_BOT_USERNAME=frentis-agent
PORT=3000
```

### 4. Cloudflare Tunnel 설정

```bash
# 터널 생성 (최초 1회)
cloudflared tunnel create frentis-agent
cloudflared tunnel route dns frentis-agent agent.dream-flow.com

# config 파일 생성
cat > ~/.cloudflared/config.yml << EOF
tunnel: frentis-agent
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: agent.dream-flow.com
    service: http://localhost:3000
  - service: http_status:404
EOF
```

### 5. 저장소 등록

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

### 6. 실행

```bash
# 터미널 1: Cloudflare Tunnel
cloudflared tunnel run frentis-agent

# 터미널 2: 서버
bun run dev
```

### 7. GitHub App 설치

https://github.com/settings/apps/frentis-agent/installations 에서 대상 저장소에 App 설치

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | 서버 정보 |
| GET | `/health` | 헬스체크 |
| POST | `/webhook` | GitHub 웹훅 수신 |
| GET | `/repos` | 등록된 저장소 목록 |
| POST | `/repos` | 저장소 추가 |
| DELETE | `/repos/:owner/:name` | 저장소 제거 |
| POST | `/analyze` | 수동 분석 트리거 |

## Project Structure

```
frentis-ai-agent-platform/
├── src/
│   ├── index.ts                # 메인 서버 (Hono)
│   ├── config/
│   │   └── index.ts            # 설정 로더 (GitHub App)
│   ├── types/
│   │   └── index.ts            # 타입 정의
│   ├── github/
│   │   ├── client.ts           # GitHub API (GhCli + Octokit)
│   │   ├── auth.ts             # GitHub App 인증 (JWT)
│   │   └── token-cache.ts      # Installation Token 캐시
│   ├── webhook/
│   │   ├── handler.ts          # Webhook 처리
│   │   ├── mention-detector.ts # @멘션 파싱
│   │   └── loop-prevention.ts  # 무한루프 방지
│   ├── claude/
│   │   └── agent.ts            # Claude Code SDK 래퍼
│   └── analyzer/
│       └── context-collector.ts  # 컨텍스트 수집
├── docs/
│   ├── PRD.md                  # Product Requirements
│   └── ARCHITECTURE.md         # Architecture Design
├── .env.example
├── .env                        # 로컬 설정 (gitignore)
├── private-key.pem             # GitHub App Private Key (gitignore)
├── repos.json
├── frentis-agent-icon.svg      # 봇 아이콘 (SVG)
├── frentis-agent-icon.png      # 봇 아이콘 (PNG)
└── package.json
```

## Roadmap

### Phase 1: MVP ✅

- [x] Webhook 서버 구현
- [x] 이슈 자동 분류
- [x] 라벨 자동 부착
- [x] AI 응답 생성

### Phase 2: GitHub App 전환 ✅ (v0.2.0)

- [x] GitHub App 인증 (JWT + Installation Token)
- [x] 멘션 기반 트리거 (@frentis-agent)
- [x] 무한루프 방지 (봇 자기 댓글 감지)
- [x] 대화 컨텍스트 수집
- [x] Cloudflare Tunnel 연동
- [x] Poller 제거 (Webhook 전용)

### Phase 3: Enhancement

- [ ] 코드베이스 분석 통합
- [ ] 유사 이슈 검색 고도화
- [ ] 커스텀 프롬프트 지원

### Phase 4: Automation

- [ ] 자동 PR 생성
- [ ] CI/CD 통합
- [ ] Multi-repo 지원

## Current Deployment

| 항목 | 값 |
|------|-----|
| GitHub App | `frentis-agent` (ID: 2691714) |
| Webhook URL | `https://agent.dream-flow.com/webhook` |
| Tunnel | `frentis-agent` (Cloudflare) |
| Tunnel ID | `eaa698b8-8ed7-4586-8997-2e9aaa221442` |
| Config | `~/.cloudflared/config.yml` |

## Documentation

- [PRD (Product Requirements)](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)

## License

MIT
