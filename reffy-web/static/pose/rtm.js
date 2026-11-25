/* 포즈 인식 (YOLOX-Tiny 사람 검출 + RTMPose-m 관절 17점, 둘 다 Apache-2.0) — 브라우저에서 onnxruntime-web 으로 실행
   RTM.detect(img) -> { kps: [[x, y, score] × 17 (COCO 순서, 이미지 픽셀)], box, W, H } 또는 null
   1) YOLOX 로 사람 상자를 찾고 2) 상자 안을 RTMPose 로 관절을 찍음. 일러스트·사진 모두 이걸로 3D 포즈 검색용 관절을 뽑음
   (MediaPipe 는 실사 사진에서만 잘 맞아서, 일러스트 캐릭터는 이 방식이 훨씬 잘 잡음) */
(function () {
  const BASE = "pose/";
  // 관절 모델: RTMPose-m (몸 17점, fp16 27MB)
  const MODELS = { rtm: { file: "rtmpose-m-body7-fp16.onnx", w: 192, h: 256, n: 17 } };
  const ORDER = ["rtm"];
  let ready = null; const poseS = {};
  function loadOrt() {
    if (window.ort) return Promise.resolve(window.ort);
    return new Promise((ok, bad) => {
      const s = document.createElement("script");
      s.src = "vendor/ort/ort.wasm.min.js";
      s.onload = () => (window.ort ? ok(window.ort) : bad(new Error("포즈 인식 엔진을 불러오지 못했어요")));
      s.onerror = () => bad(new Error("포즈 인식 엔진을 불러오지 못했어요"));
      document.head.append(s);
    });
  }
  function init() {
    if (ready) return ready;
    ready = (async () => {
      const ort = await loadOrt();
      ort.env.wasm.wasmPaths = new URL("vendor/ort/", location.href).href;
      ort.env.wasm.numThreads = 1;   // 다중 스레드는 cross-origin isolation 이 필요해서 1개로
      const opt = { executionProviders: ["wasm"] };
      const det = await ort.InferenceSession.create(BASE + "nn/yolox-tiny-fp16.onnx", opt);
      return { ort, det, opt };
    })();
    ready.catch(() => { ready = null; });
    return ready;
  }
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  // HWC RGBA -> NCHW float32, (값 - mean) / std. bgr=true 면 채널 순서를 B,G,R 로
  function toTensor(ort, ctx, w, h, mean, std, bgr) {
    const d = ctx.getImageData(0, 0, w, h).data, n = w * h, out = new Float32Array(3 * n);
    const ch = bgr ? [2, 1, 0] : [0, 1, 2];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[c * n + i] = (d[i * 4 + ch[c]] - mean[c]) / std[c];
    return new ort.Tensor("float32", out, [1, 3, h, w]);
  }
  /* YOLOX-Tiny: 416 정사각(왼쪽 위 정렬, 남는 곳 회색 114) · BGR 0~255 그대로 · 출력 [3549, 85] = 격자별 (x, y, w, h, 물체 점수, 80가지 분류 점수)
     사람(분류 0) 점수 = 물체 × 사람. 일러스트 캐릭터는 점수가 낮게 나오는 일이 많아 0.05 까지 받아 두고 고를 때 순서로 씀 */
  const YS = 416, GRID = (() => { const g = []; for (const s of [8, 16, 32]) { const n = YS / s; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g.push([x, y, s]); } return g; })();
  async function people(M, img, W, H) {
    const r = Math.min(YS / W, YS / H), c = canvas(YS, YS), ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "rgb(114,114,114)"; ctx.fillRect(0, 0, YS, YS); ctx.drawImage(img, 0, 0, W * r, H * r);
    const x = toTensor(M.ort, ctx, YS, YS, [0, 0, 0], [1, 1, 1], true);
    const o = (await M.det.run({ images: x })).output.data, raw = [];
    for (let i = 0; i < GRID.length; i++) {
      const b = i * 85, s = o[b + 4] * o[b + 5];
      if (s < 0.05) continue;
      const [gx, gy, st] = GRID[i], cx = (o[b] + gx) * st, cy = (o[b + 1] + gy) * st, w = Math.exp(o[b + 2]) * st, h = Math.exp(o[b + 3]) * st;
      raw.push({ x1: (cx - w / 2) / r, y1: (cy - h / 2) / r, x2: (cx + w / 2) / r, y2: (cy + h / 2) / r, s });
    }
    raw.sort((a, b) => b.s - a.s);
    const out = [], iou = (a, b) => { const iw = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)), ih = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)), i = iw * ih; return i / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - i); };
    for (const d of raw) if (!out.some((k) => iou(k, d) > 0.45)) { d.x1 = Math.max(0, d.x1); d.y1 = Math.max(0, d.y1); d.x2 = Math.min(W, d.x2); d.y2 = Math.min(H, d.y2); out.push(d); }
    return out;
  }
  async function poseSession(M, key) {   // 관절 모델은 필요할 때 한 번만 불러옴
    if (!poseS[key]) { poseS[key] = M.ort.InferenceSession.create(BASE + "nn/" + MODELS[key].file, M.opt); poseS[key].catch(() => { delete poseS[key]; }); }
    return poseS[key];
  }
  async function keypoints(M, img, b, PM, sess) {
    const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
    let bw = (b.x2 - b.x1) * 1.25, bh = (b.y2 - b.y1) * 1.25;
    const IW = PM.w, IH = PM.h;
    if (bw / bh > IW / IH) bh = bw * IH / IW; else bw = bh * IW / IH;
    const k = IW / bw, c = canvas(IW, IH), ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, IW, IH);
    ctx.setTransform(k, 0, 0, k, IW / 2 - k * cx, IH / 2 - k * cy); ctx.drawImage(img, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const x = toTensor(M.ort, ctx, IW, IH, [123.675, 116.28, 103.53], [58.395, 57.12, 57.375], false);
    const o = await sess.run({ input: x });
    const sx = o.simcc_x.data, sy = o.simcc_y.data, LX = IW * 2, LY = IH * 2, kps = [];
    for (let j = 0; j < PM.n; j++) {
      let ax = 0, mx = -1e9, ay = 0, my = -1e9;
      for (let i = 0; i < LX; i++) { const v = sx[j * LX + i]; if (v > mx) { mx = v; ax = i; } }
      for (let i = 0; i < LY; i++) { const v = sy[j * LY + i]; if (v > my) { my = v; ay = i; } }
      kps.push([(ax / 2 - IW / 2) / k + cx, (ay / 2 - IH / 2) / k + cy, Math.min(mx, my)]);
    }
    return kps;
  }
  async function detect(img) {
    const M = await init();
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const ps = await people(M, img, W, H);
    // 확실한 사람(0.3 이상)은 크고 확실한 순서로 3명까지, 그다음 점수가 낮아도 가장 그럴듯한 상자 하나, 마지막으로 이미지 전체를 한 사람으로 보고 시도
    const big = (a) => a.s * Math.sqrt((a.x2 - a.x1) * (a.y2 - a.y1));
    const cands = ps.filter((p) => p.s >= 0.3).sort((a, b) => big(b) - big(a)).slice(0, 3);
    const weak = ps.find((p) => p.s < 0.3 && (p.x2 - p.x1) * (p.y2 - p.y1) > 0.1 * W * H);
    if (weak) cands.push(weak);
    cands.push({ x1: 0, y1: 0, x2: W, y2: H, s: 0 });
    for (const key of ORDER) {
      const sess = await poseSession(M, key);
      for (const box of cands) {   // 앞 후보에서 관절이 충분히 안 잡히면 다음 후보로
        const kps = await keypoints(M, img, box, MODELS[key], sess);
        if (kps.slice(0, 17).filter((p) => p[2] > 0.3).length >= 8) return { kps, box, people: ps.filter((p) => p.s >= 0.3).length, W, H, model: key };
      }
    }
    return null;
  }
  window.RTM = { detect, init };
})();
