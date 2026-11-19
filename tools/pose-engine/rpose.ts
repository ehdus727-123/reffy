/* REFFY 3D 포즈 엔진 — x6ud/pose-search (MIT) 를 감싼 묶음. 화면은 REFFY 쪽에서 만들고, 여기서는
   3D 마네킹 · 관절 그룹 비교 검색 · 이미지 관절 추출(MediaPipe Pose)만 제공합니다. */
import type {Pose, Results} from '@mediapipe/pose';
import {createApp, h, reactive, ref} from 'vue';
import SkeletonModelCanvas from './components/SkeletonModelCanvas/SkeletonModelCanvas.vue';
import {BodyPart} from './components/SkeletonModelCanvas/model/BodyPart';
import SkeletonModel from './components/SkeletonModelCanvas/model/SkeletonModel';
import DraggableCamera from './utils/DraggableCamera';
import Photo from './utils/Photo';
import MatchChest from './Search/impl/MatchChest';
import MatchCrotch from './Search/impl/MatchCrotch';
import MatchElbow from './Search/impl/MatchElbow';
import MatchElbowCameraUnrelated from './Search/impl/MatchElbowCameraUnrelated';
import MatchFace from './Search/impl/MatchFace';
import MatchHip from './Search/impl/MatchHip';
import MatchHipCameraUnrelated from './Search/impl/MatchHipCameraUnrelated';
import MatchKnee from './Search/impl/MatchKnee';
import MatchKneeCameraUnrelated from './Search/impl/MatchKneeCameraUnrelated';
import MatchShoulder from './Search/impl/MatchShoulder';
import MatchShoulderCameraUnrelated from './Search/impl/MatchShoulderCameraUnrelated';
import {filterAndSort, PoseMatcher} from './Search/impl/search';

type LM = { point: [number, number, number], visibility: number };
const NUM = 33;

/* 관절 그룹 (pose-search 와 같은 11개) — key 는 원본 이름, label 은 화면용 한국어 */
export const PARTS: { key: string, label: string, matcher: PoseMatcher, free?: PoseMatcher, highlights: BodyPart[] }[] = [
    {key: 'Face', label: '얼굴', matcher: new MatchFace(), highlights: [BodyPart.head]},
    {key: 'Chest', label: '가슴', matcher: new MatchChest(), highlights: [BodyPart.trunk]},
    {key: 'Left Shoulder', label: '왼쪽 어깨', matcher: new MatchShoulder(true), free: new MatchShoulderCameraUnrelated(true), highlights: [BodyPart.trunk, BodyPart.leftUpperArm]},
    {key: 'Right Shoulder', label: '오른쪽 어깨', matcher: new MatchShoulder(false), free: new MatchShoulderCameraUnrelated(false), highlights: [BodyPart.trunk, BodyPart.rightUpperArm]},
    {key: 'Left Elbow', label: '왼쪽 팔꿈치', matcher: new MatchElbow(true), free: new MatchElbowCameraUnrelated(true), highlights: [BodyPart.leftUpperArm, BodyPart.leftLowerArm]},
    {key: 'Right Elbow', label: '오른쪽 팔꿈치', matcher: new MatchElbow(false), free: new MatchElbowCameraUnrelated(false), highlights: [BodyPart.rightUpperArm, BodyPart.rightLowerArm]},
    {key: 'Crotch', label: '골반', matcher: new MatchCrotch(), highlights: [BodyPart.trunk]},
    {key: 'Left Hip', label: '왼쪽 고관절', matcher: new MatchHip(true), free: new MatchHipCameraUnrelated(true), highlights: [BodyPart.trunk, BodyPart.leftThigh]},
    {key: 'Right Hip', label: '오른쪽 고관절', matcher: new MatchHip(false), free: new MatchHipCameraUnrelated(false), highlights: [BodyPart.trunk, BodyPart.rightThigh]},
    {key: 'Left Knee', label: '왼쪽 무릎', matcher: new MatchKnee(true), free: new MatchKneeCameraUnrelated(true), highlights: [BodyPart.leftThigh, BodyPart.leftCalf]},
    {key: 'Right Knee', label: '오른쪽 무릎', matcher: new MatchKnee(false), free: new MatchKneeCameraUnrelated(false), highlights: [BodyPart.rightThigh, BodyPart.rightCalf]},
];

/* 마네킹 신체 부위를 누르면 가장 알맞은 관절 그룹 (pose-search 의 onControlPointClick 과 같은 규칙) */
function partForBody(bp: BodyPart): string | null {
    let best: string | null = null, bestScore = -1;
    for (const p of PARTS) {
        const i = p.highlights.indexOf(bp);
        if (i >= 0) {
            const s = (p.highlights.length - i) * 100 - p.highlights.length;
            if (s > bestScore) { bestScore = s; best = p.key; }
        }
    }
    return best;
}

export type Editor = {
    model: SkeletonModel,
    setPart(key: string | null): void,
    setLandmarks(lm: LM[] | null): void,
    getPose(): Record<string, { f: number[], u: number[] }>,
    setPose(p: Record<string, { f: number[], u: number[] }>): void,
    reset(): void,
    destroy(): void,
};

/* 3D 마네킹 편집기를 el 안에 띄웁니다. 관절 핀을 끌어 자세를 바꾸고, 부위를 누르면 onPart(key) */
export function mountEditor(el: HTMLElement, opts: { onPart?: (key: string) => void } = {}): Editor {
    const model = new SkeletonModel();
    const camera = new DraggableCamera();
    const state = reactive<{ landmarks?: LM[], highlights: BodyPart[] }>({landmarks: undefined, highlights: []});
    const comp = ref<any>();
    const app = createApp({
        render: () => h(SkeletonModelCanvas as any, {
            ref: comp, model, camera, landmarks: state.landmarks, highlights: state.highlights,
            onControlPointClick: (bp: BodyPart) => { const k = partForBody(bp); if (k && opts.onPart) opts.onPart(k); },
        }),
    });
    app.mount(el);
    return {
        model,
        setPart(key) { const p = PARTS.find(p => p.key === key); state.highlights = p ? p.highlights.slice() : []; },
        setLandmarks(lm) { state.landmarks = lm && lm.length ? lm.slice() : undefined; },
        reset() { state.landmarks = undefined; comp.value?.reset?.(); },
        getPose() {
            const out: Record<string, { f: number[], u: number[] }> = {};
            Object.keys(BodyPart).forEach(n => { const nd = (model as any)[n]; out[n] = {f: Array.from(nd.forward as any), u: Array.from(nd.up as any)}; });
            return out;
        },
        setPose(p) {
            Object.keys(BodyPart).forEach(n => { const nd = (model as any)[n]; if (p && p[n]) { nd.forward = p[n].f.slice(); nd.up = p[n].u.slice(); } });
            model.update(camera.camera);
            state.highlights = state.highlights.slice();   // 다시 그리기
        },
        destroy() { app.unmount(); },
    };
}

/* 사진 한 장의 관절 정보 → 검색용 Photo */
export function makePhoto(id: string, normalized: LM[], world: LM[], extra: any = {}): Photo {
    const p = new Photo();
    p.id = id; p.normalizedLandmarks = normalized; p.worldLandmarks = world;
    Object.assign(p, extra);
    return p;
}

/* pose-search 실사 데이터(Unsplash): photos.json + landmarks.dat */
export async function loadDataset(base: string): Promise<Photo[]> {
    const [photos, buf] = await Promise.all([
        fetch(base + 'photos.json').then(r => r.json()),
        fetch(base + 'landmarks.dat').then(r => r.arrayBuffer()),
    ]);
    const f = new Float32Array(buf);
    return photos.map((j: any[], i: number) => {
        const n: LM[] = [], w: LM[] = [];
        for (let k = 0; k < NUM; ++k) {
            const o = i * NUM * 7 + k * 7;
            n[k] = {point: [f[o], f[o + 1], f[o + 2]], visibility: f[o + 6]};
            w[k] = {point: [f[o + 3], f[o + 4], f[o + 5]], visibility: f[o + 6]};
        }
        return makePhoto(j[0], n, w, {width: j[1], height: j[2], full: j[3], regular: j[4], authorName: j[5], authorUsername: j[6], gender: j[7]});
    });
}

/* 지금 마네킹 자세와 비교해 비슷한 순으로 */
export function search(model: SkeletonModel, key: string, photos: Photo[], opt: { cameraFree?: boolean, limit?: number } = {}) {
    const p = PARTS.find(p => p.key === key);
    if (!p) return [];
    const m = opt.cameraFree && p.free ? p.free : p.matcher;
    return filterAndSort(photos, model, m).slice(0, opt.limit || 100);
}

/* 여러 관절 그룹을 합쳐 점수 (그룹마다 순위 점수를 더함) — 전체 자세 비교에 씀 */
export function searchAll(model: SkeletonModel, keys: string[], photos: Photo[], opt: { cameraFree?: boolean, limit?: number } = {}) {
    const total = new Map<Photo, { score: number, n: number, flip: boolean }>();
    for (const k of keys) {
        const r = search(model, k, photos, {cameraFree: opt.cameraFree, limit: photos.length});
        r.forEach((x, i) => {
            const t = total.get(x.photo) || {score: 0, n: 0, flip: x.flip};
            t.score += 1 - i / Math.max(1, r.length); t.n++; total.set(x.photo, t);
        });
    }
    return [...total.entries()].filter(([, t]) => t.n >= Math.ceil(keys.length / 2))
        .map(([photo, t]) => ({photo, score: t.score / keys.length, flip: t.flip}))
        .sort((a, b) => b.score - a.score).slice(0, opt.limit || 100);
}

/* 이미지에서 관절 추출 (MediaPipe Pose, 브라우저 안에서 실행) */
let posePromise: Promise<Pose> | null = null;
let poseCb: ((r: Results) => void) | null = null;
let CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1635988162/';
export function setAssetBase(u: string) { CDN = u; }
function getPose(): Promise<Pose> {
    return posePromise = posePromise || (async () => {
        if (!(window as any).Pose) await new Promise<void>((ok, bad) => { const sc = document.createElement('script'); sc.src = CDN + 'pose.js'; sc.crossOrigin = 'anonymous'; sc.onload = () => ok(); sc.onerror = () => bad(new Error('MediaPipe Pose 를 불러오지 못했어요')); document.head.appendChild(sc); });
        const pose: Pose = new (window as any).Pose({locateFile: (f: string) => CDN + f});
        pose.setOptions({selfieMode: false, modelComplexity: 1, smoothLandmarks: false});
        pose.onResults((r) => poseCb && poseCb(r));
        await pose.initialize();
        return pose;
    })();
}
export async function detect(image: HTMLImageElement | HTMLCanvasElement): Promise<{ normalized: LM[], world: LM[] } | null> {
    const pose = await getPose();
    pose.reset();
    const r: Results = await new Promise(async (res) => { poseCb = res; await pose.send({image}); });
    if (!r?.poseLandmarks?.length || !r?.poseWorldLandmarks?.length) return null;
    return {
        normalized: r.poseLandmarks.map(l => ({point: [l.x, l.y, -l.z] as [number, number, number], visibility: l.visibility || 0})),
        world: r.poseWorldLandmarks.map(l => ({point: [l.x, -l.y, -l.z] as [number, number, number], visibility: l.visibility || 0})),
    };
}
(window as any).RPose = {PARTS, mountEditor, makePhoto, loadDataset, search, searchAll, detect, setAssetBase};
