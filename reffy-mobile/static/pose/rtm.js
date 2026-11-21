/* 일러스트 캐릭터 포즈 인식 (RTMPose-m body7 + RTMDet-nano, Apache-2.0) — 브라우저에서 onnxruntime-web 으로 실행
   RTM.detect(img) -> { kps: [[x, y, score] × 17 (COCO 순서, 이미지 픽셀)], box } 또는 null
   MediaPipe 는 실사 사진용이라 일러스트(특히 SD·과장된 비율)에서 자세를 잘 못 찾아서, 일러스트는 이걸 씀 */
(function () {
  const BASE = "pose/";
  let ready = null;
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
      const [det, pose] = await Promise.all([
        ort.InferenceSession.create(BASE + "nn/rtmdet-nano-person.onnx", opt),
        ort.InferenceSession.create(BASE + "nn/rtmpose-m-body7-fp16.onnx", opt)]);
      return { ort, det, pose };
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
  async function people(M, img, W, H) {
    const S = 320, r = Math.min(S / W, S / H), c = canvas(S, S), ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "rgb(114,114,114)"; ctx.fillRect(0, 0, S, S); ctx.drawImage(img, 0, 0, W * r, H * r);
    const x = toTensor(M.ort, ctx, S, S, [103.53, 116.28, 123.675], [57.375, 57.12, 58.395], true);
    const o = await M.det.run({ input: x });
    const dets = o.dets.data, labels = o.labels.data, n = o.labels.dims[1], out = [];
    for (let i = 0; i < n; i++) {
      const s = dets[i * 5 + 4];
      if (s > 0.3 && Number(labels[i]) === 0) out.push({ x1: dets[i * 5] / r, y1: dets[i * 5 + 1] / r, x2: dets[i * 5 + 2] / r, y2: dets[i * 5 + 3] / r, s });
    }
    return out;
  }
  async function keypoints(M, img, b) {
    const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
    let bw = (b.x2 - b.x1) * 1.25, bh = (b.y2 - b.y1) * 1.25;
    if (bw / bh > 192 / 256) bh = bw * 256 / 192; else bw = bh * 192 / 256;
    const k = 192 / bw, c = canvas(192, 256), ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 192, 256);
    ctx.setTransform(k, 0, 0, k, 96 - k * cx, 128 - k * cy); ctx.drawImage(img, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const x = toTensor(M.ort, ctx, 192, 256, [123.675, 116.28, 103.53], [58.395, 57.12, 57.375], false);
    const o = await M.pose.run({ input: x });
    const sx = o.simcc_x.data, sy = o.simcc_y.data, LX = 384, LY = 512, kps = [];
    for (let j = 0; j < 17; j++) {
      let ax = 0, mx = -1e9, ay = 0, my = -1e9;
      for (let i = 0; i < LX; i++) { const v = sx[j * LX + i]; if (v > mx) { mx = v; ax = i; } }
      for (let i = 0; i < LY; i++) { const v = sy[j * LY + i]; if (v > my) { my = v; ay = i; } }
      kps.push([(ax / 2 - 96) / k + cx, (ay / 2 - 128) / k + cy, Math.min(mx, my)]);
    }
    return kps;
  }
  async function detect(img) {
    const M = await init();
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const ps = await people(M, img, W, H);
    // 가장 크고 확실한 사람 하나 (없으면 이미지 전체를 한 사람으로 보고 시도)
    const cands = ps.sort((a, b) => b.s * Math.sqrt((b.x2 - b.x1) * (b.y2 - b.y1)) - a.s * Math.sqrt((a.x2 - a.x1) * (a.y2 - a.y1))).slice(0, 3);
    cands.push({ x1: 0, y1: 0, x2: W, y2: H, s: 0 });
    for (const box of cands) {   // 앞 후보에서 관절이 충분히 안 잡히면 다음 후보로
      const kps = await keypoints(M, img, box);
      if (kps.filter((p) => p[2] > 0.3).length >= 8) return { kps, box, people: ps.length, W, H };
    }
    return null;
  }
  window.RTM = { detect, init };
})();
