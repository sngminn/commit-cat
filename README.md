<div align="center">

<!-- prettier-ignore -->
```text
▄█████ ▄████▄ ██▄  ▄██ ██▄  ▄██ ██ ██████    ▄█████ ▄████▄ ██████ 
██     ██  ██ ██ ▀▀ ██ ██ ▀▀ ██ ██   ██  ▄▄▄ ██     ██▄▄██   ██   
▀█████ ▀████▀ ██    ██ ██    ██ ██   ██      ▀█████ ██  ██   ██   
```

**"고민은 개발만 늦출 뿐, 커밋 메시지 고민은 Commit-cat에게 맡기세요."**

[![version](https://img.shields.io/badge/version-0.3.0-blue.svg)](package.json)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18.0.0-orange.svg)](https://nodejs.org)

`commit-cat`은 **Gemini AI**를 활용하여 Git Stage에 올라온 변경 사항을 분석하고,<br/>가장 적절한 커밋 메시지를 제안, 간단한 코드리뷰를 해줍니다.

[English](#-usage-en) | [한국어](#-usage-ko)

</div>

---

## Features

- Google Gemini API를 통해 소스 코드의 문맥을 이해하고 커밋 메시지를 생성해요.
- 변경된 파일과 라인 정보를 정밀하게 분석하여 요약해요.
- 개선점이나 취약점이 보이면 알려줘요.
- 가벼운 모델을 사용해 5초 내에 응답을 받을 수 있어요.

---

## Installation

```bash
# Clone the repository
git clone https://github.com/sngminn/commit-cat.git

# Install dependencies
npm install

# Link globally (Optional)
npm link
```

---

## Configuration

루트 디렉토리에 `.env` 파일을 생성하고 Gemini API 키를 설정하세요.

```env
GEMINI_API_KEY=your_google_gemini_api_key_here
```

---

## Usage (KO)

가장 빈번하게 사용되는 명령어입니다.

```bash
# 기본 실행 (영어 메시지 추천)
commit-cat

# 한국어 모드 실행
commit-cat -k
```

1. 변경 사항을 `git add` 합니다.
2. `commit-cat`을 실행합니다.
3. AI가 제안하는 커밋 메시지 중 하나를 선택하거나 직접 수정합니다.

---

## Usage (EN)

```bash
# Default execution (Suggests English messages)
commit-cat

# Run with Korean mode
commit-cat -k
```

1. Stage your changes with `git add`.
2. Run `commit-cat`.
3. Select one of the AI-suggested commit messages or edit it yourself.
