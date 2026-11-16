# REFFY — 레퍼런스 검색 서비스 (MVP)

이미지를 올리면 **WD tagger + 우리 팀이 라벨링해서 학습시킨 분류기**가 태그를 붙이고,
검색어·태그 필터·색상으로 레퍼런스를 찾는 서비스입니다. 라벨링 앱(라이트테이블)과는 별도 프로그램입니다.

## 가장 쉬운 실행 (더블클릭)

- **`start.bat`** → 처음 한 번 파이썬 환경·패키지를 설치하고(파이썬이 없으면 Windows 공식 설치 도구 winget 으로 설치), 웹(8100)·모바일(8200) 서버를 켠 뒤 브라우저를 열어요.
- **`share.bat`** → 위와 같이 켜고, **인터넷 어디서나 열리는 공유 링크**(`https://….trycloudflare.com`)를 만들어 줘요. 링크는 화면·`공유주소.txt`에 나오고 자동 복사돼요. 이 컴퓨터와 그 창이 켜져 있는 동안만 열려요.
- 실제 동작은 `launcher.py` 에 있어요(.bat 은 파이썬을 찾아 이 파일을 부르기만 함).

## 폴더 구조
```
reffy/
├─ reffy-web/       웹(PC) 화면 서버   → http://127.0.0.1:8100
│  ├─ app/          서버 (FastAPI)
│  ├─ static/       화면 (HTML · CSS · JS)
│  ├─ tools/        분류기 내보내기 · 재태깅 · 이미지 한꺼번에 넣기
│  ├─ data/         ia.json(태그 사전)만 올라가 있음. DB · 업로드 이미지는 실행하면 생김
│  └─ run.py
└─ reffy-mobile/    모바일 화면 서버   → http://127.0.0.1:8200  (코드는 reffy-web 과 같고 .env 만 다름)
```
- 두 폴더의 코드는 같습니다. 화면 틀은 `.env` 의 `LAYOUT` 으로 정해집니다(`pc` / `mobile` / `auto`).
- 모바일 서버는 기본으로 **reffy-web 의 data 와 models 를 같이 씁니다**(`DATA_DIR=../reffy-web/data`). 웹에서 올린 게시물이 모바일에도 보입니다.
- 코드를 고치면 두 폴더 모두 고쳐야 합니다.

## 실행 (Windows cmd)
처음 한 번:
```
cd reffy
python -m venv .venv
.venv\Scripts\activate
pip install -r reffy-web\requirements.txt
copy reffy-web\.env.example reffy-web\.env
copy reffy-mobile\.env.example reffy-mobile\.env
```
웹 서버 (cmd 창 1):
```
cd reffy\reffy-web
..\.venv\Scripts\activate
python run.py
```
모바일 서버 (cmd 창 2):
```
cd reffy\reffy-mobile
..\.venv\Scripts\activate
python run.py
```
- 처음 켜면 WD tagger 모델(수백 MB)을 `reffy-web/models/` 로 내려받습니다. 라벨링 앱의 `models/wd-vit-tagger-v3/` 를 복사해 넣어도 됩니다.
- 모바일 주소를 PC 브라우저에서 열면 가운데 휴대폰 폭으로 보입니다. 휴대폰에서 열려면 `.env` 에 `HOST=0.0.0.0` 을 넣고, 같은 와이파이에서 `http://<PC의 IPv4 주소>:8200`.
- `.venv`, `.env`, `data/` 의 DB · 업로드 이미지, `models/` 는 GitHub 에 올리지 않습니다(`.gitignore`).

## 팀 분류기 연결 (라벨링 → 서비스)
```
cd reffy-web
python tools/export_classifier.py ../../labeling-app   # models/team_classifier.joblib 생성
python run.py                                          # 다음 실행부터 자동 적용
python -m tools.retag                                  # 이미 올라온 이미지를 새 분류기로 다시 태깅(사용자 수정은 유지)
```

## 이미지 한꺼번에 넣기
```
cd reffy-web
python -m tools.seed 이미지폴더 [작성자]
```

## 태깅 흐름 (PRD 8.2)
1. 업로드 → WD tagger 가 Safebooru 형식 태그 확률을 계산
2. ① 기준표(ia.json)의 Safebooru 태그 매핑 → 키워드 후보 ② 팀 분류기(확률 ≥ `TEAM_PROB` 0.60) → 키워드 후보
3. 같은 "하나만" 축은 확률이 가장 높은 하나만 남김
4. 사용자가 업로드 화면/상세 화면에서 태그를 지우거나 추가 → **최종 태그 = AI 태그(확률 ≥ `TAG_THRESHOLD`) + 사용자 추가 − 사용자 삭제**
   (AI 예측과 사용자 수정은 `image_tags` 에 따로 저장되어 나중에 합치는 규칙을 바꿀 수 있습니다)

## 검색
- 검색어는 공백으로 나눠 각각 태그에 연결합니다: 키워드 이름 > 묶음 이름 > 기준표 Safebooru 태그 > 판단 기준 설명, 그리고 작은 동의어 사전(`app/search.py` 의 `SYN`: "앉은"→앉기 등).
- 태그로 못 찾은 단어는 제목·WD 영어 태그와 비교합니다. 결과 위의 `#태그` 칩은 검색어에서 찾은 태그입니다.
- 필터: 같은 축은 OR, 축끼리는 AND. 정렬: 최근 / 인기(조회수) / 관련도.
- 태그 사전은 라벨링 기준표(`data/ia.json`, 일러스트용 223개)입니다. 기준표가 바뀌면 라벨링 앱의 `app/ia.json` 을 `data/ia.json` 으로 복사하세요.

## 환경 변수 (`.env`)
`LAYOUT`(pc/mobile/auto), `HOST`, `PORT`, `DATA_DIR`·`MODEL_DIR`(다른 폴더 것을 같이 쓸 때), `DB_URL`(비우면 SQLite `data/reffy.db`, MySQL 은 `mysql+pymysql://...`), `TAGGER`(auto/off/mock), `CLASSIFIER`, `WD_THRESHOLD`, `TEAM_PROB`, `TAG_THRESHOLD`, `PORT`.
`TAGGER=mock` 은 모델 없이 화면을 시험하는 가짜 태그입니다. 실제 서비스에는 쓰지 마세요. 값 뒤에 `# 주석`을 붙이지 마세요.

## 계정·킵 스페이스·서랍·알림 (Figma 와이어프레임 반영)
- 화면 주소: `#/` 홈, `#/login`, `#/signup`, `#/keep`(킵 스페이스), `#/drawer`(서랍: 레퍼런스 북 · 최근 본 · 반응한), `#/post/번호`(게시물 상세).
- 둘러보기와 검색은 로그인 없이 되고, 업로드·하트·댓글·팔로우·킵·북·알림은 로그인이 필요합니다.
- 비밀번호는 PBKDF2 로 해시해 저장하고, 세션은 HttpOnly 쿠키를 씁니다. 기존 DB 는 서버를 켤 때 새 테이블과 열이 자동으로 추가되며 데이터는 그대로입니다.
- 로그인 이전에 올라간 이미지는 주인이 없어서, 로그인한 누구나 태그를 고치거나 삭제할 수 있습니다.
- 아직 안 된 것: SNS 로그인(Google·카카오·네이버·X), 비밀번호 찾기, 약관 전문, 프로필·팔로워 화면, 3D 포즈·색상 필터, 북 커버 이미지 직접 업로드(처음 담은 3장이 커버가 됩니다).

## 디자인 (가이드 적용본)
Figma "Web (가이드 적용본)" 기준: GNB 88px(검색 320,22 950×44 · 액션 1340,28), 필터 300px(p24, 항목 pitch 36), 피드 pt29/px24·필터와 20 간격·카드 간격 14, 상세 패널 389px, 알림 팝오버 400px, 로그인 Split 720|720, 업로드 680|680.
아이콘은 `static/icons.js`(Figma Icons 컴포넌트의 SVG 경로 그대로), 폰트는 Pretendard 타입 스케일 변수(`--t-*`, app.css 하단)입니다.

## 컬러 팔레트 검색
- 이미지를 올리면 대표색 최대 5개를 뽑아 DB(`images.colors`)에 저장합니다. 기존 이미지는 서버 시작 때 자동으로 채워요.
- 필터 패널 '색상 필터' 탭에서 색을 고르거나(최대 5개) 직접 입력 → '필터 적용하기'. 상세 화면의 팔레트 버튼에서 그 이미지의 색을 눌러도 같은 색으로 찾아요.
- `GET /api/images?color=#hex,#hex` — 그 색 계열(빨강·파랑 등은 색상 ±30°)이 이미지 면적의 30% 이상이면 노출, 점유율이 큰 순. 검정·회색·흰색은 밝기 구간으로 판단. 이미지 위 팔레트 아이콘 → 대표색 5개를 현재 팔레트로 불러오기(`GET /api/images/{id}/colors`).

## 마이페이지
- `#/me` 내 프로필, `#/u/아이디` 다른 사람 프로필, `#/me/edit` 프로필 편집. 아바타 메뉴 → 마이페이지.
- 프로필: 사진·닉네임·소개(100자)·외부 링크(최대 5개, http(s)만), 게시물/팔로워/팔로잉 수, 게시물·북 탭(북 탭은 본인만). 팔로워/팔로잉 숫자를 누르면 목록 모달.
- API: `GET /api/users/{uid}`, `/posts`, `/books`, `/follows?kind=followers|following`, `PUT /api/me/profile`, `POST|DELETE /api/me/avatar`, `POST /api/books/{id}/cover`.

## 모바일 화면 (Figma "Mobile 2차" 와이어프레임)
- 화면 폭 767px 이하에서 모바일 틀로 바뀝니다. 규칙은 `static/mobile.css`(모바일에서만 읽힘), 화면 조각은 `static/mobile.js` 에 있습니다. PC 화면은 그대로입니다.
- 공통: 하단 탭바(홈 · 킵 스페이스 · 서랍 · 마이페이지), 앱바, 바텀시트(필터 · 정렬 · 더보기 · 북에 저장 · 댓글 · 신고), 확인 모달, 토스트.
- 홈: 필터 시트(키워드 · 3D Pose(준비 중) · 무드), 정렬 시트, 검색 화면(최근 검색어), 검색 결과, 알림(`#/notif`).
- 게시물 상세: 전체 화면, 공유, 더보기 시트, 댓글 전체 보기, 연관 이미지(같은 태그가 많은 순, `GET /api/images/{id}/related`).
- 킵 스페이스 · 서랍(북 / 내 활동, 북 상세 선택 모드의 삭제 · 이동) · 마이페이지 · 타 유저 프로필 · 프로필 수정 · 게시물 등록.
- 설정(`#/settings`): 알림 설정, 계정 관리, 보안(비밀번호 변경), 차단 유저, 문의하기, 개인정보 처리 방침, 서비스 약관, 로그아웃, 탈퇴하기.
- 새 API(`app/extras.py`): 차단 `POST|DELETE /api/users/{uid}/block`, `GET /api/me/blocks` · 신고 `POST /api/reports` · 문의 `POST /api/inquiries` · 알림 설정 `GET|PUT /api/me/settings` · 비밀번호 `PUT /api/me/password` · 탈퇴 `POST /api/me/leave` · 반응한 게시물 `GET /api/me/reacted`.
- 아직 없는 것: 3D Pose 필터와 이미지 기반 관절 검색, 게시물 공개/비공개, 여러 장 올리기 · 임시 저장, 사용한 툴 · 사용 소재, 킵 스페이스 크게 보기(스와이프) · 순서 변경, 방해 금지 시간, 2단계 인증, SNS 계정 연결, 문의 사진 첨부.


## 간격 · 크기 규격 (spacing-guide v0.1)
- PC: GNB 88 · 화면 Margin 24 · 필터 패널 300(Padding 24, 블록 간격 20) · 피드 Padding 위 29 · 왼쪽 20(필터 열림)/24 · 오른쪽 24 · 툴바 ↔ 카드 15 · 카드 Gutter 14.
- 열 수: 필터 열림 5 · 닫힘 6 · 상세를 열면 −1 · 1600 이상 +1 · 태블릿(768~1199) 항상 4(필터 · 상세는 딤 위에 겹치는 드로어).
- 모달 520 · Padding 상하 24 · 좌우 28 · 최대 높이 700 · 딤 40%. 버튼 S 32 / M 40 / L 48 (모서리 6 / 8 / 10). 입력창 48 · 모서리 10.
- 모바일: 앱바 52 · Margin 16 · 그리드 12 · 탭바 83 · 바텀시트 Padding 24 · 확인 모달 342 · 토스트 48. 값은 `static/app.css` · `static/mobile.css` 맨 아래 "spacing-guide" 블록에 있습니다.

## 추가된 기능 (Mobile 2차 · 2215:47019)
- 게시물 공개 / 비공개: 업로드 · 수정에서 설정. 비공개 게시물은 올린 사람만 보고(피드 · 상세 · 이미지 파일 모두), 마이페이지 탭 전체 / 공개 / 비공개.
- 사용 소재 링크(최대 10개), 게시물 수정(제목 · 사용 소재 · 공개 설정), 임시 저장(이 브라우저에만).
- 킵 스페이스 크게 보기(좌우로 넘기기 · 선택 · 삭제 · 북에 저장)와 순서 변경(길게 눌러 끌기, 서버에 저장).
- 검색 결과 0개 화면(추천 키워드 · 추천 레퍼런스), 3D 포즈 탭과 이미지 기반 관절 검색 확인창(화면만, 검색은 준비 중).

## 고정 주소로 올리기 (컴퓨터를 꺼도 열리는 사이트)

Render 무료 웹 서비스에 올리면 `https://reffy-xxxx.onrender.com` 같은 **바뀌지 않는 주소**가 생기고, GitHub 에 push 할 때마다 자동으로 새 버전이 올라가요.

1. https://render.com 에서 **GitHub 계정으로 가입** (카드 등록 필요 없음)
2. 대시보드 → **New → Blueprint** → 이 저장소(`reffy`) 선택 → **Apply** (`render.yaml` 설정이 자동으로 적용됨)
3. 몇 분 뒤 나오는 `https://….onrender.com` 주소를 공유

시연용 게시물 · 이미지 올리기: 내 컴퓨터에서 게시물을 정리한 뒤 `demo.bat` 실행 → `reffy-web/demo-data` 가 만들어짐 → 커밋 · push.

알아 둘 점
- 15분 동안 아무도 안 들어오면 서버가 잠들어요. 다음 사람이 들어올 때 **처음 한 번 1분 정도** 걸려요.
- 서버가 다시 켜질 때마다 `demo-data` 상태로 돌아가요 (사이트에서 새로 올린 글은 임시).
- 무료 서버는 메모리가 작아 **AI 자동 태그는 꺼져 있어요** (업로드 · 태그 직접 추가는 됨).
