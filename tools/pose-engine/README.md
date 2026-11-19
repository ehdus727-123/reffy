# REFFY 3D 포즈 엔진 (pose-search 묶음)

- 원본: [x6ud/pose-search](https://github.com/x6ud/pose-search) — MIT License (Copyright (c) 2021 x6ud). 라이선스 전문: `reffy-web/static/pose/LICENSE-pose-search.txt`
- 3D 마네킹 원본 모델: Sketchfab "skeleton" (pose-search 저장소에 포함된 모델, 편집기 왼쪽 위 ⓘ 링크)
- 실사 데이터 `photos.json` · `landmarks.dat`: pose-search 가 Unsplash 사진에서 뽑은 관절 값. 사진은 Unsplash 주소로 바로 보여 주고 작가 이름을 표시합니다.
- 관절 추출: MediaPipe Pose (Apache-2.0), 브라우저에서 jsDelivr 로 불러옵니다.

## 다시 빌드하기

```
git clone https://github.com/x6ud/pose-search.git && cd pose-search
npm install
cp <REFFY>/tools/pose-engine/rpose.ts src/
cp <REFFY>/tools/pose-engine/vite.lib.config.ts .
npx vite build -c vite.lib.config.ts
cp dist-lib/pose-engine.js <REFFY>/reffy-web/static/pose/
cp dist-lib/style.css <REFFY>/reffy-web/static/pose/pose-engine.css
```

`window.RPose` 로 쓰는 기능: `mountEditor(el, {onPart})`, `loadDataset(base)`, `makePhoto(id, normalized, world)`, `search(model, part, photos)`, `searchAll(model, parts, photos)`, `detect(img)`, `setAssetBase(url)`, `PARTS`.
