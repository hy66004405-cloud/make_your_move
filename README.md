# OPENING — A Designer’s Perspective

체스에서 영감을 받은 인터랙티브 디자이너 포트폴리오입니다.
기존 다른 GitHub 포트폴리오와 별개인 Sites 작업물을 옮긴 저장소입니다.

## 포함된 작업물

2026년 10월 8일 Sites 저장 버전 **103**의 코드, 작업물 이미지, 폰트 및 로컬 라이브러리를 포함합니다.
원본 커밋: `6ff091220a19c8a9b78c7a2ac8c0bc8320ae3d2e`.
웹사이트 동작에 필요한 라이브러리는 `vendor/`에 들어 있어 별도의 API 키 없이 실행할 수 있습니다.

## 로컬 실행

```sh
npm start
```

브라우저에서 `http://127.0.0.1:8766`을 엽니다. Python 3가 필요합니다.

## 공개 배포 — GitHub Pages

1. 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
2. **Actions → Deploy portfolio to GitHub Pages → Run workflow**를 실행합니다.
3. 배포가 성공하면 Pages 설정과 작업 실행 결과에 표시된 URL을 엽니다.

이후 `main` 브랜치에 푸시하면 사이트가 자동으로 갱신됩니다.
GitHub Pages 활성화 전에는 첫 자동 배포가 실패할 수 있으므로 설정 후 다시 실행하세요.

## 다른 호스팅에서 배포

```sh
npm run build
```

생성된 `dist/` 폴더를 정적 웹 호스팅에 배포하면 됩니다. 별도 서버나 환경변수는 필요하지 않습니다.

## 테스트

```sh
npm ci
npm test
```

## 편집 위치

- `app.js`, `motion.js`: 장면 전환 및 애니메이션
- `style.css`: 화면 스타일
- `workboard.js`, `infinite-board.js`: 작업물 보드
- `work-images.js`, `assets/work/`: 작업물 정보 및 이미지
- `ending.js`: 엔딩 장면

라이브러리 라이선스는 `vendor/`에 보존되어 있습니다. 작품과 이미지의 권리는 각 권리자에게 있습니다.
