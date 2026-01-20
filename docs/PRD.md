# Product Requirements Document (PRD)

## Frentis AI Agent Platform

**Version:** 0.1.0
**Last Updated:** 2026-01-20
**Status:** Initial Development

---

## 1. Executive Summary

### 1.1 Product Vision

GitHub 저장소와 연동하여 이슈를 자동으로 분석, 분류, 응답하는 AI 에이전트 플랫폼.
향후 자동 코드 수정 및 PR 생성 기능으로 확장 예정.

### 1.2 Problem Statement

| 문제 | 영향 |
|------|------|
| 이슈 분류에 시간 소요 | 메인테이너 리소스 낭비 |
| 초기 응답 지연 | 기여자 경험 저하 |
| 중복 이슈 발생 | 관리 복잡도 증가 |
| 컨텍스트 파악 어려움 | 해결 시간 증가 |

### 1.3 Solution

- AI 기반 자동 이슈 분류 및 라벨링
- 코드베이스 분석을 통한 구체적 해결 방안 제시
- 유사 이슈/PR 자동 검색 및 연결
- 실시간 Webhook 기반 처리

---

## 2. Goals & Non-Goals

### 2.1 Goals (MVP)

- [ ] GitHub Webhook 수신 및 처리
- [ ] 이슈 자동 분류 (bug/feature/question/etc.)
- [ ] 적절한 라벨 자동 부착
- [ ] AI 생성 초기 응답 댓글
- [ ] 관련 이슈/PR 자동 검색

### 2.2 Goals (Phase 2)

- [ ] 코드베이스 분석 기반 수정 제안
- [ ] 자동 PR 생성 (simple fixes)
- [ ] 다국어 지원
- [ ] Slack/Discord 알림 통합

### 2.3 Non-Goals

- 완전 자율 코드 수정 (사람 승인 필요)
- 보안 취약점 자동 수정 (위험도 높음)
- 실시간 채팅 인터페이스

---

## 3. User Stories

### 3.1 Repository Maintainer

```
As a maintainer,
I want issues to be automatically labeled and prioritized,
So that I can focus on high-priority work.
```

```
As a maintainer,
I want AI to provide initial responses to issues,
So that contributors feel acknowledged quickly.
```

### 3.2 Contributor

```
As a contributor,
I want quick feedback on my issue,
So that I know it's being addressed.
```

```
As a contributor,
I want to see related issues and PRs,
So that I don't duplicate work.
```

---

## 4. Functional Requirements

### 4.1 Webhook Processing

| ID | Requirement | Priority |
|----|-------------|----------|
| WH-01 | GitHub webhook 수신 (issues.opened) | P0 |
| WH-02 | Signature 검증 (HMAC-SHA256) | P0 |
| WH-03 | Issue comment 이벤트 처리 | P1 |
| WH-04 | PR 이벤트 처리 | P2 |

### 4.2 Issue Analysis

| ID | Requirement | Priority |
|----|-------------|----------|
| IA-01 | 이슈 유형 분류 (bug/feature/question) | P0 |
| IA-02 | 우선순위 판단 (critical/high/medium/low) | P0 |
| IA-03 | 관련 영역 식별 (frontend/backend/infra) | P1 |
| IA-04 | 유사 이슈 검색 | P1 |
| IA-05 | 코드베이스 분석 | P1 |

### 4.3 Response Generation

| ID | Requirement | Priority |
|----|-------------|----------|
| RG-01 | 분류 기반 라벨 추가 | P0 |
| RG-02 | 초기 응답 댓글 작성 | P0 |
| RG-03 | 코드 수정 제안 (diff 형식) | P2 |
| RG-04 | 관련 문서 링크 | P2 |

### 4.4 Configuration

| ID | Requirement | Priority |
|----|-------------|----------|
| CF-01 | 저장소별 설정 (on/off) | P0 |
| CF-02 | 자동 라벨링 토글 | P0 |
| CF-03 | 자동 응답 토글 | P0 |
| CF-04 | 커스텀 프롬프트 | P2 |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Metric | Target |
|--------|--------|
| Webhook 응답 시간 | < 200ms |
| 분석 완료 시간 | < 30s |
| 동시 처리 이슈 수 | 10+ |

### 5.2 Reliability

| Metric | Target |
|--------|--------|
| Uptime | 99.9% |
| Error rate | < 1% |
| Webhook 재시도 | 자동 (GitHub 제공) |

### 5.3 Security

- GitHub token 안전한 저장 (환경변수)
- Webhook signature 검증 필수
- Rate limiting 적용
- Audit logging

---

## 6. Technical Architecture

### 6.1 Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Framework | Hono |
| AI | Claude Code SDK (claude-code-js) |
| GitHub API | Octokit |
| Validation | Zod |

### 6.2 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Repository                        │
│                         │                                   │
│                    (Webhook)                                │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Frentis AI Agent Platform              │   │
│  │  ┌─────────┐  ┌───────────┐  ┌─────────────────┐   │   │
│  │  │ Webhook │─▶│ Analyzer  │─▶│ Claude Agent    │   │   │
│  │  │ Handler │  │           │  │ (claude-code-js)│   │   │
│  │  └─────────┘  └───────────┘  └─────────────────┘   │   │
│  │       │              │                │             │   │
│  │       ▼              ▼                ▼             │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │              GitHub Client (Octokit)        │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│            (Labels, Comments, PRs)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Milestones

### Phase 1: MVP (Current)

- [x] 프로젝트 초기화
- [x] Webhook 서버 구현
- [x] 이슈 분류기 구현
- [x] GitHub API 통합
- [ ] 로컬 테스트
- [ ] 문서화

### Phase 2: Enhancement

- [ ] 코드베이스 분석 통합
- [ ] 유사 이슈 검색 고도화
- [ ] 커스텀 프롬프트 지원
- [ ] 모니터링 대시보드

### Phase 3: Automation

- [ ] 자동 PR 생성
- [ ] CI/CD 통합
- [ ] Multi-repo 지원
- [ ] 팀 협업 기능

---

## 8. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| 이슈 분류 정확도 | > 85% | 수동 검토 |
| 평균 응답 시간 | < 5분 | 이슈 생성 → 첫 댓글 |
| 라벨 정확도 | > 90% | 수동 검토 |
| 사용자 만족도 | > 4/5 | 피드백 조사 |

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI 오분류 | Medium | 신뢰도 점수 표시, 사람 검토 |
| API Rate Limit | High | 큐잉, 백오프 전략 |
| 잘못된 응답 | High | "AI 생성" 명시, 피드백 루프 |
| 보안 취약점 | Critical | 민감 정보 필터링, 코드 리뷰 |

---

## 10. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| Webhook | GitHub이 이벤트 발생 시 호출하는 HTTP 콜백 |
| Claude Code SDK | Claude AI를 프로그래매틱하게 사용하는 SDK |
| Triage | 이슈 분류 및 우선순위 결정 프로세스 |

### B. References

- [GitHub Webhooks Documentation](https://docs.github.com/en/webhooks)
- [claude-code-js SDK](https://github.com/s-soroosh/claude-code-js)
- [Octokit REST API](https://octokit.github.io/rest.js/)
