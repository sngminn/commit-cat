# my-secret-tools

개인 생산성 향상을 위한 Git 워크플로우 자동화 도구 모음입니다.
LLM(Gemini)을 활용하여 커밋 메시지 생성, 코드 리뷰, Pull Request 작성을 자동화합니다.

## Tools

### `smart-commit.mjs`

Git 변경사항(diff)을 분석하여 Conventional Commit 메시지를 생성하고, 코드의 잠재적 문제점(보안, 버그, 스타일)을 리뷰합니다.

- **Commit Message**: 한국어/영어 커밋 메시지 자동 생성
- **Code Review**: Critical 이슈 감지 및 개선 제안 (TODO 주석 삽입 가능)
- **Security**: API Key 등 민감 정보 유출 방지

### `generate-pr.sh`

현재 브랜치와 타겟 브랜치의 차이를 분석하여 Pull Request 제목과 본문을 자동으로 작성합니다.

- `gh` CLI 연동: PR 생성까지 원스톱 처리
- 자동 Merge Base 감지 및 Remote Sync

## Setup

### Prerequisites

- Node.js 18+
- GitHub CLI (`gh`)
- Google Gemini API Key

### Installation

```bash
git clone https://github.com/your/my-secret-tools.git ~/my-secret-tools
cd ~/my-secret-tools
npm install
```

### Configuration

`.env` 파일을 생성하고 API 키를 설정합니다.

```bash
cp .env.example .env
# GEMINI_API_KEY=...
```

### Alias Setup

편리한 사용을 위해 쉘 설정(`~/.zshrc` 등)에 alias를 등록하는 것을 권장합니다.

```bash
export MY_TOOLS="$HOME/my-secret-tools"
alias gcom="node $MY_TOOLS/smart-commit.mjs --korean"
alias gpr="bash $MY_TOOLS/generate-pr.sh"
```

## Usage

```bash
# Smart Commit
git add .
gcom

# Generate PR
gpr [target_branch] # default: develop
```
