# 별별별 콘텐츠 인사이트 대시보드

노션 데이터베이스를 매시간 자동으로 읽어와 차트 대시보드 HTML을 만들고,
GitHub Pages에 배포한 뒤 그 주소를 노션 페이지에 임베드하는 구조입니다.

## 1단계. 노션 Integration(API 토큰) 만들기

1. https://www.notion.so/my-integrations 접속 (노션 로그인 상태여야 함)
2. "New integration" 클릭
3. 이름 입력 (예: `학은모 대시보드`), 연결할 워크스페이스 선택 → Submit
4. 생성되면 "Internal Integration Secret" 값이 보여요. `ntn_...`으로 시작하는 문자열을
   복사해두세요. (이게 `NOTION_TOKEN` 입니다)

## 2단계. 데이터베이스에 Integration 연결하기

1. 시각화하고 싶은 노션 데이터베이스 페이지를 엽니다.
2. 오른쪽 상단 `...` 메뉴 → `연결 추가(Connections)` → 방금 만든 Integration 이름 검색해서 추가
   (이 과정을 안 하면 API가 데이터에 접근할 수 없어요)

## 3단계. 데이터베이스 ID 확인하기

데이터베이스를 브라우저에서 전체 페이지로 열면 주소창 URL이 아래처럼 생겼습니다:

```
https://www.notion.so/워크스페이스이름/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d?v=...
```

`?` 앞에 있는 32자리 문자열(`1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d`)이 데이터베이스 ID입니다.

3a1525120f0a80be8e44e8cbd7b5a91b

## 4단계. GitHub 저장소 만들고 코드 올리기

1. GitHub에서 새 저장소 생성 (예: `notion-dashboard`, Public으로)
2. 이 폴더 전체를 그 저장소에 push합니다.

```bash
cd notion-dashboard
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/사용자명/notion-dashboard.git
git push -u origin main
```

## 5단계. GitHub에 비밀값(Secrets) 등록하기

저장소 페이지에서 `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

- `NOTION_TOKEN` : 1단계에서 복사한 `ntn_...` 값
- `NOTION_DATABASE_ID` : 3단계에서 확인한 32자리 데이터베이스 ID

## 6단계. GitHub Pages 활성화

저장소 `Settings` → `Pages` → `Build and deployment` → `Source`를
`Deploy from a branch`로, `Branch`를 `gh-pages`로 설정합니다.
(`gh-pages` 브랜치는 Actions가 처음 실행되면 자동으로 생깁니다. 처음엔 안 보일 수 있어요.)

## 7단계. 첫 실행하기

저장소의 `Actions` 탭 → `Update Notion Dashboard` 워크플로우 선택 →
`Run workflow` 버튼으로 수동 실행합니다. 1~2분 후 완료되면
`https://사용자명.github.io/notion-dashboard/` 주소로 대시보드가 열립니다.

이후에는 매시간 자동으로 갱신돼요 (주기를 바꾸고 싶으면
`.github/workflows/update-dashboard.yml`의 `cron` 값을 수정하면 됩니다).

## 8단계. 노션 페이지에 임베드하기

노션 페이지에서 `/embed` 입력 → 위에서 확인한 GitHub Pages 주소 붙여넣기.
끝입니다.

## 참고사항

- 대시보드는 데이터베이스의 속성 타입(숫자/날짜/카테고리)을 자동으로 감지해서
  라인 차트, 바 차트, 표를 그려줍니다. 속성 이름이 바뀌어도 코드를 수정할 필요가 없어요.
- `scripts/template.html`을 수정하면 디자인이나 차트 구성을 자유롭게 바꿀 수 있습니다.
- 무료 GitHub 계정 기준으로 Actions와 Pages 모두 무료 범위 안에서 충분히 사용 가능합니다.
