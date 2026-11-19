# REFFY 3D 포즈 엔진 (pose-search 묶음)

- 원본: [x6ud/pose-search](https://github.com/x6ud/pose-search) — MIT License (Copyright (c) 2021 x6ud). 라이선스 전문: `reffy-web/static/pose/LICENSE-pose-search.txt`
- 3D 마네킹 원본 모델: Sketchfab "skeleton" (pose-search 저장소에 포함된 모델, 편집기 왼쪽 위 ⓘ 링크)
- 실사 데이터 `photos.json` · `landmarks.dat`: COCO 2017 사진 3,000장의 정답 관절(사람이 직접 찍은 2D 좌표) + RTMW3D 로 추정한 깊이. 만드는 방법은 `tools/pose-data/run_coco.py`. 사진은 서버(`/api/pose/photo/{id}`)가 대신 받아 보여 주고 라이선스와 Flickr 원본을 표시합니다.
- 관절 추출: MediaPipe Pose (Apache-2.0), 브라우저에서 jsDelivr 로 불러옵니다.

## 다시 빌드하기

```
git clone https://github.com/x6ud/pose-search.git && cd pose-search
npm install
cp <REFFY>/tools/pose-engine/rpose.ts <REFFY>/tools/pose-engine/MatchWhole.ts src/
cp <REFFY>/tools/pose-engine/vite.lib.config.ts .
npx vite build -c vite.lib.config.ts
cp dist-lib/pose-engine.js <REFFY>/reffy-web/static/pose/
cp dist-lib/style.css <REFFY>/reffy-web/static/pose/pose-engine.css
```

`window.RPose` 로 쓰는 기능: `mountEditor(el, {onPart})`, `loadDataset(base, ver)`, `makePhoto(id, normalized, world)`, `search(model, part, photos)`, `searchAll(model, parts, photos)`, `detect(img)`, `setAssetBase(url)`, `PARTS`.

> REFFY 수정: `SkeletonModelCanvas.ts` 의 `render()` 맨 앞에 `if (!renderer) return;` 한 줄을 넣고 빌드했습니다 (마운트 전 호출 오류 방지).
> REFFY 수정 2: 관절 핀이 아닌 빈 곳을 왼쪽 버튼으로 끌면 시점이 회전하도록 `onInput` 에 orbit 처리를 넣었습니다 (방향 버튼은 화면에서 숨김).
> REFFY 수정 3: '전체 자세' 비교용 `MatchWhole.ts` 추가 (팔 위·아래 · 허벅지 · 종아리 8개 뼈 방향을 몸통 기준으로 비교, 좌우 반전 포함, 보는 각도 선택). `src/` 에 함께 복사해 빌드하세요. 자기 사진 찾기 시험에서 40장 중 39장이 1위.
