/* REFFY: '전체 자세' 비교 — 팔 위·아래, 허벅지, 종아리 8개 뼈의 방향을 몸통 기준 좌표에서 비교 (좌우 반전 포함).
   pose-search 의 부위별 matcher 와 같은 수학(getNormalInLocalSpace 등)을 씀. 보는 각도(몸통 방향)도 함께 비교할 수 있음. */
import SkeletonModel from './components/SkeletonModelCanvas/model/SkeletonModel';
import {angleBetweenVec3} from './utils/math/math';
import Photo from './utils/Photo';
import {cross, flipX, getNormal, getNormalInLocalSpace, mid, normalizedLandmarkToViewSpace} from './Search/impl/math';
import {MatchResult, PoseMatcher} from './Search/impl/search';

type V = [number, number, number];
const VIS = 0.4;
const MAX_MEAN = Math.PI / 180 * 32;   // 평균 뼈 방향 오차 허용
const MAX_BONE = Math.PI / 180 * 80;   // 뼈 하나라도 이보다 틀리면 제외
const MAX_FWD = Math.PI / 180 * 50;    // 몸통이 향한 방향(보는 각도) 허용
const BONES = ['UA', 'LA', 'TH', 'CA'] as const;
const LM = {L: {UA: [11, 13], LA: [13, 15], TH: [23, 25], CA: [25, 27]}, R: {UA: [12, 14], LA: [14, 16], TH: [24, 26], CA: [26, 28]}} as const;

export default class MatchWhole implements PoseMatcher {
    constructor(private cameraFree = false, private loose = 1) {}   // loose > 1 이면 허용 오차를 그만큼 넓힘 (결과가 적을 때 보충용)
    private dir: any = {L: {}, R: {}};
    private mir: any = {L: {}, R: {}};
    private fwd: V = [0, 0, 1];
    private fwdM: V = [0, 0, 1];

    prepare(m: SkeletonModel): void {
        const node: any = {L: {UA: m.leftUpperArm, LA: m.leftLowerArm, TH: m.leftThigh, CA: m.leftCalf}, R: {UA: m.rightUpperArm, LA: m.rightLowerArm, TH: m.rightThigh, CA: m.rightCalf}};
        for (const s of ['L', 'R'] as const) {
            const r0 = s === 'L' ? m.rightUpperArm.originWorldPosition : m.leftUpperArm.originWorldPosition;
            const r1 = s === 'L' ? m.leftUpperArm.originWorldPosition : m.rightUpperArm.originWorldPosition;
            for (const b of BONES) {
                const n = node[s][b];
                this.dir[s][b] = getNormalInLocalSpace(r0, r1, m.trunk.originWorldPosition, m.trunk.controlPointWorldPosition, n.originWorldPosition, n.controlPointWorldPosition);
                this.mir[s][b] = getNormalInLocalSpace(r0, r1, m.trunk.originWorldPosition, m.trunk.controlPointWorldPosition, n.originWorldPosition, n.controlPointWorldPosition, true);
            }
        }
        const up = getNormal(mid(m.leftThigh.originViewPosition, m.rightThigh.originViewPosition), mid(m.leftUpperArm.originViewPosition, m.rightUpperArm.originViewPosition));
        const upM = getNormal(flipX(mid(m.leftThigh.originViewPosition, m.rightThigh.originViewPosition)), flipX(mid(m.leftUpperArm.originViewPosition, m.rightUpperArm.originViewPosition)));
        const right = getNormal(m.rightUpperArm.originViewPosition, m.leftUpperArm.originViewPosition);
        const rightM = getNormal(flipX(m.leftUpperArm.originViewPosition), flipX(m.rightUpperArm.originViewPosition));
        this.fwd = cross(right, up);
        this.fwdM = cross(rightM, upM);
    }

    match(p: Photo): MatchResult | null {
        const n = p.normalizedLandmarks, w = p.worldLandmarks;
        if (!n || n.length < 33 || !w || w.length < 33) return null;
        if (Math.min(n[11].visibility, n[12].visibility, n[23].visibility, n[24].visibility) < VIS) return null;
        const photoDir = (s: 'L' | 'R', b: typeof BONES[number]) => {
            const [a, c] = (LM as any)[s][b];
            const sh = s === 'L' ? [12, 11, 23, 11] : [11, 12, 24, 12];
            return getNormalInLocalSpace(w[sh[0]].point, w[sh[1]].point, w[sh[2]].point, w[sh[3]].point, w[a].point, w[c].point);
        };
        const evalCase = (mirror: boolean) => {
            let sum = 0, cnt = 0, worst = 0;
            for (const s of ['L', 'R'] as const) {
                for (const b of BONES) {
                    const [a, c] = (LM as any)[s][b];
                    if (Math.min(n[a].visibility, n[c].visibility) < VIS) continue;
                    const ref = mirror ? this.mir[s === 'L' ? 'R' : 'L'][b] : this.dir[s][b];
                    const e = angleBetweenVec3(photoDir(s, b), ref);
                    sum += e; cnt++; worst = Math.max(worst, e);
                }
            }
            return cnt >= 5 ? {mean: sum / cnt, worst} : null;
        };
        const aspect = p.width && p.height ? p.width / p.height : 1;
        const ls = normalizedLandmarkToViewSpace(n[11].point, aspect), rs = normalizedLandmarkToViewSpace(n[12].point, aspect);
        const lh = normalizedLandmarkToViewSpace(n[23].point, aspect), rh = normalizedLandmarkToViewSpace(n[24].point, aspect);
        const pf = cross(getNormal(rs, ls), getNormal(mid(lh, rh), mid(ls, rs)));
        let best: MatchResult | null = null;
        for (const mirror of [false, true]) {
            const r = evalCase(mirror);
            if (!r || r.mean > MAX_MEAN * this.loose || r.worst > Math.min(Math.PI, MAX_BONE * this.loose)) continue;
            const fe = this.cameraFree ? 0 : angleBetweenVec3(pf, mirror ? this.fwdM : this.fwd);
            if (fe > MAX_FWD * this.loose) continue;
            const score = (Math.PI - r.mean) * (Math.PI - r.mean) * (Math.PI - fe * 0.5);
            if (!best || score > best.score) best = {score, center: mid(n[11].point, n[12].point, n[23].point, n[24].point) as V, related: [], flip: mirror};
        }
        return best;
    }
}
