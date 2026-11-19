"use strict";
/* REFFY 프런트엔드 — 의존성 없음. 사용자 입력은 모두 textContent 로만 넣습니다. */
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "class") e.className = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const svg = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ic"); s.setAttribute("aria-hidden", "true"); const p = document.createElementNS(s.namespaceURI, "path"); p.setAttribute("d", d); s.append(p); return s; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장소를 못 쓰는 환경 */ } },
};
async function api(path, opt) {
  const r = await fetch(path, opt);
  let d = null; try { d = await r.json(); } catch { /* 본문 없음 */ }
  if (!r.ok) throw new Error((d && (d.detail || d.error)) || "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return d;
}
function toast(msg, link) { const t = $("#toast"); t.replaceChildren(msg, link ? h("a", { href: link[1], onclick: () => t.classList.remove("show") }, link[0]) : ""); t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), link ? 5000 : 2600); }

/* 모달·시트를 닫을 때 바로 지우지 않고 짧게 사라지는 움직임을 보여 준 뒤 지움 ('동작 줄이기' 설정이면 바로 지움) */
{ const rm = Element.prototype.remove; const calm = matchMedia("(prefers-reduced-motion: reduce)");
  Element.prototype.remove = function () {
    if (this.nodeType === 1 && this.classList.contains("closing")) return;   // 이미 사라지는 중
    if (this.nodeType === 1 && this.classList.contains("modal") && this.isConnected && !calm.matches) {
      this.classList.add("closing"); setTimeout(() => rm.call(this), 190); return;
    }
    return rm.call(this);
  }; }

/* 모바일(767px 이하) 여부. 모바일 전용 화면 조각은 mobile.js · mobile.css 에 있습니다. */
const NO_LOGIN = window.REFFY_NO_LOGIN !== false;          // 시연 모드: 로그인·회원가입 화면 없이 게스트 계정으로 바로 입장
const LAYOUT = window.REFFY_LAYOUT || "auto";   // 서버 .env 의 LAYOUT: auto / pc / mobile
const MQ = window.matchMedia("(max-width:767px)");
const isM = () => LAYOUT === "mobile" || (LAYOUT !== "pc" && MQ.matches);
{ const l = document.querySelector('link[href^="mobile.css"]'); if (l) l.media = LAYOUT === "mobile" ? "all" : LAYOUT === "pc" ? "not all" : "(max-width:767px)"; }
document.documentElement.classList.toggle("m", isM());
document.documentElement.classList.toggle("m-force", LAYOUT === "mobile");

const S = { q: "", picked: new Set(), applied: [], sort: "", items: [], total: 0, loading: false, done: false, vocab: null, labels: {}, open: null, req: 0, colors: [], pickColors: [], hist: [] };

/* ---------------------------------------------------------------- 사용자(서버 계정) */
let ME = null, UNREAD = 0;
async function loadMe() {
  const r = await api("/api/auth/me"); ME = r.user; UNREAD = r.unread;
  if (!ME && NO_LOGIN) { try { ME = (await api("/api/auth/guest", { method: "POST" })).user; } catch { /* 꺼져 있으면 그대로 */ } }
  drawMe();
}
function drawMe() {
  $("#me").replaceChildren(ME ? (ME.avatar ? h("img", { src: ME.avatar, alt: "" }) : ME.nick.slice(0, 1).toUpperCase()) : "");
  $("#me").title = ME ? `${ME.nick} · 메뉴` : "로그인";
  $("#bell").classList.toggle("has", UNREAD > 0);
}
function needLogin() { if (ME) return true; if (NO_LOGIN) { loadMe().catch(() => {}); toast("잠시 후 다시 눌러 주세요"); return false; } sessionStorage.setItem("reffy.next", location.hash || "#/"); location.hash = "#/login"; return false; }
const goPost = (id) => { location.hash = "#/post/" + id; };

/* ---------------------------------------------------------------- 필터 패널 */
async function loadVocab() {
  S.vocab = await api("/api/vocab");
  S.vocab.groups.forEach((g) => g.axes.forEach((a) => a.tags.forEach((t) => (S.labels[t.ikey] = { label: t.kw, short: t.label, axis: a.name, group: g.name }))));
  drawGroups();
}
const openState = store.get("reffy.open", {});
const KINDS = [["illust", "일러스트"], ["photo", "사진"]];
/* PC: 필터 패널에서 태그를 고르면 바로 적용 → 상단에 칩으로 나타남 (모바일은 시트의 '적용하기'로) */
function liveApply() { /* 체크만으로는 적용하지 않음 — ‘필터 적용하기’를 눌러야 결과에 반영 */ }
function drawGroups() {
  const root = $("#groups"); root.replaceChildren();
  S.pickedKind = S.pickedKind || new Set();
  if (!isM()) return drawFilterPC(root);
  // 종류(사진 · 일러스트)는 맨 위 그룹. 모바일은 축(인물 수 · 성별 …)마다 접히는 그룹으로 보여 줍니다 (HOM_0201)
  const kindAxis = { name: "종류", mode: "", kind: true, tags: KINDS.map(([k, l]) => ({ ikey: "kind:" + k, label: l, kind: k })) };
  const groups = isM()
    ? [{ name: "종류", axes: [kindAxis] }, ...S.vocab.groups.flatMap((g) => g.axes.map((a) => ({ name: a.name, axes: [a], one: true })))]
    : [{ name: "종류", axes: [kindAxis], one: true }, ...S.vocab.groups];
  groups.forEach((g, gi) => {
    if (!isM() && gi === 0) {   // Web 2차: '종류'는 접히지 않는 작은 제목 + 구분선
      root.append(h("div", { class: "ftype" }, h("h4", {}, "종류"), h("div", { class: "ftype-items" }, g.axes[0].tags.map((t) => h("label", { class: "chk" },
        h("input", { type: "checkbox", checked: S.pickedKind.has(t.kind), onchange: (e) => { e.target.checked ? S.pickedKind.add(t.kind) : S.pickedKind.delete(t.kind); liveApply(); } }), t.label)))));
      return;
    }
    const open = openState[g.name] ?? gi < (isM() ? 3 : 2);
    const box = h("div", { class: "fgroup", "data-open": String(open) });
    const btn = h("button", { type: "button", "aria-expanded": String(open), onclick: () => { const o = box.dataset.open !== "true"; box.dataset.open = String(o); btn.setAttribute("aria-expanded", String(o)); openState[g.name] = o; store.set("reffy.open", openState); } }, g.name, icon("chevronDown"));
    const body = h("div", { class: "fbody" });
    g.axes.forEach((a) => body.append(h("div", { class: "axis" },
      g.one || a.name === g.name ? null : h("h4", {}, a.name),
      a.tags.map((t) => h("label", { class: "chk" },
        h("input", { type: "checkbox", checked: t.kind ? S.pickedKind.has(t.kind) : S.picked.has(t.ikey), onchange: (e) => { const set = t.kind ? S.pickedKind : S.picked; const v = t.kind || t.ikey; e.target.checked ? set.add(v) : set.delete(v); liveApply(); } }),
        t.label)))));
    box.append(btn, body); root.append(box);
  });
}
/* ---- PC 필터 패널 (Figma FilterPanel 2460:122490) ----
   위: 종류 · 스타일 · 기본 정보 칩 / 아래: 카테고리 5개 → 누르면 패널 바로 옆에 FilterFlyout 이 떠요.
   플라이아웃은 화면 위에 떠 있는 창(position:fixed)이라 피드 이미지를 밀지 않고 그 위에 겹쳐 보입니다.
   칩·스와치·아이콘을 눌러도 바로 적용되지 않고 ‘적용하기’를 눌러야 결과에 반영돼요. */
const FP_CATS = [   // [vocab 그룹, 패널 메뉴 이름, 플라이아웃 제목]
  ["인물 외형", "인물 외형", "인물 외형"],
  ["의상·장신구", "의상/악세사리", "의상/장신구"],
  ["얼굴 방향, 감정", "감정", "감정"],
  ["앵글, 자세", "앵글/자세", "앵글/자세"],
  ["분위기", "분위기", "분위기"],
];
/* 태그 목록·순서·이름은 서버의 exposed.json(사용자 노출 시트 + Figma)을 그대로 따름.
   선택 방식이 '토글'인 축(앞머리 · 특수동공)은 스위치 하나 — 켜면 그 태그(해당 종류 중 하나라도 있는 이미지)를 고른 것 */
const FP_SW = { "빨강": "#E5484D", "주황": "#F76B15", "노랑": "#FFD23F", "초록": "#30A46C", "파랑": "#3E63DD", "보라": "#8E4EC6", "검정": "#18171A", "흰색": "#FFFFFF", "분홍": "#F5A3C7", "갈색": "#8D5B3A", "회색": "#9E9E9E" };
const FP_SW_X = { "여러 색": "conic-gradient(#E5484D,#FFD23F,#30A46C,#3E63DD,#8E4EC6,#E5484D)", "오드아이": "linear-gradient(90deg,#E5484D 50%,#3E63DD 50%)" };
/* 감정 · 날씨 아이콘 (Figma icon/emotion · icon/weather, Gray 상태 SVG 그대로). 선택(Purple)은 선 #7425F6 + 채움 #F5EEFF 인 요소(f) */
const FP_IC = {
  "기쁨": ['<circle cx="12" cy="12" r="9" stroke="#6F6D72" stroke-width="1.5" f/><path d="M8 11C8.8 9.93335 9.6 9.93335 10.4 11" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.6 11C14.4 9.93335 15.2 9.93335 16 11" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.6 14H14.4C14.4 14.6365 14.1471 15.247 13.6971 15.6971C13.247 16.1471 12.6365 16.4 12 16.4C11.3635 16.4 10.753 16.1471 10.3029 15.6971C9.85285 15.247 9.6 14.6365 9.6 14Z" fill="#6F6D72"/>'],
  "슬픔": ['<circle cx="12" cy="12" r="9" stroke="#6F6D72" stroke-width="1.5" f/><path d="M8 11.2L10 10.4" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 11.2L14 10.4" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.8 16.2C11.2667 15.1333 12.7333 15.1333 14.2 16.2" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.4 12.4C15.84 13.04 16.12 13.44 16.12 13.76C16.12 13.951 16.0441 14.1341 15.9091 14.2691C15.7741 14.4041 15.591 14.48 15.4 14.48C15.209 14.48 15.0259 14.4041 14.8909 14.2691C14.7559 14.1341 14.68 13.951 14.68 13.76C14.68 13.44 14.96 13.04 15.4 12.4Z" fill="#6F6D72"/>'],
  "화남": ['<circle cx="12" cy="12" r="9" stroke="#6F6D72" stroke-width="1.5" f/><path d="M7.8 10L10.2 11.2" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.2 10L13.8 11.2" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 15.8C11.3333 15 12.6667 15 14 15.8" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>'],
  "놀람": ['<circle cx="12" cy="12" r="9" stroke="#6F6D72" stroke-width="1.5" f/><path d="M9.2 10.6V10.7" stroke="#6F6D72" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.8 10.6V10.7" stroke="#6F6D72" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 13.8C11.6287 13.8001 11.2727 13.9688 11.0103 14.2689C10.7478 14.569 10.6004 14.976 10.6005 15.4003C10.6006 15.8246 10.7481 16.2315 11.0106 16.5315C11.2732 16.8315 11.6292 17 12.0005 17C12.3718 17 12.7278 16.8315 12.9904 16.5315C13.2529 16.2315 13.4004 15.8246 13.4005 15.4003C13.4006 14.976 13.2532 14.569 12.9907 14.2689C12.7283 13.9688 12.3723 13.8001 12.001 13.8H12Z" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>'],
  "부끄러움": ['<circle cx="12" cy="12" r="9" stroke="#6F6D72" stroke-width="1.5" f/><path d="M8 10.6C8.8 11.5333 9.6 11.5333 10.4 10.6" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.6 10.6C14.4 11.5333 15.2 11.5333 16 10.6" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 15.2C11.3333 14.8667 11.6667 14.8667 12 15.2C12.3333 15.5333 12.6667 15.5333 13 15.2" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.39999 14L7.09999 13.1" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round"/><path d="M7.59999 14L8.29999 13.1" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round"/><path d="M15.7 14L16.4 13.1" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round"/><path d="M16.9 14L17.6 13.1" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round"/>'],
  "두려움": ['<circle cx="12" cy="12" r="9" stroke="#6F6D72" stroke-width="1.5" f/><path d="M9.20001 11V11.1" stroke="#6F6D72" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.8 11V11.1" stroke="#6F6D72" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.60001 15.6C10 15.1333 10.4 15.1333 10.8 15.6C11.2 16.0667 11.6 16.0667 12 15.6C12.4 15.1333 12.8 15.1333 13.2 15.6C13.6 16.0667 14 16.0667 14.4 15.6" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.2 6C17.6125 6.6 17.875 6.975 17.875 7.275C17.875 7.45402 17.8039 7.62571 17.6773 7.7523C17.5507 7.87888 17.379 7.95 17.2 7.95C17.021 7.95 16.8493 7.87888 16.7227 7.7523C16.5961 7.62571 16.525 7.45402 16.525 7.275C16.525 6.975 16.7875 6.6 17.2 6Z" fill="#6F6D72"/>'],
  "무표정": ['<circle cx="12" cy="12" r="9" stroke="#6F6D72" stroke-width="1.5" f/><path d="M10.4 15.2H13.6" stroke="#6F6D72" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.20001 11V11.1" stroke="#6F6D72" stroke-width="1.8" stroke-linecap="round"/><path d="M14.8 11V11.1" stroke="#6F6D72" stroke-width="1.8" stroke-linecap="round"/>'],
  "맑음": ['<path d="M12 8C10.9392 8.00013 9.92184 8.42165 9.1718 9.17184C8.42175 9.92202 8.00042 10.9394 8.00049 12.0002C8.00055 13.0611 8.42201 14.0784 9.17215 14.8285C9.92229 15.5786 10.9397 16 12.0005 16C13.0613 16 14.0787 15.5786 14.8288 14.8285C15.579 14.0784 16.0004 13.0611 16.0005 12.0002C16.0006 10.9394 15.5792 9.92202 14.8292 9.17184C14.0791 8.42165 13.0618 8.00013 12.001 8H12Z" stroke="#6F6D72" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" f/><path d="M18.6 12H20.6M16.67 16.67L18.08 18.08M12 18.6V20.6M7.32998 16.67L5.91998 18.08M5.39999 12H3.39999M7.32998 7.33001L5.91998 5.92001M12 5.39999V3.39999M16.67 7.33001L18.08 5.92001" stroke="#6F6D72" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'],
  "흐림": ['<path d="M7.2 17.4248H17.1C17.9549 17.4199 18.7766 17.093 19.4013 16.5094C20.0261 15.9258 20.408 15.1283 20.4711 14.2757C20.5342 13.423 20.2737 12.578 19.7416 11.9088C19.2095 11.2396 18.4449 10.7955 17.6 10.6648C17.4009 9.58975 16.855 8.60959 16.0457 7.87441C15.2365 7.13923 14.2086 6.68956 13.1194 6.59426C12.0303 6.49896 10.9399 6.76328 10.0153 7.34675C9.09065 7.93022 8.38276 8.80067 8 9.8248C6.99218 9.71871 5.98349 10.0173 5.19584 10.655C4.40818 11.2926 3.90609 12.217 3.8 13.2248C3.69391 14.2326 3.99253 15.2413 4.63015 16.029C5.26777 16.8166 6.19218 17.3187 7.2 17.4248Z" stroke="#6F6D72" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" f/>'],
  "비": ['<path d="M7.5 4.20001C9.1 6.40001 10 7.70001 10 8.80001C10 9.46305 9.73661 10.0989 9.26777 10.5678C8.79893 11.0366 8.16304 11.3 7.5 11.3C6.83696 11.3 6.20107 11.0366 5.73223 10.5678C5.26339 10.0989 5 9.46305 5 8.80001C5 7.70001 5.9 6.40001 7.5 4.20001Z" stroke="#6F6D72" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" f/><path d="M16.5 4.20001C18.1 6.40001 19 7.70001 19 8.80001C19 9.46305 18.7366 10.0989 18.2678 10.5678C17.7989 11.0366 17.163 11.3 16.5 11.3C15.837 11.3 15.2011 11.0366 14.7322 10.5678C14.2634 10.0989 14 9.46305 14 8.80001C14 7.70001 14.9 6.40001 16.5 4.20001Z" stroke="#6F6D72" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" f/><path d="M12 12.7C13.6 14.9 14.5 16.2 14.5 17.3C14.5 17.9631 14.2366 18.5989 13.7678 19.0678C13.2989 19.5366 12.663 19.8 12 19.8C11.337 19.8 10.7011 19.5366 10.2322 19.0678C9.76339 18.5989 9.5 17.9631 9.5 17.3C9.5 16.2 10.4 14.9 12 12.7Z" stroke="#6F6D72" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" f/>'],
  "눈": ['<path d="M12 3.40002V20.6M13.7 5.09998L12 6.79998L10.3 5.09998M19.45 7.70001L4.54999 16.3M18.83 10.02L16.5 9.40002L17.13 7.08002M19.45 16.3L4.54999 7.70001M17.13 16.92L16.5 14.6L18.83 13.98M10.3 18.9L12 17.2L13.7 18.9M5.16998 13.98L7.49998 14.6L6.86998 16.92M6.86998 7.08002L7.49998 9.40002L5.16998 10.02" stroke="#6F6D72" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'],
};
const FP_ICON_AXES = new Set(["감정", "날씨"]);
function fpIcon(kw, on) {
  const body = FP_IC[kw][0].replace(/ f\/>/g, on ? ' fill="#F5EEFF"/>' : "/>").replace(/#6F6D72/g, on ? "#7425F6" : "#6F6D72");
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "32"); s.setAttribute("height", "32"); s.setAttribute("fill", "none"); s.setAttribute("aria-hidden", "true");
  s.innerHTML = body;   // 위 상수(고정 문자열)만 넣음 — 사용자 입력 아님
  return s;
}
const FP = { open: null, tog: {}, el: null, eat: false };
const fpSet = (t) => (t.kind ? S.pickedKind : S.picked);
const fpVal = (t) => t.kind || t.ikey;
const fpHas = (t) => fpSet(t).has(fpVal(t));
function fpFlip(t, btn) {
  const set = fpSet(t), v = fpVal(t), on = !set.has(v);
  on ? set.add(v) : set.delete(v);
  btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", String(on));
  if (btn.classList.contains("fp-ic")) btn.querySelector("svg").replaceWith(fpIcon(btn.dataset.kw, on));
  fpMarkCats();
}
const fpChip = (t) => h("button", { class: "fp-chip" + (fpHas(t) ? " on" : ""), type: "button", "aria-pressed": String(fpHas(t)), onclick: (e) => fpFlip(t, e.currentTarget) }, t.label);
function fpTags(axis) {
  const base = axis.name.split(" › ").pop();
  if (FP_ICON_AXES.has(axis.name)) {   // 감정 · 날씨: 아이콘(없는 항목은 칩)
    const ko = Object.keys(FP_IC), rank = (t) => (FP_IC[t.kw] ? ko.indexOf(t.kw) : 99);   // 디자인 순서(맑음·흐림·비·눈)
    return h("div", { class: "fp-icons" }, [...axis.tags].sort((a, b) => rank(a) - rank(b)).map((t) => FP_IC[t.kw]
      ? h("button", { class: "fp-ic" + (fpHas(t) ? " on" : ""), type: "button", "data-kw": t.kw, title: t.label, "aria-label": t.label, "aria-pressed": String(fpHas(t)), onclick: (e) => fpFlip(t, e.currentTarget) }, fpIcon(t.kw, fpHas(t)))
      : fpChip(t)));
  }
  if (base === "머리색" || base === "눈 색") {   // 색 스와치
    return h("div", { class: "fp-sws" }, axis.tags.map((t) => {
      const name = t.label;
      const bg = FP_SW[name] || FP_SW_X[name] || "#fff";
      return h("button", { class: "fp-sw" + (fpHas(t) ? " on" : ""), type: "button", "aria-pressed": String(fpHas(t)), title: t.label, onclick: (e) => fpFlip(t, e.currentTarget) },
        h("i", { style: `background:${bg}` + (name === "흰색" ? ";--ring:#c3c2c5" : "") }), h("span", {}, name));
    }));
  }
  return h("div", { class: "fp-chips" }, axis.tags.map(fpChip));
}
/* 한 축(섹션). sub=true 면 작은 회색 소제목(14), 아니면 큰 제목(18) */
function fpSection(axis, sub) {
  const name = axis.name.split(" › ").pop();
  if (axis.mode === "토글") {
    const t = axis.tags[0], on = fpHas(t);
    const sw = h("button", { class: "fp-switch" + (on ? " on" : ""), type: "button", role: "switch", "aria-checked": String(on), "aria-label": t.label, onclick: () => {
      const o = !fpHas(t); o ? fpSet(t).add(fpVal(t)) : fpSet(t).delete(fpVal(t));
      sw.classList.toggle("on", o); sw.setAttribute("aria-checked", String(o)); fpMarkCats();
    } });
    return h("div", { class: "fp-sec fp-tog" }, h("div", { class: "fp-togrow" }, h("span", { class: "fp-sub" }, t.label), sw));
  }
  return h("div", { class: "fp-sec" + (sub ? "" : " big") }, h(sub ? "span" : "h4", { class: sub ? "fp-sub" : "fp-ttl" }, name), fpTags(axis));
}
/* 축 목록 → 블록: 같은 머리말(머리 › … / 눈 › …)끼리 묶어 큰 제목 + 작은 소제목 섹션들 */
function fpBlocks(axes, order) {
  const ord = order || [];
  const list = axes.map((a, i) => [a, ord.includes(a.name) ? ord.indexOf(a.name) : 100 + i]).sort((x, y) => x[1] - y[1]).map((x) => x[0]);
  const out = [];
  list.forEach((a) => {
    const parts = a.name.split(" › ");
    if (parts.length > 1) {
      const last = out[out.length - 1];
      if (last && last.head === parts[0]) last.axes.push(a); else out.push({ head: parts[0], axes: [a] });
    } else out.push({ axes: [a] });
  });
  return out.map((b) => b.head
    ? h("div", { class: "fp-group" }, h("h4", { class: "fp-ttl" }, b.head), h("div", { class: "fp-secs" }, b.axes.map((a) => fpSection(a, true))))
    : fpSection(b.axes[0], false));
}
function drawFilterPC(root) {
  const g0 = S.vocab.groups.find((g) => g.name === "기본 정보") || { axes: [] };
  const kindAxis = { name: "종류", tags: KINDS.map(([k, l]) => ({ ikey: "kind:" + k, label: l, kind: k })) };
  const style = g0.axes.filter((a) => a.name.split(" › ")[0] === "스타일"), basic = g0.axes.filter((a) => a.name.split(" › ")[0] !== "스타일");
  const top = h("div", { class: "fp-top" },
    h("div", { class: "fp-sec" }, h("h4", { class: "fp-ttl fp-ttl1" }, "종류"), fpTags(kindAxis)),
    style.length ? h("div", { class: "fp-sec" }, h("h4", { class: "fp-ttl" }, "스타일"), style.length === 1 && style[0].name === "스타일" ? fpTags(style[0]) : h("div", { class: "fp-subs" }, style.map((a) => fpSection(a, true)))) : null,
    basic.length ? h("div", { class: "fp-sec" }, h("h4", { class: "fp-ttl" }, "기본 정보"), h("div", { class: "fp-subs" }, basic.map((a) => fpSection(a, true)))) : null);
  const cats = h("div", { class: "fp-cats" }, FP_CATS.filter(([g]) => S.vocab.groups.some((x) => x.name === g)).map(([g, label]) =>
    h("button", { class: "fp-cat", type: "button", "data-g": g, "aria-haspopup": "dialog", "aria-expanded": "false", onclick: () => (FP.open === g ? fpClose() : fpOpen(g)) },
      h("span", {}, label), h("b", { class: "fp-n", hidden: true }), icon("chevR", 24))));
  root.append(h("div", { class: "fp" }, top, h("hr", { class: "fp-line" }), cats));
  fpMarkCats();
  if (FP.open) fpOpen(FP.open, true);   // 초기화 등으로 다시 그릴 때 열린 창 내용도 새로
}
/* 카테고리 메뉴: 열린 창은 선택 상태, 고른 개수는 숫자로 */
function fpMarkCats() {
  document.querySelectorAll(".fp-cat").forEach((b) => {
    const g = S.vocab.groups.find((x) => x.name === b.dataset.g);
    const n = g ? g.axes.reduce((s, a) => s + a.tags.filter((t) => S.picked.has(t.ikey)).length, 0) : 0;
    const on = FP.open === b.dataset.g;
    b.classList.toggle("on", on); b.setAttribute("aria-expanded", String(on));
    const nb = b.querySelector(".fp-n"); nb.hidden = !n; nb.textContent = n ? String(n) : "";
  });
}
/* 플라이아웃 위치: 누른 카테고리 줄 바로 옆(위끝을 그 줄에 맞춤). 화면 아래로 넘치면 넘치는 만큼만 위로 올림 */
function fpPlace() {
  if (!FP.el) return;
  const r = $(".side").getBoundingClientRect(), minTop = Math.max(r.top, $(".top").getBoundingClientRect().bottom) + 16;
  const btn = document.querySelector(`.fp-cat[data-g="${CSS.escape(FP.open || "")}"]`);
  const want = btn ? btn.getBoundingClientRect().top - 8 : minTop;
  FP.el.style.left = `${r.right + 18}px`;
  FP.el.style.maxHeight = `${innerHeight - minTop - 16}px`;
  const h = FP.el.offsetHeight;
  FP.el.style.top = `${Math.round(Math.max(minTop, Math.min(want, innerHeight - 16 - h)))}px`;
}
function fpOpen(g, redraw) {
  const cat = FP_CATS.find((c) => c[0] === g), grp = S.vocab.groups.find((x) => x.name === g);
  if (!cat || !grp) return;
  const keep = redraw && FP.el ? FP.el.querySelector(".fp-body").scrollTop : 0;
  const swap = FP.el && FP.open !== g;
  FP.open = g;
  const el = FP.el || h("div", { class: "flyout", role: "dialog", "aria-modal": "false" });
  el.setAttribute("aria-label", cat[2]);
  el.replaceChildren(
    h("div", { class: "fp-head" }, h("h3", {}, cat[2]), h("button", { class: "fp-x", type: "button", "aria-label": "닫기", onclick: fpClose }, icon("close", 24))),
    h("div", { class: "fp-body" }, fpBlocks(grp.axes)));
  if (!FP.el) { FP.el = el; document.body.append(el); fpPlace(); requestAnimationFrame(() => el.classList.add("on")); }
  else { fpPlace(); if (swap) { el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap"); } }
  el.querySelector(".fp-body").scrollTop = keep;
  fpMarkCats();
}
function fpClose() {
  if (!FP.el) return;
  const el = FP.el; FP.el = null; FP.open = null;
  el.classList.remove("on"); setTimeout(() => el.remove(), RM.matches ? 0 : 200);
  fpMarkCats();
}
addEventListener("resize", fpPlace);
addEventListener("scroll", () => { if (FP.el) fpPlace(); }, { passive: true });   // 패널이 페이지와 함께 스크롤될 때도 줄을 따라감
$("#groups").addEventListener("scroll", () => { if (FP.el) fpPlace(); }, { passive: true });   // 패널을 스크롤하면 창도 그 줄을 따라감
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && FP.el) fpClose(); });
/* 창 바깥을 누르면 닫기 — 그 클릭으로 피드 이미지가 열리지 않게 한 번 막음 */
document.addEventListener("pointerdown", (e) => {
  if (!FP.el || FP.el.contains(e.target) || e.target.closest(".side")) return;
  if (e.target.closest(".grid")) { FP.eat = true; setTimeout(() => (FP.eat = false), 500); }
  fpClose();
}, true);
document.addEventListener("click", (e) => { if (FP.eat) { FP.eat = false; e.stopPropagation(); e.preventDefault(); } }, true);
$("#apply").onclick = () => {
  if (curTab === "pose") { runPoseSearch(); return; }
  // 무드 탭: 저장하지 않아도 지금 고른 색을 바로 적용(위 색상 칩에 더함). 현재 팔레트(저장 전용)는 그대로
  let newColor = null;
  if (curTab === "color" && !$("#cpanel").hidden) { const c = hsv2hex(CP.h, CP.s, CP.v); if (!S.colors.includes(c)) { S.colors = [...S.colors, c].slice(-5); newColor = c; } CP.dirty = false; }
  fpClose();
  S.applied = [...S.picked]; S.kinds = [...(S.pickedKind || [])]; if (newColor) rememberPal([newColor]); if (!$("#cpanel").hidden) drawColorPanel(); reload();
  if (isM()) setFilterOpen(false);
};
$("#reset").onclick = () => { S.pose = null; S.picked.clear(); S.applied = []; S.pickedKind = new Set(); S.kinds = []; S.colors = []; drawColorPanel(); S.q = ""; $("#q").value = ""; drawGroups(); reload(); };
const isTablet = () => !isM() && LAYOUT !== "pc" && innerWidth >= 768 && innerWidth < 1200;
/* 태블릿: 딤(빈 곳)을 누르면 드로어를 닫는다 */
$("#layout").addEventListener("click", (e) => { if (e.target !== e.currentTarget || !isTablet()) return; if (!$("#panel").hidden) closeDetail(); else setFilterOpen(false); });
let fCloseT;
function setFilterOpen(o) {
  const L = $("#layout"), was = L.classList.contains("f-open");
  if (was !== o) masSnap();
  if (!o) fpClose();
  clearTimeout(fCloseT);
  // PC에서 닫을 때: 필터 창을 바로 없애지 않고 왼쪽으로 미끄러져 사라지게 (그동안 피드는 왼쪽으로 채워짐)
  if (was && !o && !isM() && !RM.matches) { L.classList.add("f-closing"); fCloseT = setTimeout(() => L.classList.remove("f-closing"), 340); }
  else L.classList.remove("f-closing");
  L.classList.toggle("f-open", o); $("#filterBtn").setAttribute("aria-expanded", String(o));
}
$("#filterBtn").onclick = () => setFilterOpen(!$("#layout").classList.contains("f-open"));
$("#resetAll").onclick = (e) => { const ic = e.currentTarget.querySelector("svg, .ric, .ic"); if (ic) { ic.classList.remove("rf-spin"); void ic.getBoundingClientRect(); ic.classList.add("rf-spin"); ic.addEventListener("animationend", () => ic.classList.remove("rf-spin"), { once: true }); } $("#reset").click(); };   // 누르면 화살표가 한 바퀴 돌아요   // 피드 위 초기화 아이콘 (HOM_0000)
if (isTablet()) setFilterOpen(false);
$("#home").onclick = (e) => { e.preventDefault(); $("#reset").click(); closeDetail(); };

/* ---------------------------------------------------------------- 색상 필터 (컬러 팔레트) */
const hsv2hex = (h, s, v) => { const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join(""); };
const hex2hsv = (hex) => { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0; if (d) hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: hh * 60, s: mx ? d / mx : 0, v: mx }; };
const CP = { h: 0, s: 0.75, v: 0.9, dirty: false };
const pastPal = () => store.get("reffy.pal", []);
/* 현재 팔레트: '저장'으로만 채우는 보관함 (새로고침해도 남음, 색상 칩을 지워도 그대로) */
S.pickColors = store.get("reffy.cur", []);
const setCur = (list) => { S.pickColors = list; store.set("reffy.cur", list); };
/* '색상 적용하기'로 실제 검색에 쓴 색을 지난 팔레트에 남김 (다른 화면에 갔다 와도 그대로) */
const rememberPal = (cs) => { if (cs.length) store.set("reffy.pal", [...cs.map((c) => c.toLowerCase()), ...pastPal().filter((x) => !cs.includes(x))].slice(0, 15)); };
function drawColorPanel() {
  const root = $("#cpanel"); root.replaceChildren();
  const cur = () => hsv2hex(CP.h, CP.s, CP.v);
  const add = (c) => { c = c.toLowerCase(); if (!S.pickColors.includes(c)) setCur([...S.pickColors, c].slice(-10)); drawColorPanel(); };
  const use = (c) => { Object.assign(CP, hex2hsv(c), { dirty: true }); drawColorPanel(); };   // 팔레트 색을 눌러 지금 고른 색으로
  const saveColor = (c) => { c = c.toLowerCase(); add(c); toast("현재 팔레트에 저장했어요"); };
  const box = h("div", { class: "cbox", role: "slider", "aria-label": "채도와 명도", tabindex: "0" }, h("span", { class: "cdot" }));
  const hue = h("input", { type: "range", min: "0", max: "360", step: "1", class: "chue", "aria-label": "색상(Hue)", value: String(Math.round(CP.h)) });
  const hex = h("input", { class: "chex", maxlength: "7", "aria-label": "색상 코드", value: cur().toUpperCase() });
  const sw = h("i", { class: "sw" });
  const paint = () => { box.style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${CP.h},100%,50%))`; box.firstChild.style.left = CP.s * 100 + "%"; box.firstChild.style.top = (1 - CP.v) * 100 + "%"; sw.style.background = cur(); hex.value = cur().toUpperCase(); hue.value = String(Math.round(CP.h)); };
  const pick = (e) => { CP.dirty = true; const r = box.getBoundingClientRect(); CP.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); CP.v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); paint(); };
  box.addEventListener("pointerdown", (e) => { box.setPointerCapture(e.pointerId); pick(e); box.onpointermove = pick; });
  box.addEventListener("pointerup", () => { box.onpointermove = null; });
  box.addEventListener("keydown", (e) => { const d = e.shiftKey ? 0.1 : 0.02; CP.dirty = true; if (e.key === "ArrowLeft") CP.s = Math.max(0, CP.s - d); else if (e.key === "ArrowRight") CP.s = Math.min(1, CP.s + d); else if (e.key === "ArrowUp") CP.v = Math.min(1, CP.v + d); else if (e.key === "ArrowDown") CP.v = Math.max(0, CP.v - d); else return; e.preventDefault(); paint(); });
  hue.oninput = () => { CP.h = +hue.value; CP.dirty = true; paint(); };
  const setHex = () => { let v = hex.value.trim(); if (/^#?[0-9a-fA-F]{6}$/.test(v)) { Object.assign(CP, hex2hsv("#" + v.replace("#", "")), { dirty: true }); paint(); } else { toast("#RRGGBB 형식으로 입력해 주세요"); paint(); } };
  hex.onchange = setHex; hex.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); setHex(); } };
  const eye = h("button", { class: "ceye", type: "button", "aria-label": "스포이트", title: "화면에서 색 고르기", onclick: async () => {
    if (!window.EyeDropper) return toast("이 브라우저는 스포이트를 지원하지 않아요. 크롬·엣지에서 써 보세요.");
    try { const r = await new EyeDropper().open(); Object.assign(CP, hex2hsv(r.sRGBHex), { dirty: true }); paint(); } catch { /* 취소 */ }
  } }, icon("eyedropper", 20));
  const circle = (c, fn, label) => h("button", { type: "button", class: "ccirc", style: `background:${c}`, title: label, "aria-label": `${c.toUpperCase()} ${label}`, onclick: fn });
  root.append(box, h("div", { class: "chrow" }, eye, hue),
    h("div", { class: "ccode" }, h("span", {}, isM() ? "Color Code" : "Hex"), h("div", { class: "cfield" }, hex, sw), h("button", { class: "btn", type: "button", onclick: () => saveColor(cur()) }, "저장")),
    h("hr", { class: "cdiv" }),
    h("h3", { class: "ctit" }, "현재 팔레트"),
    h("div", { class: "cpal" }, h("button", { type: "button", class: "ccirc plus", "aria-label": "현재 색 추가", title: "현재 색 추가", onclick: () => add(cur()) }, icon("plus", 20)), S.pickColors.length ? S.pickColors.map((c) => h("span", { class: "pc-wrap" }, circle(c, () => use(c), "이 색 고르기"), h("button", { type: "button", class: "pc-x", "aria-label": `${c.toUpperCase()} 현재 팔레트에서 삭제`, onclick: () => { setCur(S.pickColors.filter((x) => x !== c)); drawColorPanel(); } }, "×"))) : (isM() ? null : h("p", { class: "hint", style: "margin:0" }, "‘저장’을 누른 색이 여기에 보관돼요."))),
    h("h3", { class: "ctit" }, "지난 팔레트"),
    h("div", { class: "cpal" }, pastPal().length ? pastPal().map((c) => h("span", { class: "pc-wrap" }, circle(c, () => use(c), "이 색 고르기"), h("button", { type: "button", class: "pc-x", "aria-label": `${c.toUpperCase()} 지난 팔레트에서 삭제`, onclick: () => { store.set("reffy.pal", pastPal().filter((x) => x !== c)); drawColorPanel(); } }, "×"))) : h("p", { class: "hint", style: "margin:0" }, "‘색상 적용하기’로 찾아본 색이 여기에 남아 나중에 다시 쓸 수 있어요.")));
  paint();
}
async function pullPalette(id) {
  if (!(await (isM() ? confirmDialog("해당 이미지의 컬러를 ‘무드’에 덮어씌울까요?", "무드 필터에 이 이미지의 컬러가 적용돼요.", { ok: "적용", cancel: "취소" })
    : confirmDialog("해당 이미지의 컬러를 ‘무드’에\n덮어 씌우겠습니까?", "이미지 대표 색을 현재 팔레트로 가져와요.", { remember: "reffy.palAsk", fig: true, no: "아니오", yes: "예" })))) return;
  try {
    const r = await api(`/api/images/${id}/colors`);
    if (!r.colors.length) return toast("이 이미지에서 색을 찾지 못했어요.");
    setCur(r.colors.map((c) => c[0].toLowerCase())); Object.assign(CP, hex2hsv(r.colors[0][0]), { dirty: false });
    if (isM() && !$("#panel").hidden) closeDetail();
    setFilterOpen(true);
    showTab(true); toast(isM() ? "무드에 색을 불러왔어요. ‘적용하기’를 눌러 같은 색을 찾아보세요." : "현재 팔레트에 색을 불러왔어요. 색을 고르고 ‘색상 적용하기’를 눌러 같은 색을 찾아보세요.");
  } catch (e) { toast(e.message); }
}
let curTab = "tag";
function showTab(t) {
  curTab = t === true ? "color" : t === false ? "tag" : t;
  const on = { tag: curTab === "tag", pose: curTab === "pose", color: curTab === "color" };
  $("#groups").hidden = !on.tag; $("#cpanel").hidden = !on.color; $("#ppanel").hidden = !on.pose;
  [["tabTag", on.tag], ["tabPose", on.pose], ["tabColor", on.color]].forEach(([id, v]) => { $("#" + id).classList.toggle("on", v); $("#" + id).setAttribute("aria-selected", String(v)); });
  $("#apply").textContent = isM() ? "적용하기" : on.color ? "색상 적용하기" : on.pose ? "포즈 적용하기" : "적용하기";
  if (!on.tag) fpClose();
  if (on.color) drawColorPanel();
  if (on.pose) drawPosePanel();
}
$("#tabTag").onclick = () => showTab("tag");
$("#tabPose").onclick = () => showTab("pose");
$("#tabColor").onclick = () => showTab("color");
/* 3D 포즈 (HOM_0202) — pose-search(MIT, github.com/x6ud/pose-search) 엔진.
   마네킹 관절을 끌어 자세를 만들고 '포즈 적용하기'를 누르면 비슷한 자세의 '사진'만 찾는다 (실사용이라 일러스트는 보여 주지 않음).
   결과: REFFY 사진 게시물 + pose-search 실사 데이터(Unsplash) */
const POSE = { ed: null, eng: null, part: "all", free: false, ds: null, built: false };
const POSE_PARTS = [["all", "전체 자세"], ["Face", "얼굴"], ["Chest", "가슴"], ["Crotch", "골반"], ["Left Shoulder", "왼쪽 어깨"], ["Right Shoulder", "오른쪽 어깨"], ["Left Elbow", "왼쪽 팔꿈치"], ["Right Elbow", "오른쪽 팔꿈치"], ["Left Hip", "왼쪽 고관절"], ["Right Hip", "오른쪽 고관절"], ["Left Knee", "왼쪽 무릎"], ["Right Knee", "오른쪽 무릎"]];
const POSE_KEYS = POSE_PARTS.slice(1).map((p) => p[0]);
/* 파츠 검색 결과 크롭: 고른 부위의 관절(MediaPipe 33점 번호)이 보이도록 사진을 잘라 카드에 보여 줌 */
const POSE_CROP = { Face: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], Chest: [11, 12, 23, 24], Crotch: [23, 24, 25, 26],
  "Left Shoulder": [11, 12, 13], "Right Shoulder": [11, 12, 14], "Left Elbow": [11, 13, 15], "Right Elbow": [12, 14, 16],
  "Left Hip": [23, 24, 25], "Right Hip": [23, 24, 26], "Left Knee": [23, 25, 27], "Right Knee": [24, 26, 28] };
function poseCrop(nl, W, H, part) {
  const ids = POSE_CROP[part];
  if (!ids || !nl || !W || !H) return null;
  const P = (i) => nl[i] && { x: nl[i].point[0] * W, y: nl[i].point[1] * H, v: nl[i].visibility };
  let pts = ids.map(P).filter((q) => q && q.v >= 0.3);
  if (pts.length < 2) pts = ids.map(P).filter(Boolean);
  if (!pts.length) return null;
  const mid = (a, b) => a && b && { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const sh = mid(P(11), P(12)), hp = mid(P(23), P(24));
  const torso = sh && hp ? Math.hypot(sh.x - hp.x, sh.y - hp.y) : Math.min(W, H) / 3;   // 몸 크기 기준: 어깨 가운데 ~ 골반 가운데
  let x0 = Math.min(...pts.map((q) => q.x)), x1 = Math.max(...pts.map((q) => q.x)), y0 = Math.min(...pts.map((q) => q.y)), y1 = Math.max(...pts.map((q) => q.y));
  const pad = torso * (part === "Face" ? 0.45 : 0.35), minS = torso * (part === "Face" ? 0.7 : 0.9);
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - (part === "Face" ? torso * 0.12 : 0),   // 얼굴: 눈·귀 기준이라 이마 쪽으로 조금 올림
      w = Math.max(x1 - x0 + pad * 2, minS), hh = Math.max(y1 - y0 + pad * 2, minS);
  const ch = cardH({ w, h: hh }), r = ch / 217;   // 카드 높이 단계(120~320)에 맞춰 비율을 정확히 맞춤
  if (hh / w < r) hh = w * r; else w = hh / r;
  if (w > W) { w = W; hh = w * r; }
  if (hh > H) { hh = H; w = hh / r; }
  if (w >= W * 0.92 && hh >= H * 0.92) return null;   // 거의 전체면 자르지 않음
  cx = Math.min(Math.max(cx, w / 2), W - w / 2); cy = Math.min(Math.max(cy, hh / 2), H - hh / 2);
  return { x: (cx - w / 2) / W, y: (cy - hh / 2) / H, w: w / W, h: hh / H, ch };
}
/* 카드 이미지 영역: 크롭이 있으면 잘라서, 없으면 원래대로 */
function cardIm(it, img) {
  const c = it.crop;
  if (!c) return h("span", { class: "im", style: `--ch:${cardH(it)}` }, img, cardLike(it));
  img.style.cssText = `width:${100 / c.w}%;height:${100 / c.h}%;left:${-100 * c.x / c.w}%;top:${-100 * c.y / c.h}%`;
  return h("span", { class: "im crop", style: `--ch:${c.ch}` }, img, cardLike(it));
}
function loadPoseEngine() {
  if (POSE.eng) return POSE.eng;
  return (POSE.eng = new Promise((ok, bad) => {
    if (window.RPose) return ok(window.RPose);
    document.head.append(h("link", { rel: "stylesheet", href: "pose/pose-engine.css?v=2" }));
    const sc = h("script", { src: "pose/pose-engine.js?v=4" });
    sc.onload = () => (window.RPose ? ok(window.RPose) : bad(new Error("3D 포즈 엔진을 불러오지 못했어요")));
    sc.onerror = () => { POSE.eng = null; bad(new Error("3D 포즈 엔진을 불러오지 못했어요")); };
    document.head.append(sc);
  }));
}
const poseSaved = () => store.get("reffy.poses", []);
function drawPosePanel() {
  const pp = $("#ppanel");
  if (POSE.built) { drawPoseParts(); drawPoseSaved(); return; }
  POSE.built = true;
  const vp = h("div", { class: "pose-vp", role: "application", "aria-label": "3D 포즈 마네킹 — 관절 핀을 끌어 자세를 바꿔요" }, h("span", { class: "sk pose-load" }));
  const resetB = h("button", { class: "pill sm", type: "button", onclick: () => { if (POSE.ed) { POSE.ed.reset(); toast("마네킹 자세를 처음으로 돌렸어요"); } } }, "포즈 초기화");
  pp.replaceChildren(
    h("div", { class: "pose-vpw" }, vp, h("div", { class: "pose-ctl" }, resetB)),
    h("p", { class: "pose-hint" }, "관절을 드래그하거나 신체 파츠를 눌러 포즈를 만드세요"),
    h("div", { class: "pose-sec" }, h("div", { class: "pose-h" }, h("h3", {}, "비교할 부위")), h("div", { class: "pose-chips", id: "poseParts" })),
    h("div", { class: "pose-sec" }, h("div", { class: "pose-h" }, h("h3", {}, "저장한 포즈"), h("button", { class: "linkbtn", type: "button", onclick: savePose }, "지금 포즈 저장")), h("div", { class: "pose-chips", id: "poseSaved" })),
    h("p", { class: "pose-credit" }, "3D 포즈 검색: ", h("a", { href: "https://github.com/x6ud/pose-search", target: "_blank", rel: "noopener" }, "pose-search"), " (MIT) · 관절 정답: ", h("a", { href: "https://cocodataset.org/#termsofuse", target: "_blank", rel: "noopener" }, "COCO 2017"), " (CC BY 4.0) · 사진: Flickr, 사진별 CC 라이선스"));
  drawPoseParts(); drawPoseSaved();
  loadPoseEngine().then((R) => requestAnimationFrame(() => {
    vp.replaceChildren(); const box = h("div", { class: "pose-ed" }); vp.append(box);
    POSE.ed = R.mountEditor(box, { onPart: (k) => { POSE.part = k; drawPoseParts(); } });
    POSE.ed.setPart(POSE.part === "all" ? null : POSE.part);
    if (POSE.pending) { POSE.ed.setLandmarks(POSE.pending); POSE.pending = null; }
  })).catch((e) => { vp.replaceChildren(h("p", { class: "pose-err" }, e.message)); });
}
function drawPoseParts() {
  const box = $("#poseParts"); if (!box) return;
  box.replaceChildren(...POSE_PARTS.map(([k, l]) => h("button", { class: "pill sm" + (POSE.part === k ? " on" : ""), type: "button", "aria-pressed": String(POSE.part === k), onclick: () => { POSE.part = k; if (POSE.ed) POSE.ed.setPart(k === "all" ? null : k); drawPoseParts(); } }, l)));
  if (POSE.ed) POSE.ed.setPart(POSE.part === "all" ? null : POSE.part);
}
function drawPoseSaved() {
  const box = $("#poseSaved"); if (!box) return;
  const list = poseSaved();
  if (!list.length) return box.replaceChildren(h("p", { class: "hint" }, "저장한 포즈가 없어요."));
  box.replaceChildren(...list.map((p, i) => h("span", { class: "pill sm pose-sv" },
    h("button", { type: "button", onclick: () => { if (!POSE.ed) return; POSE.ed.setPose(p.pose); toast(`‘${p.name}’ 포즈를 불러왔어요`); } }, p.name),
    h("button", { type: "button", class: "x", "aria-label": `${p.name} 지우기`, onclick: () => { store.set("reffy.poses", poseSaved().filter((_, j) => j !== i)); drawPoseSaved(); } }, "✕"))));
}
function savePose() {
  if (!POSE.ed) return toast("마네킹을 불러오는 중이에요");
  const list = poseSaved(); const n = list.length + 1;
  store.set("reffy.poses", [...list, { name: `포즈 ${n}`, pose: POSE.ed.getPose() }].slice(-12));
  drawPoseSaved(); toast(`‘포즈 ${n}’으로 저장했어요`);
}
/* REFFY 사진 게시물 중 아직 관절을 안 뽑은 것을 몇 장씩 채워 넣음 (로그인한 브라우저에서, 사진만) */
async function poseFill(max = 8, onlyIds) {
  if (!ME || POSE.filling) return; POSE.filling = true;
  try {
    const R = await loadPoseEngine();
    const list = onlyIds ? onlyIds.map((id) => ({ id, src: `/img/${id}` })) : (await api(`/api/pose/missing?limit=${max}`)).items;
    for (const it of list) {
      const img = new Image(); img.crossOrigin = "anonymous"; img.src = it.src;
      try { await img.decode(); } catch { continue; }
      let r = null; try { r = await R.detect(img); } catch { r = null; }
      const lm = r && r.normalized.length === 33 ? r.normalized.flatMap((n, i) => [n.point[0], n.point[1], n.point[2], r.world[i].point[0], r.world[i].point[1], r.world[i].point[2], n.visibility]) : null;
      await api(`/api/images/${it.id}/pose`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lm }) }).catch(() => {});
    }
  } catch { /* 다음에 다시 */ } finally { POSE.filling = false; }
}
/* '포즈 적용하기': 지금 마네킹 자세와 비슷한 사진을 찾아 피드에 보여 줌 */
async function runPoseSearch() {
  if (!POSE.ed) return toast("마네킹을 불러오는 중이에요");
  const b = $("#apply"); b.disabled = true; const old = b.textContent; b.textContent = "포즈 찾는 중…";
  try {
    const R = await loadPoseEngine();
    await poseFill(10);
    if (!POSE.ds) POSE.ds = await R.loadDataset("pose/", "?v=coco1");
    const idx = (await api("/api/pose/index")).items.filter((x) => x.kind === "photo");
    const mine = idx.map((x) => { const n = [], w = []; for (let k = 0; k < 33; k++) { const o = k * 7; n.push({ point: [x.lm[o], x.lm[o + 1], x.lm[o + 2]], visibility: x.lm[o + 6] }); w.push({ point: [x.lm[o + 3], x.lm[o + 4], x.lm[o + 5]], visibility: x.lm[o + 6] }); } return R.makePhoto("r" + x.id, n, w, { reffy: x.id }); });
    const run = (list) => POSE.part === "all" ? R.searchAll(POSE.ed.model, POSE_KEYS, list, { cameraFree: POSE.free, limit: 120 }) : R.search(POSE.ed.model, POSE.part, list, { cameraFree: POSE.free, limit: 120 });
    const rr = mine.length ? run(mine) : [];
    const ext = run(POSE.ds).map((x) => x.photo).filter((p) => p.regular);
    const reg = await api("/api/pose/ext-ids").catch(() => ({}));   // 이미 등록된 실사 사진: 하트 상태 이어 받기
    const regIds = ext.map((p) => reg[p.id]).filter(Boolean);
    const st = {};
    if (regIds.length) { try { (await api("/api/images?limit=100&ids=" + regIds.slice(0, 100).join(","))).items.forEach((c) => (st[c.id] = c)); } catch { /* 없으면 생략 */ } }
    ext.forEach((p) => { const id = reg[p.id]; p.rid = id || null; p.likes = id && st[id] ? st[id].likes : 0; p.liked = !!(id && st[id] && st[id].liked); });
    const lm = {}; rr.forEach((x) => (lm[x.photo.reffy] = x.photo.normalizedLandmarks));   // 크롭용 관절 위치
    S.pose = { label: POSE_PARTS.find((p) => p[0] === POSE.part)[1], part: POSE.part, ids: rr.map((x) => x.photo.reffy), lm, ext, extShown: false };
    fpClose(); reload();
    if (isM()) setFilterOpen(false);
  } catch (e) { toast(e.message); } finally { b.disabled = false; b.textContent = old; }
}
/* pose-search 실사 사진 카드 (Unsplash): 하트 · 상세(킵 · 북에 저장)까지 REFFY 게시물처럼. 처음 누를 때 REFFY 이미지로 등록 */
async function extId(it) {
  if (it.rid) return it.rid;
  const r = await api(`/api/pose/ext/${encodeURIComponent(it.pid)}`, { method: "POST" });
  it.rid = r.id; return it.rid;
}
function extCard(it) {
  const srcName = it.coco ? (it.lic || "COCO") : "Unsplash";
  const img = h("img", { src: it.thumb, alt: it.coco ? "COCO 실사 포즈 사진" : `${it.author}의 사진 (Unsplash)`, loading: "lazy", width: it.w || null, height: it.h || null, referrerpolicy: "no-referrer" });
  return h("button", { class: "card ext" + (it.rid && S.open === it.rid ? " sel" : ""), type: "button", "data-id": it.id, "aria-label": `실사 포즈 사진 · ${it.author} (${srcName})`,
    onclick: async () => {
      if (!needLogin()) return;
      try { const id = await extId(it); if (S.open === id && !$("#panel").hidden && !isM()) closeDetail(); else openDetail(id); } catch (e) { toast(e.message); }
    } },
    cardIm(it, img),
    h("span", { class: "meta" + (it.liked ? " liked" : "") }, h("span", { class: "av" }), h("span", { class: "tx" }, h("b", {}, it.author)), h("span", { class: "src" }, it.coco ? "COCO" : "Unsplash")));
}

/* ---------------------------------------------------------------- 검색창 */
const recent = () => store.get("reffy.recent", []);
function pushRecent(q) { const l = [q, ...recent().filter((x) => x !== q)].slice(0, 8); store.set("reffy.recent", l); }
async function drawSuggest() {
  const box = $("#suggest"); box.replaceChildren();
  const rc = recent();
  if (rc.length) box.append(h("h3", {}, "최근 검색어", h("button", { type: "button", onmousedown: (e) => { e.preventDefault(); store.set("reffy.recent", []); drawSuggest(); } }, "전체 삭제")),
    h("div", { class: "recent" }, rc.map((x) => h("span", { class: "chip" }, h("button", { type: "button", onmousedown: (e) => { e.preventDefault(); runQuery(x); } }, x), h("button", { type: "button", "aria-label": `${x} 삭제`, onmousedown: (e) => { e.preventDefault(); store.set("reffy.recent", recent().filter((y) => y !== x)); drawSuggest(); } }, "✕")))));
  let pop = [];
  try { pop = await api("/api/popular"); } catch { /* 인기 태그 없이 표시 */ }
  box.append(h("h3", {}, "인기 태그"));
  box.append(pop.length ? h("ol", { class: "pop" }, pop.map((p, i) => h("li", {}, h("button", { type: "button", onmousedown: (e) => { e.preventDefault(); applyTag(p.ikey, p.label); } }, h("b", {}, String(i + 1)), p.label)))) : h("p", { class: "none" }, "아직 태그가 붙은 이미지가 없어요. 이미지를 올려 보세요."));
}
const qEl = $("#q");
qEl.addEventListener("focus", () => { $("#suggest").hidden = false; drawSuggest(); });
qEl.addEventListener("blur", () => setTimeout(() => ($("#suggest").hidden = true), 120));
function runQuery(q) { document.documentElement.classList.remove("m-search"); S.q = q.trim(); qEl.value = S.q; if (S.q) pushRecent(S.q); $("#suggest").hidden = true; qEl.blur(); S.sort = ""; reload(); }
/* 인기 태그 · 추천 키워드: 글자 검색이 아니라 그 태그 하나만 필터로 적용 (칩의 ✕로 바로 해제) */
function applyTag(ikey, label) {
  if (!ikey || !S.labels[ikey]) return runQuery(label || "");
  document.documentElement.classList.remove("m-search");
  S.q = ""; qEl.value = ""; $("#qClear").hidden = true; $("#suggest").hidden = true; qEl.blur();
  if (!S.applied.includes(ikey)) S.applied = [...S.applied, ikey];
  S.picked.add(ikey); S.sort = "";
  drawGroups(); reload();
}
$("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); runQuery(qEl.value); });
const SORTS = [["recent", "최근 순"], ["popular", "인기 순"], ["saved", "저장 많은 순"]];   // Figma 정렬 메뉴 (HOM_0300)
const SORT_LABEL = { relevance: "관련도 순" };   // 검색어가 있을 때 서버가 고르는 기본 순서 (메뉴에는 없음)
const MCHECK = () => { const t = document.createElement("template"); t.innerHTML = '<svg class="mck" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7.95768 13.042L15.0202 5.97949C15.1868 5.81283 15.3813 5.72949 15.6035 5.72949C15.8257 5.72949 16.0202 5.81283 16.1869 5.97949C16.3535 6.14616 16.4368 6.34755 16.4368 6.58366C16.4368 6.80588 16.3535 7.00033 16.1869 7.16699L8.54102 14.8337C8.37435 15.0003 8.1799 15.0837 7.95768 15.0837C7.73546 15.0837 7.54102 15.0003 7.37435 14.8337L3.79102 11.2503C3.62435 11.0837 3.54102 10.8892 3.54102 10.667C3.5549 10.4309 3.64518 10.2295 3.81185 10.0628C3.97852 9.89616 4.17296 9.81283 4.39518 9.81283C4.63129 9.81283 4.83268 9.89616 4.99935 10.0628L7.95768 13.042Z" fill="#7425F6"/></svg>'; return t.content.firstChild; };
let curSort = "recent";
function drawSort() {
  $("#sortLabel").textContent = (SORTS.find((x) => x[0] === curSort) || [0, SORT_LABEL[curSort] || "최근 순"])[1];
  const m = $("#sortMenu"); m.replaceChildren(...SORTS.map(([k, l]) => h("button", { type: "button", role: "option", "aria-selected": String(k === curSort), onclick: () => { S.sort = k; curSort = k; m.hidden = true; $("#sortBtn").setAttribute("aria-expanded", "false"); drawSort(); reload(); } }, h("span", {}, l), k === curSort ? (isM() ? icon("check") : MCHECK()) : null)));
}
$("#sortBtn").onclick = (e) => { e.stopPropagation();
  if (isM()) return sheetMenu("정렬", SORTS.map(([k, l]) => ({ label: l, on: k === curSort, fn: () => { S.sort = k; curSort = k; drawSort(); reload(); } })));
  const m = $("#sortMenu"); m.hidden = !m.hidden; $("#sortBtn").setAttribute("aria-expanded", String(!m.hidden)); };
document.addEventListener("click", () => { $("#sortMenu").hidden = true; });
drawSort();

/* ---------------------------------------------------------------- 흰 바탕 이미지: 검정 5% 덮기
   이미지 가장자리가 대부분 흰색이면 .wbg 를 붙인다. 색을 읽을 수 없으면(외부 이미지 등) 구분이 안 되므로 그냥 덮는다. */
const WBG_SEL = ".card .im img, .dp-img > img, .dp-im img, .pm-img img, .pf-cell img, .kc-th img, .kc-card img, .book .cover img, .brow-pick > img, .nitem > img";
function wbgCheck(img) {
  if (!img.matches(WBG_SEL) || img.dataset.wbg) return;
  img.dataset.wbg = "1";
  try {
    const N = 24, c = document.createElement("canvas"); c.width = c.height = N;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data; let n = 0, w = 0;
    for (let i = 0; i < N; i++) for (const [px, py] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) { const k = (py * N + px) * 4; n++; if (d[k + 3] > 200 && d[k] > 235 && d[k + 1] > 235 && d[k + 2] > 235) w++; }
    if (w / n >= 0.3) img.classList.add("wbg");
  } catch { img.classList.add("wbg"); }
}
document.addEventListener("load", (e) => { if (e.target.tagName === "IMG") wbgCheck(e.target); }, true);
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) (n.tagName === "IMG" ? [n] : n.querySelectorAll("img")).forEach((i) => { if (i.complete && i.naturalWidth) wbgCheck(i); }); }).observe(document.documentElement, { childList: true, subtree: true });

/* ---------------------------------------------------------------- 피드(무한 스크롤) */
/* 피드 카드 이미지 높이 (Figma Common/Image Height): 폭 217 기준 120 · 160 · 200 · 240 · 280 · 320 중 원본 비율에 가장 가까운 값 */
const CARD_HS = [120, 160, 200, 240, 280, 320];
function cardH(it) {
  const want = it.w && it.h ? 217 * it.h / it.w : 240;
  return CARD_HS.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
}
/* 카드 아래 프로필: 올린 사람의 프로필 사진이 있으면 그 사진, 없으면 회색 원 */
const cardAv = (it, cls = "av", txt) => h("span", { class: cls + (it.avatar ? " has" : "") }, it.avatar ? h("img", { src: it.avatar, alt: "", loading: "lazy" }) : (txt || null));
function card(it) {
  if (it.ext) return extCard(it);
  const img = h("img", { src: it.thumb, alt: it.title || "레퍼런스 이미지", loading: "lazy", width: it.w || null, height: it.h || null });
  return h("button", { class: "card" + (S.open === it.id ? " sel" : ""), type: "button", "data-id": it.id, title: it.title || "", "aria-label": (it.title || "레퍼런스 이미지") + " · " + it.author, onclick: () => (S.open === it.id && !$("#panel").hidden && !isM() ? closeDetail() : openDetail(it.id)) },
    cardIm(it, img),
    it.private ? h("span", { class: "prv" }, "비공개") : null,
    h("span", { class: "meta" + (it.liked ? " liked" : "") }, cardAv(it), h("span", { class: "tx" }, h("b", {}, it.author)), h("span", { class: "like" }, cardHeart(), h("span", { class: "lk" }, String(it.likes ?? 0)))));
}
/* 카드 Hover(Figma Common/Card 2138:1046): 이미지에 8% State layer + 오른쪽 위 하트 40 — 누르면 하트(좋아요) */
const CL_PATH = {
  o: "M20.6429 33.1559C20.2473 33.3931 19.7527 33.3931 19.3571 33.1559L20 32.0833L20.6429 33.1559ZM31.6667 15.6673C31.6667 12.3678 29.1533 10.0003 26.084 10C23.9734 10 22.1146 11.1573 21.0726 12.8939C20.8467 13.2702 20.439 13.4993 20 13.4993C19.561 13.4993 19.1534 13.2702 18.9274 12.8939C17.8855 11.1573 16.0266 10 13.916 10C10.8467 10.0003 8.33334 12.3678 8.33334 15.6673C8.33351 17.5232 9.02714 19.4028 10.1628 21.2272C11.2965 23.0485 12.8292 24.7466 14.3962 26.2126C15.9586 27.6742 17.5263 28.8786 18.7061 29.7184C19.2257 30.0883 19.6697 30.3844 20 30.6006C20.3303 30.3844 20.7743 30.0883 21.294 29.7184C22.4737 28.8786 24.0414 27.6742 25.6039 26.2126C27.1709 24.7466 28.7035 23.0485 29.8373 21.2272C30.9729 19.4028 31.6665 17.5232 31.6667 15.6673ZM34.1667 15.6673C34.1665 18.1443 33.2456 20.483 31.9596 22.5488C30.6717 24.6178 28.9747 26.4824 27.3128 28.0371C25.6465 29.5959 23.9844 30.8705 22.7425 31.7546C22.1205 32.1973 21.6019 32.5457 21.2354 32.7832C21.0522 32.9019 20.9063 32.9924 20.8057 33.055C20.7553 33.0863 20.7158 33.1116 20.6885 33.1283L20.6478 33.1527L20.6445 33.1543L20 32.0833L19.3555 33.1543L19.3522 33.1527L19.3115 33.1283C19.2842 33.1116 19.2447 33.0863 19.1943 33.055C19.0937 32.9924 18.9478 32.9019 18.7647 32.7832C18.3982 32.5457 17.8795 32.1973 17.2575 31.7546C16.0156 30.8705 14.3535 29.5959 12.6872 28.0371C11.0253 26.4824 9.32832 24.6178 8.04037 22.5488C6.75443 20.483 5.83351 18.1443 5.83334 15.6673C5.83334 10.9673 9.48593 7.50034 13.916 7.5C16.3293 7.5 18.4825 8.54746 20 10.1839C21.5175 8.54746 23.6707 7.5 26.084 7.5C30.5141 7.50034 34.1667 10.9673 34.1667 15.6673Z",
  f: "M20 32.08C19.78 32.08 19.55 32.02 19.36 31.9C18.6 31.43 5.83 23.52 5.83 15.67C5.83 10.97 9.49 7.5 13.92 7.5C16.33 7.5 18.48 8.55 20 10.18C21.52 8.55 23.67 7.5 26.08 7.5C30.51 7.5 34.17 10.97 34.17 15.67C34.17 23.52 21.4 31.43 20.64 31.9C20.45 32.02 20.22 32.08 20 32.08Z",
};
function cardLike(it) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 40 40"); svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("fill", "#fff"); svg.append(path);
  const paint = () => { path.setAttribute("d", it.liked ? CL_PATH.f : CL_PATH.o); path.setAttribute("fill", it.liked ? "#7425F6" : "#fff"); el.setAttribute("aria-pressed", String(!!it.liked)); el.setAttribute("aria-label", it.liked ? "하트 취소" : "하트"); };
  const el = h("span", { class: "c-like", role: "button", tabindex: "-1", onclick: async (e) => {
    e.stopPropagation(); e.preventDefault();
    if (!needLogin()) return;
    const on = !it.liked;
    try {
      const iid = it.ext ? await extId(it) : it.id;
      await api(`/api/images/${iid}/like`, { method: on ? "POST" : "DELETE" });
      it.liked = on; it.likes = Math.max(0, (it.likes || 0) + (on ? 1 : -1)); paint();
      const c = el.closest(".card"), m = c && c.querySelector(".meta");
      if (m) { m.classList.toggle("liked", on); const lk = m.querySelector(".lk"); if (lk) lk.textContent = String(it.likes); }
    } catch (err) { toast(err.message); }
  } }, svg);
  paint();
  return el;
}
const moreIc = () => icon("more", 24);
/* 카드 하트: Figma Common/Card 의 채운 하트 16 (기본 #C3C2C5, 내가 누른 글은 보라) */
function cardHeart() { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("width", "16"); s.setAttribute("height", "16"); s.setAttribute("class", "ic chf"); s.setAttribute("aria-hidden", "true"); s.innerHTML = '<path d="M8.90611 13.4059C8.40611 13.8747 7.62486 13.8747 7.09361 13.4059L7.03111 13.3434C3.53111 10.1872 1.24985 8.09341 1.3436 5.53091C1.37485 4.37466 1.9686 3.31216 2.9061 2.65591C4.6561 1.46841 6.81236 2.03091 7.99986 3.40591C9.18736 2.03091 11.3436 1.46841 13.0936 2.65591C14.0311 3.31216 14.6249 4.37466 14.6561 5.53091C14.7499 8.09341 12.4686 10.1872 8.96861 13.3747L8.90611 13.4059Z" fill="currentColor"/>'; return s; }
/* 피드 배치: 받은 순서대로 왼쪽 → 오른쪽으로 한 줄씩 (CSS 다단은 위→아래로 채워 순서가 어긋남) */
const MAS = { cols: [], hs: [], n: 0, seq: 0, el: new Map() };
function masCount() { const g = $("#grid"); g.classList.remove("mas"); const n = parseInt(getComputedStyle(g).columnCount, 10) || 2; g.classList.add("mas"); return n; }
function masReset() {
  const g = $("#grid"); MAS.n = masCount();
  MAS.cols = Array.from({ length: MAS.n }, () => h("div", { class: "mcol" })); MAS.hs = Array(MAS.n).fill(0);
  g.replaceChildren(...MAS.cols);
}
/* 순서대로: 1번째 카드는 1열, 2번째는 2열 … n번째 다음은 다시 1열 (줄 수가 바뀌어도 늘 같은 규칙으로 다시 놓음) */
function masPlace(it, el) {
  const k = MAS.hs.reduce((a, b) => a + b, 0) % MAS.n;
  MAS.cols[k].append(el);
  MAS.hs[k] += 1;
}
function masAdd(items) {
  if (!MAS.cols.length || MAS.cols[0].parentNode !== $("#grid")) masReset();
  MAS.seq = 0;
  for (const it of items) {
    const c = card(it); c.style.setProperty("--i", String(Math.min(MAS.seq++, 11)));
    c.addEventListener("animationend", () => c.classList.add("in"), { once: true });
    MAS.el.set(it.id, c); masPlace(it, c);
  }
}
/* 필터 · 상세 패널을 열고 닫아 줄 수나 폭이 바뀌면: 카드를 새로 만들지 않고 옮긴 뒤,
   바뀌기 '직전' 자리에서 새 자리로 미끄러지게 (FLIP). 직전 자리는 바뀐 클래스를 잠깐 되돌려 재요 — 화면에 그려지기 전이라 보이지 않음 */
const RM = matchMedia("(prefers-reduced-motion: reduce)");
const LAY = document.querySelector(".layout");
function masRects() {
  const m = new Map();
  for (const it of S.items) { const c = MAS.el.get(it.id); if (!c) continue; const r = c.getBoundingClientRect(); if (r.width && r.bottom > -300 && r.top < innerHeight + 300) m.set(c, r); }
  return m;
}
/* 바뀌기 직전 카드 위치를 찍어 둠 (패널 숨김 등 클래스 말고 다른 변화가 먼저 일어나도 정확하게) */
function masSnap() { if (MAS.cols.length && !$("#layout").hidden) { MAS.snap = masRects(); clearTimeout(masSnap.t); masSnap.t = setTimeout(() => (MAS.snap = null), 0); } }
function masRebuild() {
  const n = masCount(); if (n === MAS.n) return;
  for (const c of MAS.el.values()) c.classList.add("in");
  masReset();
  for (const it of S.items) { const c = MAS.el.get(it.id) || card(it); MAS.el.set(it.id, c); masPlace(it, c); }
}
function masFlip(before) {
  if (RM.matches) return;
  before.forEach((r0, c) => {
    const r1 = c.getBoundingClientRect(); if (!r1.width) return;
    // 자리만 미끄러지게 (크기 확대·축소 효과는 쓰지 않음 — 글자 · 프로필이 커졌다 작아졌다 보이지 않게)
    const dx = r0.left - r1.left, dy = r0.top - r1.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    c.classList.add("in");
    c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
  });
}
const masObs = new MutationObserver((recs) => {
  const g = $("#grid"); const rec = recs.find((r) => r.attributeName === "class");
  if (!rec || !g.classList.contains("mas") || !MAS.cols.length || $("#layout").hidden) return;
  const now = LAY.className; if (rec.oldValue === now) return;
  let before = MAS.snap; MAS.snap = null;
  if (!before) { LAY.className = rec.oldValue; before = masRects(); LAY.className = now; masObs.takeRecords(); }
  masRebuild(); masFlip(before);
});
if (LAY) masObs.observe(LAY, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
function masRelayout() { const g = $("#grid"); if (!g.classList.contains("mas") || !MAS.cols.length) return; masRebuild(); }
let masT; window.addEventListener("resize", () => { clearTimeout(masT); masT = setTimeout(masRelayout, 120); });
function skeleton() { const g = $("#grid"); for (let i = 0; i < 10; i++) g.append(h("div", { class: "card skel" }, h("span", { class: "im", style: `aspect-ratio:3/${3 + (i % 3)}` }))); }
async function reload() {
  S.items = []; S.total = 0; S.done = false; $("#grid").classList.remove("mas"); MAS.cols = []; MAS.el.clear(); $("#grid").replaceChildren(); $("#empty").hidden = true; $("#zero").hidden = true;
  await more(true);
}
async function more(first) {
  if (S.loading || S.done) return;
  S.loading = true; const my = ++S.req;
  if (first) skeleton();
  const p = new URLSearchParams({ q: S.q, tags: S.applied.join(","), offset: S.items.length });
  if (S.sort) p.set("sort", S.sort);
  if (S.colors.length) p.set("color", S.colors.join(","));
  if ((S.kinds || []).length) p.set("kind", S.kinds.join(","));
  if (S.pose) p.set("ids", S.pose.ids.join(",") || "0");
  try {
    const d = S.pose && !S.pose.ids.length ? { items: [], total: 0, sort: S.sort || "recent" } : await api("/api/images?" + p);
    if (my !== S.req) return;
    if (first) { MAS.cols = []; MAS.el.clear(); masReset(); }
    if (S.pose && S.pose.part !== "all") d.items.forEach((it) => { it.crop = poseCrop(S.pose.lm[it.id], it.w, it.h, S.pose.part); });
    S.items.push(...d.items); S.total = d.total;
    masAdd(d.items);
    S.done = d.items.length === 0 || S.items.length >= d.total;
    if (S.pose) {   // REFFY 사진을 다 보여 준 뒤 실사 사진(COCO)을 이어 붙임
      const ext = S.pose.ext.map((ph) => { const coco = String(ph.id).startsWith("coco"); const src = coco ? `/api/pose/photo/${ph.id}` : null;
        return { id: "u:" + ph.id, ext: true, coco, pid: ph.id, rid: ph.rid, likes: ph.likes, liked: ph.liked, thumb: src || ph.regular, full: src || ph.full, w: ph.width, h: ph.height,
          author: coco ? "COCO 2017" : ph.authorName, lic: coco ? ph.authorName : "", user: ph.authorUsername,
          crop: S.pose.part !== "all" ? poseCrop(ph.normalizedLandmarks, ph.width, ph.height, S.pose.part) : null }; });
      d.total = S.total = d.total + ext.length;
      if (S.done && !S.pose.extShown) { S.pose.extShown = true; S.items.push(...ext); masAdd(ext); }
    }
    drawBar(d);
    if (first && d.total === 0) drawZero();
  } catch (e) {
    if (first) $("#grid").replaceChildren();
    $("#empty").hidden = false; $("#empty").replaceChildren(h("h2", {}, "불러오지 못했어요"), h("p", {}, e.message), h("button", { class: "btn", onclick: () => reload() }, "다시 시도"));
  } finally { S.loading = false; }
}
/* 검색 결과 0개 (HOM_0501 빈 상태): 추천 키워드 · 추천 레퍼런스 */
async function drawZero() {
  const z = $("#zero"); z.hidden = false;
  const any = S.q || S.pose || S.applied.length || S.colors.length || (S.kinds || []).length;
  const kw = h("div", { class: "z-kw" }), rec = h("div", { class: "z-rec" });
  z.replaceChildren(
    h("div", { class: "z-empty" }, h("span", { class: "z-ic" }, icon("search", 40)),
      h("div", { class: "z-tx" }, h("h2", {}, any ? "검색 결과가 없어요" : "아직 레퍼런스가 없어요"), h("p", {}, any ? "다른 키워드로 검색하거나 필터를 바꿔 보세요" : "첫 레퍼런스를 올려 보세요")),
      any ? h("button", { class: "btn m", type: "button", onclick: () => { S.pose = null; S.q = ""; qEl.value = ""; S.applied = []; S.picked = new Set(); S.kinds = []; S.pickedKind = new Set(); S.colors = []; drawGroups(); reload(); } }, "피드 둘러보기")
        : h("button", { class: "btn m", type: "button", onclick: () => openUpload() }, "+ 업로드"), kw),
    rec);
  try {
    const p = await api("/api/popular");
    const list = (Array.isArray(p) ? p : p.items || []).slice(0, 6);
    if (list.length) kw.replaceChildren(h("span", { class: "z-lb" }, "추천 키워드"), h("div", { class: "z-chips" }, list.map((t) => h("button", { class: "pill", type: "button", onclick: () => (t.ikey ? applyTag(t.ikey, t.label) : runQuery(t.label || t.keyword || t)) }, t.label || t.keyword || t))));
  } catch { /* 없으면 생략 */ }
  if (!any) return;
  try {
    const r = await api("/api/images?q=&tags=&offset=0");
    if (r.items.length) rec.replaceChildren(h("h3", {}, "추천 레퍼런스"), h("div", { class: "grid" }, r.items.slice(0, isM() ? 6 : 10).map(card)));
  } catch { /* 없으면 생략 */ }
}
/* 적용 칩 지우기 아이콘 (Figma Common/Chip · Remove icon 18) */
function chipX() { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 18 18"); s.setAttribute("width", "18"); s.setAttribute("height", "18"); s.setAttribute("aria-hidden", "true"); s.innerHTML = '<path fill-rule="evenodd" clip-rule="evenodd" d="M9.36328 1.69629C11.1705 1.78611 12.8854 2.54422 14.1709 3.82983C15.542 5.20116 16.3125 7.06078 16.3125 9C16.3124 10.9393 15.5422 12.7996 14.1709 14.1709C12.7995 15.5422 10.9394 16.3125 9 16.3125C7.06064 16.3125 5.20046 15.5422 3.8291 14.1709C2.45779 12.7996 1.68755 10.9393 1.6875 9C1.6875 7.06078 2.45797 5.20116 3.8291 3.82983C5.2003 2.45852 7.06003 1.68769 8.99927 1.6875H9.00073L9.36328 1.69629ZM11.4595 6.53979C11.2398 6.32031 10.8837 6.32019 10.6641 6.53979L8.99927 8.20459L7.33447 6.53979C7.11479 6.32031 6.75867 6.32019 6.53906 6.53979C6.31964 6.75942 6.31964 7.11558 6.53906 7.33521L8.20386 9L6.53906 10.6648C6.31964 10.8844 6.31964 11.2406 6.53906 11.4602C6.75867 11.6798 7.11479 11.6797 7.33447 11.4602L8.99927 9.79541L10.6641 11.4602C10.8837 11.6798 11.2398 11.6797 11.4595 11.4602C11.6791 11.2405 11.6791 10.8845 11.4595 10.6648L9.79468 9L11.4595 7.33521C11.6791 7.11554 11.6791 6.75946 11.4595 6.53979Z" fill="currentColor"/>'; return s; }
function drawBar(d) {
  const hasQ = !!S.q;
  mobileBar(hasQ);
  $("#qClear").hidden = !qEl.value;
  const t = $("#resultTitle"); t.textContent = isM() ? "검색 결과" : hasQ ? `“${S.q}”` : S.pose ? "3D 포즈 검색 결과" : (S.applied.length || S.colors.length || (S.kinds || []).length ? "검색 결과" : "레퍼런스"); t.className = hasQ ? "q" : "";
  $("#count").textContent = `${S.total.toLocaleString()}개`;
  curSort = d.sort; drawSort();
  const chips = $("#chips"); chips.replaceChildren();
  const seen = new Set();
  if (S.pose) chips.append(h("span", { class: "chip dark" }, `3D 포즈 · ${S.pose.label}`, h("button", { type: "button", "aria-label": "3D 포즈 검색 지우기", onclick: () => { S.pose = null; reload(); } }, isM() ? "✕" : chipX())));
  if (S.q) chips.append(h("span", { class: "chip dark" }, S.q, h("button", { type: "button", "aria-label": `검색어 ${S.q} 지우기`, onclick: () => runQuery("") }, isM() ? "✕" : chipX())));
  S.applied.map((k) => ({ ikey: k, label: S.labels[k]?.label || k, short: S.labels[k]?.short || S.labels[k]?.label || k })).forEach((m) => {
    if (seen.has(m.ikey)) return; seen.add(m.ikey);
    chips.append(h("span", { class: "chip dark" }, isM() ? "#" + m.label : m.short, S.applied.includes(m.ikey) ? h("button", { type: "button", "aria-label": `${m.label} 필터 해제`, onclick: () => { S.picked.delete(m.ikey); S.applied = S.applied.filter((x) => x !== m.ikey); drawGroups(); reload(); } }, isM() ? "✕" : chipX()) : null));
  });
  (S.kinds || []).forEach((k) => chips.append(h("span", { class: "chip dark" }, (isM() ? "#" : "") + (KINDS.find((x) => x[0] === k) || [k, k])[1],
    h("button", { type: "button", "aria-label": "종류 필터 해제", onclick: () => { S.kinds = S.kinds.filter((x) => x !== k); S.pickedKind.delete(k); drawGroups(); reload(); } }, isM() ? "✕" : chipX()))));
  S.colors.forEach((c) => chips.append(h("span", { class: "chip dark" }, h("i", { class: "sw", style: `background:${c}` }), c.toUpperCase(),
    h("button", { type: "button", "aria-label": `${c} 색상 해제`, onclick: () => { S.colors = S.colors.filter((x) => x !== c); drawColorPanel(); reload(); } }, isM() ? "✕" : chipX()))));
  $("#empty").hidden = true;   // 0개일 때는 drawZero() 가 빈 상태를 그립니다
}
new IntersectionObserver((en) => { if (en[0].isIntersecting && S.items.length) more(false); }, { rootMargin: "600px" }).observe($("#more"));

/* ---------------------------------------------------------------- 태그 추가 선택기 */
let vocabFlat = null;
function flat() { return vocabFlat || (vocabFlat = S.vocab.groups.flatMap((g) => g.axes.flatMap((a) => a.tags.map((t) => ({ ikey: t.ikey, label: t.label, axis: a.name }))))); }
function picker(onPick, exclude) {
  const box = h("div", { class: "box" });
  const input = h("input", { type: "search", placeholder: "태그 이름 검색", "aria-label": "태그 검색" });
  const list = h("div", {});
  const draw = () => {
    const q = input.value.trim().toLowerCase(); list.replaceChildren();
    flat().filter((t) => !exclude().has(t.ikey) && (!q || t.label.toLowerCase().includes(q) || t.axis.toLowerCase().includes(q))).slice(0, 30)
      .forEach((t) => list.append(h("button", { class: "opt", type: "button", onclick: () => { onPick(t); draw(); } }, t.label, h("small", {}, t.axis))));
    if (!list.children.length) list.append(h("p", { class: "hint" }, "맞는 태그가 없어요."));
  };
  input.oninput = draw; box.append(input, list); draw(); setTimeout(() => input.focus(), 0);
  return box;
}

/* ---------------------------------------------------------------- 스켈레톤 (불러오는 동안 자리만 보여 주고 빛이 지나가는 모션) */
const sk = (cls, style) => h("span", { class: "sk " + (cls || ""), style: style || null, "aria-hidden": "true" });
function skDetail() {
  return h("div", { class: "pbody sk-detail", role: "status", "aria-label": "불러오는 중" },
    sk("sk-img"),
    h("div", { class: "sk-row" }, sk("sk-av"), h("div", { class: "sk-col" }, sk("sk-ln", "width:40%"), sk("sk-ln sm", "width:25%")), sk("sk-pill")),
    sk("sk-ln lg", "width:60%"), sk("sk-ln", "width:85%"),
    h("div", { class: "sk-tags" }, ...[56, 72, 48, 64, 80].map((w) => sk("sk-tag", `width:${w}px`))));
}
const skCard = (hgt) => h("span", { class: "sk-card", "aria-hidden": "true" }, sk("sk-im", `height:${hgt}px`), h("span", { class: "sk-ft" }, sk("sk-av xs"), sk("sk-ln sm", "width:50%")));
const skFollows = (n = 6) => h("div", { class: "sk-list", role: "status", "aria-label": "불러오는 중" }, ...Array.from({ length: n }, () => h("div", { class: "sk-row" }, sk("sk-av"), h("div", { class: "sk-col" }, sk("sk-ln", "width:45%"), sk("sk-ln sm", "width:30%")), sk("sk-pill"))));

/* ---------------------------------------------------------------- 상세 패널 */
async function openDetail(id, back = false) {
  if (!back && S.open && S.open !== id) S.hist.push(S.open);   // back 버튼용: 직전에 본 이미지 기록
  S.open = id; document.querySelectorAll(".card").forEach((c) => c.classList.toggle("sel", +c.dataset.id === id));
  masSnap(); clearTimeout(closeDetail.t); $("#layout").classList.remove("p-closing"); $("#panel").style.cssText = "";
  const panel = $("#panel"); panel.hidden = false; $("#layout").classList.add("has-panel"); document.documentElement.classList.add("m-detail"); if (isM()) panel.scrollTop = 0;
  panel.replaceChildren(skDetail());
  try { const [d, so] = await Promise.all([api("/api/images/" + id), api("/api/images/" + id + "/social")]); d.so = so; drawDetail(d); }
  catch (e) { panel.replaceChildren(h("div", { class: "pbody" }, h("p", {}, e.message))); }
}
function goBack() { const p = S.hist.pop(); if (p != null) openDetail(p, true); }
function closeDetail() {
  S.hist = []; S.open = null; masSnap();
  const P = $("#panel"), L = $("#layout");
  clearTimeout(closeDetail.t);
  if (!isM() && !RM.matches && L.classList.contains("has-panel")) {   // PC: 패널이 오른쪽으로 미끄러져 나가는 동안 피드가 같은 속도로 채워짐
    const r = P.getBoundingClientRect(); P.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    L.classList.add("p-closing"); closeDetail.t = setTimeout(() => { L.classList.remove("p-closing"); P.style.cssText = ""; if (!L.classList.contains("has-panel")) P.hidden = true; }, 340);
  } else P.hidden = true;
  L.classList.remove("has-panel"); document.documentElement.classList.remove("m-detail");
  document.querySelectorAll(".card.sel").forEach((c) => c.classList.remove("sel"));
  if (location.hash.startsWith("#/post/")) location.hash = isM() && route.prev && !route.prev.startsWith("#/post/") ? route.prev : "#/";
}
async function refreshSocial(d, edit = false) { try { d.so = await api(`/api/images/${d.id}/social`); drawDetail(d, edit); } catch (e) { toast(e.message); } }
async function act(d, method, url, body, edit) {
  if (!needLogin()) return;
  try { await api(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); await refreshSocial(d, edit); if (method === "POST" && url.endsWith("/keep")) toast("킵 스페이스에 담았어요. 나중에 골라서 북에 정리하세요.", ["킵 스페이스 보기", "#/keep"]); } catch (e) { toast(e.message); }
}
/* 사용 소재 링크 목록 (있을 때만) */
function materialsSec(d) {
  if (!d.materials || !d.materials.length) return null;
  return h("div", { class: "sec" }, h("div", { class: "sec-h" }, h("h3", {}, "사용 소재")),
    h("ul", { class: "mat-list" }, d.materials.map((l) => h("li", {}, icon("link", 16), h("a", { href: l, target: "_blank", rel: "noopener noreferrer nofollow" }, l.replace(/^https?:\/\//, ""))))));
}
/* 이미지 기반 관절 검색 (COM_0104): 3D 포즈 필터로 이동. 검색 자체는 준비 중 */
async function pullPose() {
  if (!(await (isM() ? confirmDialog("해당 이미지의 구도를 ‘3D Pose’에 덮어씌울까요?", "3D Pose 필터에 이 이미지의 구도가 적용돼요.", { ok: "덮어씌우기", cancel: "취소" })
    : confirmDialog("해당 이미지의 구도를 ‘3D 포즈’에\n덮어 씌우겠습니까?", "이미지에서 뽑은 관절 핀이 3D 모델 포즈로 바뀌어요.", { fig: true, no: "아니오", yes: "예" })))) return;
  const id = S.open;
  if (isM() && !$("#panel").hidden) closeDetail();
  setFilterOpen(true); showTab("pose");
  toast("이미지에서 자세를 읽는 중이에요…");
  try {
    const R = await loadPoseEngine();
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = `/img/${id}`; await img.decode();
    const r = await R.detect(img);
    if (!r || r.world.filter((x) => x.visibility > 0.4).length < 8) return toast("이 이미지에서 사람 자세를 찾지 못했어요. 마네킹을 직접 움직여 보세요.");
    if (POSE.ed) POSE.ed.setLandmarks(r.world); else POSE.pending = r.world;
    toast("이미지 구도를 마네킹에 옮겼어요. ‘포즈 적용하기’로 비슷한 사진을 찾아보세요.");
  } catch (e) { toast(e.message || "자세를 읽지 못했어요"); }
}
/* 게시물 수정 (MYP_0200 수정 모드): 제목 · 사용 소재 · 공개 설정. 태그는 상세 화면의 ‘태그 수정’에서 */
function editPost(d, after) {
  const st = { title: d.title || "", materials: [...(d.materials || [])], tools: [...(d.tools || [])], private: !!d.private };
  const tags0 = new Map(d.tags.filter((t) => t.active).map((t) => [t.ikey, t.label]));
  const tags = new Map(tags0);   // 수정 중인 태그 (저장할 때 원래와 비교해 더하고 뺌)
  const onPick = (t) => {
    // 한 개만 고르는 분류(예: 인원)는 같은 분류의 기존 태그를 바꿔 줌
    const ax = S.labels[t.ikey]?.axis; const one = S.vocab && S.vocab.groups.flatMap((g) => g.axes).find((a) => a.name === ax && a.mode === "단일");
    if (one) [...tags.keys()].forEach((k) => { if (S.labels[k]?.axis === ax) tags.delete(k); });
    tags.set(t.ikey, t.label); draw();
  };
  const m = h("div", { class: "modal" + (isM() ? " mfull" : ""), onmousedown: (e) => !isM() && e.target === m && m.remove() });
  const save_ = async () => {
    try {
      await api(`/api/images/${d.id}/meta`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(st) });
      const add = [...tags.keys()].filter((k) => !tags0.has(k)), remove = [...tags0.keys()].filter((k) => !tags.has(k));
      if (add.length || remove.length) {
        const r = await api(`/api/images/${d.id}/tags`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ add, remove, restore: [] }) });
        d.tags = r.tags; loadVocab().catch(() => {});
      }
      m.remove(); toast("게시물을 수정했어요");
      const fresh = await api(`/api/images/${d.id}`); fresh.so = d.so; Object.assign(d, fresh); if (after) after(d); else { drawDetail(d); reload(); }
    } catch (e) { toast(e.message); }
  };
  const draw = () => m.replaceChildren(h("div", { class: "dlg bk edit", role: "dialog", "aria-modal": "true", "aria-label": "게시물 수정" },
    isM() ? h("div", { class: "mbar" }, h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => m.remove() }, icon("close", 24)), h("h1", {}, "게시물 수정"), h("div", { class: "mbar-r" }))
      : h("div", { class: "chd" }, h("h2", {}, "게시물 수정"), h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => m.remove() }, icon("close", 24))),
    h("div", { class: "ed-body" },
      h("div", { class: "ed-img" }, h("img", { src: d.full, alt: "" })),
      h("div", { class: "field" }, h("label", { for: "edTitle" }, "제목"), h("input", { class: "inp", id: "edTitle", maxlength: "120", value: st.title, placeholder: "게시물 제목을 입력하세요", oninput: (e) => (st.title = e.target.value) })),
      h("div", { class: "field" }, h("label", {}, "태그"),
        tags.size ? h("div", { class: "tags ed-tags" }, [...tags].map(([k, l]) => h("button", { class: "tag ed-tag", type: "button", title: "눌러서 빼기", "aria-label": `${l} 태그 빼기`, onclick: () => { tags.delete(k); draw(); } }, "#" + l, h("x", { "aria-hidden": "true" }, "×"))))
          : h("p", { class: "hint" }, "붙은 태그가 없어요. 아래에서 추가하세요."),
        pickButton(h("div", { class: "pick" }), onPick, () => new Set(tags.keys()))),
      materialsField(st.materials, draw),
      toolsField(st.tools, draw),
      privacyField(st.private, (v) => { st.private = v; })),
    h("div", { class: "cft" }, btn("취소", "", () => m.remove()), btn(isM() ? "수정 완료" : "저장", "primary", save_))));
  draw(); document.body.append(m);
}
/* 상세 패널 아이콘 (Figma DetailedPanel 2513:142696 에서 그대로 가져온 모양) */
const DP_SVG = {
  back: ["0 0 36 36", '<path d="M20.9545 8.2045C21.3938 7.76517 22.106 7.76517 22.5453 8.2045C22.9847 8.64384 22.9847 9.35599 22.5453 9.79533L14.3407 17.9999L22.5453 26.2045C22.9847 26.6438 22.9847 27.356 22.5453 27.7953C22.106 28.2347 21.3938 28.2347 20.9545 27.7953L11.9545 18.7953C11.5152 18.356 11.5152 17.6438 11.9545 17.2045L20.9545 8.2045Z" fill="currentColor"/>'],
  close: ["0 0 36 36", '<path d="M25.4545 8.9545C25.8938 8.51517 26.606 8.51517 27.0453 8.9545C27.4847 9.39384 27.4847 10.106 27.0453 10.5453L19.5907 17.9999L27.0453 25.4545C27.4847 25.8938 27.4847 26.606 27.0453 27.0453C26.606 27.4847 25.8938 27.4847 25.4545 27.0453L17.9999 19.5907L10.5453 27.0453C10.106 27.4847 9.39384 27.4847 8.9545 27.0453C8.51517 26.606 8.51517 25.8938 8.9545 25.4545L16.4091 17.9999L8.9545 10.5453C8.51517 10.106 8.51517 9.39384 8.9545 8.9545C9.39384 8.51517 10.106 8.51517 10.5453 8.9545L17.9999 16.4091L25.4545 8.9545Z" fill="currentColor"/>'],
  pose: ["15 15 28 28", '<path d="M30.167 20.5417C30.167 20.2323 30.0439 19.9356 29.8252 19.7168C29.6337 19.5253 29.3826 19.4072 29.1154 19.3807L29.0003 19.375L28.8852 19.3807C28.6181 19.4072 28.3669 19.5253 28.1754 19.7168C27.9568 19.9356 27.8337 20.2323 27.8337 20.5417C27.8337 20.851 27.9567 21.1478 28.1754 21.3665C28.3942 21.5853 28.6909 21.7083 29.0003 21.7083C29.3097 21.7083 29.6064 21.5853 29.8252 21.3665C30.0439 21.1478 30.1669 20.851 30.167 20.5417ZM31.917 20.5417C31.9169 21.3151 31.6094 22.057 31.0625 22.6038C30.5155 23.1507 29.7738 23.4583 29.0003 23.4583C28.2268 23.4583 27.4851 23.1507 26.9381 22.6038C26.3913 22.057 26.0838 21.3151 26.0837 20.5417C26.0837 19.7684 26.3904 19.0264 26.937 18.4795C27.4837 17.9325 28.2258 17.6253 28.9992 17.625H29.0015L29.2897 17.6398C29.9572 17.7064 30.5853 18.0009 31.0636 18.4795C31.6103 19.0264 31.917 19.7684 31.917 20.5417Z" fill="currentColor"/><path d="M28.9997 18.5C28.4583 18.5002 27.9391 18.7154 27.5563 19.0983C27.1736 19.4812 26.9586 20.0005 26.9587 20.542C26.9587 21.0834 27.1739 21.6026 27.5567 21.9854C27.9396 22.3683 28.4589 22.5833 29.0003 22.5833C29.5418 22.5833 30.061 22.3683 30.4439 21.9854C30.8268 21.6026 31.0419 21.0834 31.042 20.542C31.0421 20.0005 30.8271 19.4812 30.4443 19.0983C30.0615 18.7154 29.5423 18.5002 29.0009 18.5H28.9997Z" fill="currentColor"/><path d="M36.9454 24.0701C37.4129 23.9482 37.8909 24.2281 38.0129 24.6956C38.1349 25.1632 37.8549 25.6411 37.3874 25.7632C34.6328 26.4818 31.8751 26.8421 28.9997 26.8421C26.1244 26.8421 23.3667 26.4818 20.6121 25.7632C20.1446 25.6411 19.8646 25.1632 19.9866 24.6956C20.1086 24.2281 20.5866 23.9482 21.0541 24.0701C23.6661 24.7515 26.2752 25.0921 28.9997 25.0921C31.7243 25.0921 34.3334 24.7515 36.9454 24.0701Z" fill="currentColor"/><path d="M26.6664 25.9667H31.3331V38.625H30.5747V32.7917H27.4247V38.625H26.6664V25.9667Z" fill="currentColor"/><path d="M31.3331 25.0917C31.8163 25.0917 32.2081 25.4834 32.2081 25.9667V38.6246C32.2081 39.1078 31.8163 39.4996 31.3331 39.4996H30.5752C30.092 39.4996 29.7002 39.1078 29.7002 38.6246V33.6662H28.2993V38.6246C28.2993 39.1078 27.9075 39.4996 27.4243 39.4996H26.6664C26.1832 39.4996 25.7914 39.1078 25.7914 38.6246V25.9667C25.7914 25.4834 26.1832 25.0917 26.6664 25.0917H31.3331ZM27.0164 32.0222C27.1386 31.9572 27.2762 31.9163 27.4243 31.9162H30.5752C30.7233 31.9163 30.8609 31.9572 30.9831 32.0222L30.4581 26.8417H27.5414L27.0164 32.0222Z" fill="currentColor"/>'],   // Figma 2513:142923 새 3D 포즈 아이콘
  palette: ["20 20 28 28", '<path d="M42.75 32.6579C42.7497 28.8728 38.9388 25.25 34 25.25C31.6794 25.25 29.4533 26.1714 27.8123 27.8123C26.1714 29.4533 25.25 31.6794 25.25 34C25.25 36.3206 26.1714 38.5467 27.8123 40.1877C29.4533 41.8286 31.6794 42.75 34 42.75C34.7668 42.75 35.1667 42.2422 35.1667 41.6414C35.1666 41.3786 35.047 41.1032 34.8442 40.8599C34.4638 40.4032 34.1162 39.7453 34.1162 38.9583C34.1162 37.3904 35.4189 36.2171 36.9167 36.2171H39.1919C40.1354 36.2171 41.0403 35.8418 41.7075 35.1746C42.3748 34.5073 42.75 33.6016 42.75 32.6579ZM44.5 32.6579C44.5 34.0657 43.9403 35.4164 42.9448 36.4119C41.9494 37.4073 40.5996 37.9671 39.1919 37.9671H36.9167C36.3144 37.9671 35.8662 38.4263 35.8662 38.9583C35.8662 39.2212 35.9859 39.4966 36.1886 39.7399C36.5691 40.1965 36.9166 40.8544 36.9167 41.6414C36.9167 43.1407 35.7999 44.5 34 44.5C31.2152 44.5 28.5442 43.3941 26.575 41.425C24.6059 39.4558 23.5 36.7848 23.5 34C23.5 31.2152 24.6059 28.5442 26.575 26.575C28.5442 24.6059 31.2152 23.5 34 23.5C39.6775 23.5 44.4997 27.6933 44.5 32.6579Z" fill="currentColor"/><path d="M27.7292 33.7197V33.7083C27.7292 32.9835 28.3168 32.3958 29.0417 32.3958C29.7665 32.3958 30.3542 32.9835 30.3542 33.7083V33.7197C30.3542 34.4446 29.7665 35.0322 29.0417 35.0322C28.3168 35.0322 27.7292 34.4446 27.7292 33.7197ZM38.2292 32.5531V32.5417C38.2292 31.8168 38.8168 31.2292 39.5417 31.2292C40.2665 31.2292 40.8542 31.8168 40.8542 32.5417V32.5531C40.8542 33.2779 40.2665 33.8656 39.5417 33.8656C38.8168 33.8656 38.2292 33.2779 38.2292 32.5531ZM30.0625 29.0531V29.0417C30.0625 28.3168 30.6501 27.7292 31.375 27.7292C32.0999 27.7292 32.6875 28.3168 32.6875 29.0417V29.0531C32.6875 29.7779 32.0999 30.3656 31.375 30.3656C30.6501 30.3656 30.0625 29.7779 30.0625 29.0531ZM35.3125 28.7614V28.75C35.3125 28.0251 35.9001 27.4375 36.625 27.4375C37.3499 27.4375 37.9375 28.0251 37.9375 28.75V28.7614C37.9375 29.4863 37.3499 30.0739 36.625 30.0739C35.9001 30.0739 35.3125 29.4863 35.3125 28.7614Z" fill="currentColor"/>'],
  plus: ["20 20 28 28", '<path d="M33.1247 42.1666V34.8749H25.833C25.3498 34.8749 24.958 34.4832 24.958 33.9999C24.958 33.5167 25.3498 33.1249 25.833 33.1249H33.1247V25.8333C33.1247 25.35 33.5164 24.9583 33.9997 24.9583C34.4829 24.9583 34.8747 25.35 34.8747 25.8333V33.1249H42.1663C42.6496 33.1249 43.0413 33.5167 43.0413 33.9999C43.0413 34.4832 42.6496 34.8749 42.1663 34.8749H34.8747V42.1666C34.8747 42.6498 34.4829 43.0416 33.9997 43.0416C33.5164 43.0416 33.1247 42.6498 33.1247 42.1666Z" fill="currentColor"/>'],
  check: ["0 0 20 20", '<path d="M7.95768 13.042L15.0202 5.97949C15.1868 5.81283 15.3813 5.72949 15.6035 5.72949C15.8257 5.72949 16.0202 5.81283 16.1869 5.97949C16.3535 6.14616 16.4368 6.34755 16.4368 6.58366C16.4368 6.80588 16.3535 7.00033 16.1869 7.16699L8.54102 14.8337C8.37435 15.0003 8.1799 15.0837 7.95768 15.0837C7.73546 15.0837 7.54102 15.0003 7.37435 14.8337L3.79102 11.2503C3.62435 11.0837 3.54102 10.8892 3.54102 10.667C3.5549 10.4309 3.64518 10.2295 3.81185 10.0628C3.97852 9.89616 4.17296 9.81283 4.39518 9.81283C4.63129 9.81283 4.83268 9.89616 4.99935 10.0628L7.95768 13.042Z" fill="currentColor"/>'],
  heart: ["0 0 20 20", '<path d="M10.3218 16.578C10.124 16.6965 9.87668 16.6965 9.67887 16.578L10.0003 16.0417L10.3218 16.578ZM15.8337 7.83366C15.8337 6.18392 14.577 5.00017 13.0423 5C11.987 5 11.0576 5.57864 10.5366 6.44694C10.4237 6.63512 10.2198 6.74967 10.0003 6.74967C9.78083 6.74967 9.577 6.63512 9.46403 6.44694C8.94305 5.57864 8.01364 5 6.95833 5C5.42368 5.00017 4.16699 6.18392 4.16699 7.83366C4.16707 8.76158 4.51389 9.70142 5.08171 10.6136C5.64858 11.5243 6.4149 12.3733 7.19841 13.1063C7.97964 13.8371 8.76346 14.4393 9.35335 14.8592C9.61319 15.0442 9.83516 15.1922 10.0003 15.3003C10.1655 15.1922 10.3875 15.0442 10.6473 14.8592C11.2372 14.4393 12.021 13.8371 12.8022 13.1063C13.5858 12.3733 14.3521 11.5243 14.9189 10.6136C15.4868 9.70142 15.8336 8.76158 15.8337 7.83366ZM17.0837 7.83366C17.0836 9.07215 16.6231 10.2415 15.9801 11.2744C15.3362 12.3089 14.4877 13.2412 13.6567 14.0186C12.8236 14.798 11.9925 15.4353 11.3716 15.8773C11.0606 16.0987 10.8013 16.2729 10.618 16.3916C10.5264 16.4509 10.4535 16.4962 10.4032 16.5275C10.378 16.5432 10.3582 16.5558 10.3446 16.5641L10.3242 16.5763L10.3226 16.5771L10.0003 16.0417L9.67806 16.5771L9.67643 16.5763L9.65609 16.5641C9.64242 16.5558 9.62266 16.5432 9.59749 16.5275C9.54716 16.4962 9.47423 16.4509 9.38265 16.3916C9.1994 16.2729 8.94008 16.0987 8.62907 15.8773C8.00811 15.4353 7.17707 14.798 6.34391 14.0186C5.51296 13.2412 4.66448 12.3089 4.02051 11.2744C3.37754 10.2415 2.91707 9.07215 2.91699 7.83366C2.91699 5.48363 4.74329 3.75017 6.95833 3.75C8.16497 3.75 9.24156 4.27373 10.0003 5.09196C10.7591 4.27373 11.8357 3.75 13.0423 3.75C15.2574 3.75017 17.0837 5.48363 17.0837 7.83366Z" fill="currentColor"/>'],
  "heart:f": ["0 0 20 20", '<path d="M10 16.04C9.9 16.04 9.8 16.01 9.7 15.95C9.5 15.83 2.9 11.85 2.9 7.83C2.9 5.48 4.74 3.75 6.96 3.75C8.16 3.75 9.24 4.27 10 5.09C10.76 4.27 11.84 3.75 13.04 3.75C15.26 3.75 17.08 5.48 17.08 7.83C17.08 11.85 10.5 15.83 10.3 15.95C10.2 16.01 10.1 16.04 10 16.04Z" fill="currentColor"/>'],
  comment: ["0 0 20 20", '<path d="M17.0837 3.75008C17.0837 3.52907 16.9958 3.31717 16.8395 3.16089C16.6832 3.00461 16.4713 2.91675 16.2503 2.91675H3.75033C3.52931 2.91675 3.31741 3.00461 3.16113 3.16089C3.00485 3.31717 2.91699 3.52907 2.91699 3.75008V16.0743L5.05811 13.9332L5.15332 13.8551C5.25519 13.7871 5.37573 13.7501 5.5 13.7501H16.2503C16.4713 13.7501 16.6832 13.6622 16.8395 13.5059C16.9958 13.3497 17.0837 13.1378 17.0837 12.9167V3.75008ZM18.3337 12.9167C18.3337 13.4693 18.114 13.999 17.7233 14.3897C17.3326 14.7804 16.8029 15.0001 16.2503 15.0001H5.75879L3.64128 17.1176C3.47726 17.275 3.27067 17.3811 3.0472 17.4228C2.82381 17.4644 2.59278 17.4396 2.38314 17.352C2.17359 17.2642 1.99438 17.117 1.86719 16.9288C1.74003 16.7406 1.6702 16.5195 1.66699 16.2924V3.75008C1.66699 3.19755 1.88664 2.6678 2.27734 2.2771C2.66804 1.8864 3.19779 1.66675 3.75033 1.66675H16.2503C16.8029 1.66675 17.3326 1.8864 17.7233 2.2771C18.114 2.6678 18.3337 3.19755 18.3337 3.75008V12.9167Z" fill="currentColor"/>'],
  link: ["0 0 15 15", '<path d="M6.25 8.75002C6.48262 8.98624 6.7599 9.17382 7.06571 9.30186C7.37151 9.4299 7.69972 9.49584 8.03125 9.49584C8.36278 9.49584 8.69099 9.4299 8.99679 9.30186C9.3026 9.17382 9.57988 8.98624 9.8125 8.75002L11.6875 6.87502C12.1599 6.40261 12.4253 5.76187 12.4253 5.09377C12.4253 4.42568 12.1599 3.78494 11.6875 3.31252C11.2151 2.84011 10.5743 2.57471 9.90625 2.57471C9.23815 2.57471 8.59742 2.84011 8.125 3.31252L7.5 3.93752" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.74954 6.24997C8.51691 6.01376 8.23963 5.82617 7.93383 5.69813C7.62803 5.57009 7.29981 5.50415 6.96829 5.50415C6.63676 5.50415 6.30855 5.57009 6.00274 5.69813C5.69694 5.82617 5.41966 6.01376 5.18704 6.24997L3.31204 8.12497C2.83962 8.59739 2.57422 9.23812 2.57422 9.90622C2.57422 10.5743 2.83962 11.2151 3.31204 11.6875C3.78445 12.1599 4.42519 12.4253 5.09329 12.4253C5.76138 12.4253 6.40212 12.1599 6.87454 11.6875L7.49954 11.0625" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'],
  share: ["0 0 24 24", '<path d="M18.75 6.25C18.75 5.85226 18.5917 5.47075 18.3105 5.18945C18.0296 4.90848 17.6471 4.75009 17.249 4.75C16.8515 4.75026 16.4705 4.90838 16.1895 5.18945C15.9083 5.47075 15.75 5.85226 15.75 6.25C15.75 6.64777 15.9082 7.02928 16.1895 7.31055C16.4708 7.59182 16.8522 7.75 17.25 7.75C17.6478 7.75 18.0292 7.59181 18.3105 7.31055C18.5918 7.02928 18.75 6.64777 18.75 6.25ZM20.25 6.25C20.2499 7.04554 19.9336 7.80857 19.3711 8.37109C18.8085 8.93363 18.0456 9.25 17.25 9.25C16.4544 9.25 15.6915 8.93363 15.1289 8.37109C14.5664 7.80857 14.2501 7.04554 14.25 6.25C14.25 5.45459 14.5656 4.69148 15.1279 4.12891C15.6903 3.56632 16.4535 3.25026 17.249 3.25C18.0441 3.25026 18.8094 3.56607 19.3721 4.12891C19.9344 4.69148 20.25 5.45459 20.25 6.25Z" fill="currentColor"/><path d="M8.25 12C8.25 11.6023 8.09174 11.2207 7.81055 10.9395C7.52958 10.6585 7.14709 10.5001 6.74902 10.5C6.35154 10.5003 5.97052 10.6584 5.68945 10.9395C5.40826 11.2207 5.25 11.6023 5.25 12C5.25004 12.3978 5.40819 12.7793 5.68945 13.0605C5.97075 13.3418 6.3522 13.5 6.75 13.5C7.1478 13.5 7.52925 13.3418 7.81055 13.0605C8.09181 12.7793 8.24996 12.3978 8.25 12ZM9.75 12C9.74991 12.7955 9.43362 13.5586 8.87109 14.1211C8.30849 14.6836 7.54559 15 6.75 15C5.95441 15 5.19151 14.6836 4.62891 14.1211C4.06638 13.5586 3.75009 12.7955 3.75 12C3.75 11.2046 4.06562 10.4415 4.62793 9.87891C5.19033 9.31632 5.95354 9.00026 6.74902 9C7.54414 9.00027 8.30942 9.31607 8.87207 9.87891C9.43438 10.4415 9.75 11.2046 9.75 12Z" fill="currentColor"/><path d="M18.75 17.75C18.75 17.3523 18.5917 16.9707 18.3105 16.6895C18.0296 16.4085 17.6471 16.2501 17.249 16.25C16.8515 16.2503 16.4705 16.4084 16.1895 16.6895C15.9083 16.9707 15.75 17.3523 15.75 17.75C15.75 18.1478 15.9082 18.5293 16.1895 18.8105C16.4708 19.0918 16.8522 19.25 17.25 19.25C17.6478 19.25 18.0292 19.0918 18.3105 18.8105C18.5918 18.5293 18.75 18.1478 18.75 17.75ZM20.25 17.75C20.2499 18.5455 19.9336 19.3086 19.3711 19.8711C18.8085 20.4336 18.0456 20.75 17.25 20.75C16.4544 20.75 15.6915 20.4336 15.1289 19.8711C14.5664 19.3086 14.2501 18.5455 14.25 17.75C14.25 16.9546 14.5656 16.1915 15.1279 15.6289C15.6903 15.0663 16.4535 14.7503 17.249 14.75C18.0441 14.7503 18.8094 15.0661 19.3721 15.6289C19.9344 16.1915 20.25 16.9546 20.25 17.75Z" fill="currentColor"/><path d="M8.09131 12.7406C8.28984 12.3771 8.74537 12.2433 9.10889 12.4418L15.6089 15.9916C15.9723 16.1901 16.1061 16.6457 15.9077 17.0092C15.7092 17.3727 15.2537 17.5065 14.8901 17.308L8.39014 13.7582C8.02663 13.5597 7.89283 13.1041 8.09131 12.7406ZM14.8901 6.69177C15.2537 6.49329 15.7092 6.6271 15.9077 6.9906C16.1062 7.35412 15.9724 7.80965 15.6089 8.00818L9.10889 11.558C8.74536 11.7565 8.28985 11.6227 8.09131 11.2592C7.89295 10.8957 8.02668 10.4401 8.39014 10.2416L14.8901 6.69177Z" fill="currentColor"/>'],
  more: ["0 0 24 24", '<path d="M10.75 18.2598V18.25C10.75 17.5596 11.3096 17 12 17C12.6904 17 13.25 17.5596 13.25 18.25V18.2598C13.25 18.9501 12.6904 19.5098 12 19.5098C11.3096 19.5098 10.75 18.9501 10.75 18.2598ZM10.75 12.0098V12C10.75 11.3096 11.3096 10.75 12 10.75C12.6904 10.75 13.25 11.3096 13.25 12V12.0098C13.25 12.7001 12.6904 13.2598 12 13.2598C11.3096 13.2598 10.75 12.7001 10.75 12.0098ZM10.75 5.75977V5.75C10.75 5.05964 11.3096 4.5 12 4.5C12.6904 4.5 13.25 5.05964 13.25 5.75V5.75977C13.25 6.45012 12.6904 7.00977 12 7.00977C11.3096 7.00977 10.75 6.45012 10.75 5.75977Z" fill="currentColor"/>'],
};
function dpSvg(k, size) {
  const [vb, body] = DP_SVG[k], s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", vb); s.setAttribute("width", size); s.setAttribute("height", size); s.setAttribute("class", "dps"); s.setAttribute("aria-hidden", "true");
  s.innerHTML = body;   // 위 상수(고정 문자열)만 넣음 — 사용자 입력 아님
  return s;
}
/* 상세 이미지 위쪽(뒤로 · 닫기 아이콘 자리)이 어두우면 아이콘을 흰색으로 — 화면에 보이는 그대로(가운데 맞춤 · 비율 유지) 그려서 위쪽 띠의 밝기를 잰다 */
function dpTone(img) {
  const box = img.parentElement; if (!box) return;
  try {
    const W = box.clientWidth, H = box.clientHeight, iw = img.naturalWidth, ih = img.naturalHeight; if (!W || !H || !iw || !ih) return;
    const sc = Math.min(W / iw, H / ih), dw = iw * sc, dh = ih * sc, dx = (W - dw) / 2, dy = (H - dh) / 2;
    const c = document.createElement("canvas"); c.width = Math.round(W / 4); c.height = Math.round(80 / 4);
    const x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#f1f0f2"; x.fillRect(0, 0, c.width, c.height);   // 이미지 바깥은 패널 바탕색
    x.drawImage(img, dx / 4, dy / 4, dw / 4, dh / 4);
    const px = x.getImageData(0, 0, c.width, c.height).data;
    const lum = (sx0, sx1) => { let t = 0, n = 0; for (let yy = 0; yy < c.height; yy++) for (let xx = sx0; xx < sx1; xx++) { const k = (yy * c.width + xx) * 4; t += 0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]; n++; } return t / n; };
    const q = Math.round(c.width * 0.18);   // 왼쪽 위(뒤로) · 오른쪽 위(닫기) 영역
    box.classList.toggle("dk-l", lum(0, q) < 140);
    box.classList.toggle("dk-r", lum(c.width - q, c.width) < 140);
  } catch { /* 색을 읽을 수 없으면 기본(검정) */ }
}
function drawDetail(d, edit = false) {
  if (isM()) return drawDetailM(d, edit);
  const panel = $("#panel"); const so = d.so || { likes: 0, comments: [], owner: null, editable: false };
  const act_ = d.tags.filter((t) => t.active), off = d.tags.filter((t) => !t.active);
  const pct = (t) => (t.prob != null && t.user !== "add" ? Math.round(t.prob * 100) + "%" : "");
  const tagEl = (t) => edit
    ? h("button", { class: "tag " + (t.user === "add" ? "user" : "ai"), type: "button", title: "눌러서 삭제", "aria-label": `${t.label} 태그 삭제`, onclick: () => save(d, { remove: [t.ikey] }, t) }, "#" + t.label, h("span", { class: "pr" }, pct(t)), h("x", {}, "×"))
    : h("button", { class: "tag" + (t.user === "add" ? " user" : ""), type: "button", title: t.prob != null && t.user !== "add" ? `AI 예측 ${pct(t)}` : "직접 추가한 태그", onclick: () => { S.picked = new Set([t.ikey]); S.applied = [t.ikey]; S.q = ""; qEl.value = ""; drawGroups(); reload(); } }, "#" + t.label);
  const box = h("div", { class: "pick" });
  const o = so.owner;
  const comment = h("input", { class: "cin", maxlength: "500", placeholder: ME ? "댓글을 남겨 보세요" : "로그인하고 댓글을 남겨 보세요", "aria-label": "댓글 입력" });
  const send = () => { const v = comment.value.trim(); if (!ME) return needLogin(); if (v) act(d, "POST", `/api/images/${d.id}/comments`, { body: v }, edit); };
  comment.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); send(); } };
  const isOwner = !!(o && o.me);
  const postMenu = (e) => { e.stopPropagation(); menuCard(e.currentTarget, [
    { ic: "save", label: "북에 저장", fn: () => needLogin() && saveToBook([d.id], { after: () => refreshSocial(d, edit) }) },
    { ic: "keep", label: so.kept ? "킵 해제" : "킵에 담기", fn: () => act(d, so.kept ? "DELETE" : "POST", `/api/images/${d.id}/keep`, null, edit) },
    ...(so.editable ? [{ ic: "edit", label: "수정하기", fn: () => editPost(d) }, { ic: "trash", label: "삭제하기", danger: true, fn: () => removePost(d) }]
      : [{ ic: "flag", label: "이 게시물 신고하기", danger: true, fn: () => reportSheet("post", d.id) }])]); };
  /* 사용 소재: 3개까지, '더보기'로 모두 */
  const mats = d.materials || [];
  const matList = h("div", { class: "dp-links" });
  const drawMats = (all) => matList.replaceChildren(...mats.slice(0, all ? mats.length : 3).map((l) => h("a", { href: l, target: "_blank", rel: "noopener noreferrer nofollow" }, dpSvg("link", 15), h("span", {}, l))));
  drawMats(false);
  /* 댓글: 3개까지, '모두 보기'로 전체 */
  const clist = h("div", { class: "dp-clist" });
  const cRow = (c) => h("div", { class: "dp-c" }, avatarEl({ nick: c.nick, avatar: c.avatar }, 28, "dp-cav"),
    h("div", { class: "dp-ct" }, h("div", { class: "dp-cm" }, h("b", {}, c.nick), h("small", {}, ago(c.created))), h("p", {}, c.body)),
    h("button", { class: "icon-btn dp-cmore", type: "button", "aria-label": "댓글 더보기", onclick: (e) => { e.stopPropagation(); menuCard(e.currentTarget, c.mine
      ? [{ ic: "trash", label: "댓글 삭제", danger: true, fn: () => act(d, "DELETE", `/api/comments/${c.id}`, null, edit) }]
      : [{ ic: "flag", label: "댓글 신고하기", danger: true, fn: () => reportSheet("comment", c.id) }]); } }, icon("more", 20)));
  const drawComments = (all) => clist.replaceChildren(...so.comments.slice(0, all ? so.comments.length : 3).map(cRow));
  drawComments(false);
  const allBtn = so.comments.length > 3 ? h("button", { class: "dp-all", type: "button", onclick: (e) => { drawComments(true); e.currentTarget.remove(); } }, `댓글 ${so.comments.length}개 모두 보기`) : null;
  comment.placeholder = "댓글을 남겨보세요";
  const postBtn = h("button", { class: "dp-post", type: "button", onclick: send }, "게시");
  comment.addEventListener("input", () => postBtn.classList.toggle("on", !!comment.value.trim()));
  /* 연관 이미지: 2열, '더보기'를 누를 때마다 이어서 */
  const relCols = [h("div", { class: "dp-col" }), h("div", { class: "dp-col" })];
  const relMore = h("button", { class: "dp-more", type: "button", hidden: true }, "더보기");
  let relOff = 0, relBusy = false;
  const relCard = (it) => h("button", { class: "dp-card", type: "button", "aria-label": (it.title || "레퍼런스") + " · " + it.author, onclick: () => (S.open === it.id && !$("#panel").hidden && !isM() ? closeDetail() : openDetail(it.id)) },
    h("span", { class: "dp-im" }, h("img", { src: it.thumb, alt: "", loading: "lazy", width: it.w || null, height: it.h || null })),
    h("span", { class: "dp-ft" }, cardAv(it, "dp-av"), h("span", { class: "dp-nk" }, it.author), h("span", { class: "dp-lk" + (it.liked ? " on" : "") }, dpSvg("heart:f", 12), String(it.likes ?? 0))));
  const loadRel = async () => {
    if (relBusy) return; relBusy = true; relMore.disabled = true; relMore.hidden = true;
    const sks = [180, 240, 210, 150].map((hh, i) => { const c = skCard(hh); relCols[i % 2].append(c); return c; });   // 불러오는 동안 스켈레톤 카드
    try {
      const r = await api(`/api/images/${d.id}/related?limit=10&offset=${relOff}`); sks.forEach((c) => c.remove()); if (S.open !== d.id) return;
      r.items.forEach((it) => { const c = relCols[0].offsetHeight <= relCols[1].offsetHeight ? relCols[0] : relCols[1]; c.append(relCard(it)); });
      relOff += r.items.length; relMore.hidden = !r.more;
    } catch { relMore.hidden = true; } finally { sks.forEach((c) => c.remove()); relBusy = false; relMore.disabled = false; }
  };
  relMore.onclick = loadRel;
  const head = (t, extra) => h("div", { class: "dp-h" }, h("h3", {}, t), extra || null);
  panel.replaceChildren(
    h("div", { class: "dp-img" }, h("img", { src: d.full, alt: d.title || "레퍼런스 이미지", class: "zoomable", title: "눌러서 크게 보기", onclick: () => openLightbox(d.full, d.title), onload: (e) => dpTone(e.currentTarget) }),
      h("div", { class: "dp-top" },
        h("button", { class: "dp-ib back", type: "button", "aria-label": "이전에 본 이미지", title: "이전에 본 이미지", disabled: !S.hist.length, onclick: goBack }, dpSvg("back", 36)),
        h("span", { class: "sp" }),
        h("button", { class: "dp-ib", type: "button", "aria-label": "창 닫기", title: "닫기", onclick: closeDetail }, dpSvg("close", 36))),
      h("div", { class: "dp-fab" },
        h("button", { type: "button", class: "dp-fb", "aria-label": "이 이미지의 구도로 3D 포즈 찾기", title: "이 이미지의 구도를 3D 포즈로", onclick: () => pullPose() }, dpSvg("pose", 28)),
        d.ext ? null : h("button", { type: "button", class: "dp-fb", "aria-label": "이 이미지의 색상으로 팔레트 만들기", title: "이 이미지의 색상을 팔레트로", onclick: () => pullPalette(d.id) }, dpSvg("palette", 28)),   // 실사(Unsplash)는 색 추출 없음
        h("button", { type: "button", class: "dp-fb add" + (so.kept ? " on" : ""), "aria-pressed": String(!!so.kept), "aria-label": so.kept ? "킵 해제" : "킵에 담기", title: so.kept ? "킵 해제" : "킵에 담기", onclick: () => act(d, so.kept ? "DELETE" : "POST", `/api/images/${d.id}/keep`, null, edit) }, so.kept ? dpSvg("check", 28) : dpSvg("plus", 28)))),
    h("div", { class: "dp-info" },
      h("div", { class: "dp-head" },
        h("div", { class: "dp-user" }, o ? avatarEl(o, 36, "dp-av40") : h("span", { class: "dp-av40 avt" }, (d.author || "?").slice(0, 1)),
          d.ext && d.ext.src === "coco" ? h("div", { class: "dp-name" }, h("a", { href: "https://cocodataset.org/#termsofuse", target: "_blank", rel: "noopener" }, "COCO 2017"),
              h("span", {}, d.ext.lic || "Flickr", d.ext.flickr ? " · " : "", d.ext.flickr ? h("a", { href: d.ext.flickr.replace(/^http:/, "https:"), target: "_blank", rel: "noopener" }, "Flickr 원본") : null))
          : d.ext ? h("div", { class: "dp-name" }, h("a", { href: `https://unsplash.com/@${d.ext.user}?utm_source=reffy&utm_medium=referral`, target: "_blank", rel: "noopener" }, d.author),
              h("span", {}, "Photo on ", h("a", { href: `https://unsplash.com/photos/${d.ext.pid}?utm_source=reffy&utm_medium=referral`, target: "_blank", rel: "noopener" }, "Unsplash")))
            : h("div", { class: "dp-name" }, o ? h("a", { href: "#/u/" + o.uid }, o.nick || d.author) : h("b", {}, d.author), h("span", {}, o ? `@${o.uid}` : `조회 ${d.views.toLocaleString()}`)),
          o && !isOwner ? h("button", { class: "dp-follow" + (o.following ? " ing" : ""), type: "button", onclick: () => act(d, o.following ? "DELETE" : "POST", `/api/users/${o.uid}/follow`, null, edit) }, o.following ? "팔로잉" : "팔로우") : null),
        d.ext ? null : h("h2", { class: "dp-title" }, d.title || "제목 없음", d.private ? h("span", { class: "prv-b" }, "비공개") : null)),   // 실사(Unsplash)는 제목 없이
      h("div", { class: "dp-acts" },
        h("div", { class: "dp-react" },
          h("button", { class: "dp-st" + (so.liked ? " on" : ""), type: "button", "aria-pressed": String(!!so.liked), "aria-label": "하트", "data-like": "1", onclick: () => act(d, so.liked ? "DELETE" : "POST", `/api/images/${d.id}/like`, null, edit) }, dpSvg(so.liked ? "heart:f" : "heart", 20), String(so.likes)),
          h("button", { class: "dp-st", type: "button", "aria-label": "댓글", onclick: () => comment.focus() }, dpSvg("comment", 20), String(so.comments.length))),
        h("span", { class: "sp" }),
        h("button", { class: "dp-ab", type: "button", "aria-label": "공유하기", title: "공유하기", onclick: () => sharePost(d) }, dpSvg("share", 24)),
        h("button", { class: "dp-ab", type: "button", "aria-label": "더보기", "aria-haspopup": "menu", onclick: postMenu }, dpSvg("more", 24))),
      h("div", { class: "dp-body" },
      (d.tools || []).length ? h("div", { class: "dp-sec" }, head("사용한 툴"), h("div", { class: "dp-tools" }, d.tools.map((t) => h("span", { class: "dp-tool" }, t)))) : null,
      h("div", { class: "dp-sec" },
        head("태그"),   // 태그 고치기는 더보기(⋮) → 수정하기에서
        edit ? kindTag(d, true, () => drawDetail(d, true)) : null,
        h("div", { class: "tags" }, edit ? null : kindTag(d, false), act_.length ? act_.map(tagEl) : (edit ? h("span", { class: "hint" }, "아직 태그가 없어요.") : null)),
        edit ? h("div", { class: "tags", style: "margin-top:10px" }, pickButton(box, (t) => save(d, { add: [t.ikey] }, t), () => new Set(d.tags.filter((x) => x.active).map((x) => x.ikey))),
          off.map((t) => h("button", { class: "tag off", type: "button", title: "눌러서 되돌리기", onclick: () => save(d, { restore: [t.ikey] }, t) }, "#" + t.label))) : null),
      mats.length ? h("div", { class: "dp-sec" }, head("사용 소재", mats.length > 3 ? h("button", { class: "dp-link", type: "button", onclick: (e) => { drawMats(true); e.currentTarget.remove(); } }, "더보기") : null), matList) : null,
      h("div", { class: "dp-sec dp-cmt" },
        h("div", { class: "dp-cw" }, head(`댓글 ${so.comments.length}`),
          h("div", { class: "dp-cin" }, ME ? avatarEl(ME, 24, "dp-cav") : h("span", { class: "dp-cav avt" }), comment, postBtn)),
        so.comments.length ? clist : null, allBtn),
      h("div", { class: "dp-sec dp-rel" }, head("연관 이미지"), h("div", { class: "dp-grid" }, relCols))),
      relMore));
  loadRel();
}
/* 종류(사진 · 일러스트) 태그: 누르면 그 종류만 보기 · 태그 수정 중이면 바꾸기 */
function kindTag(d, edit, redraw) {
  const k = d.kind === "photo" ? "photo" : "illust", label = (KINDS.find((x) => x[0] === k) || [k, k])[1];
  if (edit) return h("div", { class: "seg kind-seg", role: "radiogroup", "aria-label": "종류" }, KINDS.map(([v, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(k === v), class: k === v ? "on" : "",
    onclick: async () => { if (v === k) return; try { await api(`/api/images/${d.id}/kind`, jsonOpt("PUT", { kind: v })); d.kind = v; toast(`종류를 ‘${l}’로 바꿨어요`); redraw(); } catch (e) { toast(e.message); } } }, l)));
  return h("button", { class: "tag kind", type: "button", title: `${label}만 보기`, onclick: () => {
    S.pickedKind = new Set([k]); S.kinds = [k]; S.picked = new Set(); S.applied = []; S.q = ""; qEl.value = ""; drawGroups(); if (isM() && !$("#panel").hidden) closeDetail(); reload(); } }, "#" + label);
}
/* 이미지 크게 보기: 상세 이미지를 누르면 화면 가운데에 크게 · +/− 버튼, 휠, 더블클릭(두 번 탭)으로 확대 · 확대하면 끌어서 이동 · Esc/×/바깥 누르면 닫힘 */
/* Figma Common · Icon (Outlined, 24 기준 경로) — 떠 있는 원형 버튼(80 · 흰색 40% + 배경 흐림 10, 아이콘 56)에 씀 */
const FIG_IC = {
  close: "M16.9697 5.96973C17.2626 5.67683 17.7374 5.67683 18.0303 5.96973C18.3232 6.26262 18.3232 6.73738 18.0303 7.03027L13.0605 12L18.0303 16.9697C18.3232 17.2626 18.3232 17.7374 18.0303 18.0303C17.7374 18.3232 17.2626 18.3232 16.9697 18.0303L12 13.0605L7.03027 18.0303C6.73738 18.3232 6.26262 18.3232 5.96973 18.0303C5.67683 17.7374 5.67683 17.2626 5.96973 16.9697L10.9395 12L5.96973 7.03027C5.67683 6.73738 5.67683 6.26262 5.96973 5.96973C6.26262 5.67683 6.73738 5.67683 7.03027 5.96973L12 10.9395L16.9697 5.96973Z",
  plus: "M11.25 19V12.75H5C4.58579 12.75 4.25 12.4142 4.25 12C4.25 11.5858 4.58579 11.25 5 11.25H11.25V5C11.25 4.58579 11.5858 4.25 12 4.25C12.4142 4.25 12.75 4.58579 12.75 5V11.25H19C19.4142 11.25 19.75 11.5858 19.75 12C19.75 12.4142 19.4142 12.75 19 12.75H12.75V19C12.75 19.4142 12.4142 19.75 12 19.75C11.5858 19.75 11.25 19.4142 11.25 19Z",
  minus: "M19 11.25C19.4142 11.25 19.75 11.5858 19.75 12C19.75 12.4142 19.4142 12.75 19 12.75H5C4.58579 12.75 4.25 12.4142 4.25 12C4.25 11.5858 4.58579 11.25 5 11.25H19Z",
  chevL: "M13.9697 5.4697C14.2626 5.1768 14.7374 5.1768 15.0303 5.4697C15.3232 5.7626 15.3232 6.2374 15.0303 6.5303L9.5606 12L15.0303 17.4697C15.3232 17.7626 15.3232 18.2374 15.0303 18.5303C14.7374 18.8232 14.2626 18.8232 13.9697 18.5303L7.9697 12.5303C7.6768 12.2374 7.6768 11.7626 7.9697 11.4697L13.9697 5.4697Z",
  chevR: "M8.9697 5.4697C9.2626 5.1768 9.7373 5.1768 10.0302 5.4697L16.0302 11.4697C16.3231 11.7626 16.3231 12.2374 16.0302 12.5303L10.0302 18.5303C9.7373 18.8232 9.2626 18.8232 8.9697 18.5303C8.6768 18.2374 8.6768 17.7626 8.9697 17.4697L14.4394 12L8.9697 6.5303C8.6768 6.2374 8.6768 5.7626 8.9697 5.4697Z",
};
/* 떠 있는 원형 버튼 아이콘 (Figma 2789:154726 · 154729 · 154732 그대로 — 80 버튼 기준 경로) */
const FLOAT_IC = {
  close: "M51.5952 25.9296C52.2787 25.2461 53.3864 25.2461 54.0699 25.9296C54.7533 26.613 54.7533 27.7207 54.0699 28.4042L42.4738 40.0002L54.0699 51.5962C54.7533 52.2796 54.7533 53.3874 54.0699 54.0708C53.3864 54.7543 52.2787 54.7543 51.5952 54.0708L39.9992 42.4748L28.4032 54.0708C27.7198 54.7543 26.612 54.7543 25.9286 54.0708C25.2452 53.3874 25.2452 52.2796 25.9286 51.5962L37.5246 40.0002L25.9286 28.4042C25.2452 27.7207 25.2452 26.613 25.9286 25.9296C26.612 25.2461 27.7198 25.2461 28.4032 25.9296L39.9992 37.5256L51.5952 25.9296Z",
  plus: "M38.2493 56.3337V41.7503H23.666C22.6995 41.7503 21.916 40.9668 21.916 40.0003C21.916 39.0338 22.6995 38.2503 23.666 38.2503H38.2493V23.667C38.2493 22.7005 39.0329 21.917 39.9993 21.917C40.9658 21.917 41.7493 22.7005 41.7493 23.667V38.2503H56.3327C57.2992 38.2503 58.0827 39.0338 58.0827 40.0003C58.0827 40.9668 57.2992 41.7503 56.3327 41.7503H41.7493V56.3337C41.7493 57.3002 40.9658 58.0837 39.9993 58.0837C39.0329 58.0837 38.2493 57.3002 38.2493 56.3337Z",
  minus: "M56.3327 38.25C57.2992 38.25 58.0827 39.0335 58.0827 40C58.0827 40.9665 57.2992 41.75 56.3327 41.75L23.666 41.75C22.6995 41.75 21.916 40.9665 21.916 40C21.916 39.0335 22.6995 38.25 23.666 38.25L56.3327 38.25Z",
};
const figIc = (k, size = 24) => { const sp = h("span", { class: "fic" + (size >= 40 ? " f80" : "") }); sp.innerHTML = size >= 40 && FLOAT_IC[k]
  ? `<svg width="64" height="64" viewBox="0 0 80 80" fill="none" aria-hidden="true"><path d="${FLOAT_IC[k]}" fill="currentColor"/></svg>`
  : `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${FIG_IC[k]}" fill="currentColor"/></svg>`; return sp; };
function openLightbox(src, title, credit) {
  let z = 1, x = 0, y = 0, drag = null;
  const img = h("img", { src, alt: title || "레퍼런스 이미지", draggable: "false" });
  const stage = h("div", { class: "lb-stage" }, img);
  const apply = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${z})`; stage.classList.toggle("zoomed", z > 1); minus.disabled = z <= 1; plus.disabled = z >= 4; };
  const zoomTo = (nz) => { z = Math.max(1, Math.min(4, Math.round(nz * 100) / 100)); if (z === 1) { x = 0; y = 0; } apply(); };
  const plus = h("button", { class: "lb-z", type: "button", "aria-label": "확대", onclick: () => zoomTo(z + 0.5) }, isM() ? icon("plus", 28) : figIc("plus", 56));
  const minus = h("button", { class: "lb-z", type: "button", "aria-label": "축소", onclick: () => zoomTo(z - 0.5) }, isM() ? h("span", { class: "lb-minus" }) : figIc("minus", 56));
  const close = () => { m.remove(); document.removeEventListener("keydown", key); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } else if (e.key === "+" || e.key === "=") zoomTo(z + 0.5); else if (e.key === "-") zoomTo(z - 0.5); };
  const m = h("div", { class: "modal lightbox", role: "dialog", "aria-modal": "true", "aria-label": "이미지 크게 보기",
    onclick: (e) => { if (e.target === m || e.target === stage) close(); } },
    h("button", { class: "lb-close", type: "button", "aria-label": "닫기", onclick: close }, isM() ? icon("close", 28) : figIc("close", 56)),
    stage, h("div", { class: "lb-zoom" }, plus, minus),
    credit ? h("p", { class: "lb-credit" }, "Photo by ", h("a", { href: `https://unsplash.com/@${credit.user}?utm_source=reffy&utm_medium=referral`, target: "_blank", rel: "noopener" }, credit.name), " on ", h("a", { href: `https://unsplash.com/photos/${credit.pid}?utm_source=reffy&utm_medium=referral`, target: "_blank", rel: "noopener" }, "Unsplash")) : null);
  img.addEventListener("dblclick", (e) => { e.stopPropagation(); zoomTo(z > 1 ? 1 : 2); });
  stage.addEventListener("wheel", (e) => { e.preventDefault(); zoomTo(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
  img.addEventListener("pointerdown", (e) => { if (z <= 1) return; drag = { sx: e.clientX - x, sy: e.clientY - y, moved: false }; img.setPointerCapture(e.pointerId); });
  img.addEventListener("pointermove", (e) => { if (!drag) return; x = e.clientX - drag.sx; y = e.clientY - drag.sy; drag.moved = true; apply(); });
  img.addEventListener("pointerup", () => { drag = null; });
  img.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("keydown", key);
  document.body.append(m); apply();
}
async function removePost(d) {
  if (!(await confirmDialog("게시물을 삭제할까요?", "삭제한 게시물은 다시 복구할 수 없어요.", { ok: "삭제", cancel: "취소", danger: true }))) return;
  try { await api("/api/images/" + d.id, { method: "DELETE" }); closeDetail(); toast("게시물을 삭제했어요"); reload(); loadVocab().catch(() => {}); } catch (e) { toast(e.message); }
}
async function save(d, body, tag, keepPicker) {
  // 단일 축에 이미 활성 태그가 있으면 새로 추가하는 태그와 바꿔 줍니다
  const full = { add: [], remove: [], restore: [], ...body };
  if (full.add.length && S.vocab) {
    const ax = S.labels[full.add[0]]?.axis; const one = S.vocab.groups.flatMap((g) => g.axes).find((a) => a.name === ax && a.mode === "단일");
    if (one) d.tags.filter((t) => t.active && S.labels[t.ikey]?.axis === ax).forEach((t) => full.remove.push(t.ikey));
  }
  try {
    const r = await api(`/api/images/${d.id}/tags`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(full) });
    d.tags = r.tags; drawDetail(d, true);
    loadVocab().catch(() => {});
  } catch (e) { toast(e.message); }
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if ($(".modal:not(.closing)")) $(".modal:not(.closing)").remove(); else if (!$("#panel").hidden) closeDetail(); } });

/* ---------------------------------------------------------------- 업로드: 분석 -> 태그 확인 -> 게시 */
let up = null;
function closeUpload() { $(".modal:not(.closing)")?.remove(); up = null; }
function openUpload() { return isM() ? openUploadM() : openUploadPC(); }
function openUploadM() {
  if (!needLogin()) return;
  const dr = store.get("reffy.draft", null);
  up = { token: null, tags: new Map(), file: null, kind: dr?.kind || "illust", title: dr?.title || "", materials: dr?.materials || [], tools: dr?.tools || [], private: !!dr?.private };
  const input = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/gif", hidden: true, onchange: (e) => e.target.files[0] && analyze(e.target.files[0]) });
  const drop = h("div", { class: "drop", tabindex: "0", role: "button", "aria-label": "이미지 선택", onclick: () => input.click(), onkeydown: (e) => (e.key === "Enter" || e.key === " ") && input.click(),
    ondragover: (e) => { e.preventDefault(); drop.classList.add("over"); }, ondragleave: () => drop.classList.remove("over"), ondrop: (e) => { e.preventDefault(); drop.classList.remove("over"); e.dataTransfer.files[0] && analyze(e.dataTransfer.files[0]); } },
    isM() ? icon("upload", 28) : null, h("b", {}, isM() ? "갤러리 · 클라우드에서 이미지 선택" : "이미지를 끌어다 놓거나 눌러서 선택하세요"), h("p", {}, isM() ? "JPG · PNG · WEBP · GIF, 최대 15MB" : "JPG · PNG · WEBP · GIF, 15MB 이하. 올리면 AI가 태그를 붙여 줘요."), input);
  const m = h("div", { class: "modal upl" },
    h("div", { class: "dlg", role: "dialog", "aria-modal": "true", "aria-label": "새 게시물" }, h("header", {}, h("h2", {}, isM() ? "게시물 등록" : "새 게시물"), h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: closeUpload }, icon("close"))), h("div", { id: "upBody" }, drop)));
  document.body.append(m);
}
async function analyze(file) {
  const body = $("#upBody"); const url = URL.createObjectURL(file);
  body.replaceChildren(h("div", { class: "up" }, h("div", { class: "pv" }, h("img", { src: url, alt: "올린 이미지" })), h("div", {}, h("p", {}, h("span", { class: "busy" }), "AI가 태그를 붙이는 중이에요…"))));
  const fd = new FormData(); fd.append("file", file);
  try {
    const r = await api("/api/analyze", { method: "POST", body: fd });
    up.token = r.token; up.tags = new Map(r.tags.map((t) => [t.ikey, t])); up.url = url; up.msg = r.message; up.sec = r.seconds;
    drawUpload();
  } catch (e) { body.replaceChildren(h("div", { class: "up", style: "grid-template-columns:1fr" }, h("div", {}, h("div", { class: "note warn" }, e.message), h("button", { class: "btn", onclick: () => { closeUpload(); openUpload(); } }, "다른 이미지 고르기")))); }
}
function pickButton(box, onPick, exclude) {
  box.append(h("button", { class: "btn sm", type: "button", onclick: () => {
    const open = box.querySelector(".box"); if (open) { open.remove(); return; }
    box.append(picker(onPick, exclude));
  } }, "+ 태그 추가"));
  return box;
}
function singleAxis(ax) { return S.vocab.groups.flatMap((g) => g.axes).find((a) => a.name === ax && a.mode === "단일"); }
function drawUpload() {
  const body = $("#upBody"); const tags = [...up.tags.values()];
  const byAxis = new Map(); tags.forEach((t) => { const k = (S.labels[t.ikey]?.axis) || t.group; if (!byAxis.has(k)) byAxis.set(k, []); byAxis.get(k).push(t); });
  const title = h("input", { id: "upTitle", maxlength: "120", placeholder: "예) 앉아서 뒤돌아보는 포즈", value: up.title || "", oninput: (e) => (up.title = e.target.value) });
  const tagBtn = (t) => h("button", { type: "button", class: "tag " + (t.manual ? "user" : "ai"), title: "눌러서 삭제", "aria-label": `${t.label} 태그 삭제`, onclick: () => { up.tags.delete(t.ikey); drawUpload(); } },
    "#" + t.label, t.prob != null && !t.manual ? h("span", { class: "pr" }, Math.round(t.prob * 100) + "%") : null, h("x", {}, "×"));
  const onPick = (t) => {
    if (singleAxis(t.axis)) [...up.tags.values()].filter((x) => S.labels[x.ikey]?.axis === t.axis).forEach((x) => up.tags.delete(x.ikey));
    up.tags.set(t.ikey, { ikey: t.ikey, label: t.label, manual: true, group: "" }); drawUpload();
  };
  up.materials = up.materials || []; up.tools = up.tools || []; up.private = !!up.private;
  const right = h("div", {},
    up.msg ? h("div", { class: "note warn" }, up.msg) : h("div", { class: "note" }, `AI가 ${tags.length}개의 태그를 붙였어요 (${up.sec}초). 틀린 태그는 지우고, 빠진 태그는 추가하세요.`),
    h("div", { class: "field" }, h("label", { for: "upTitle" }, "제목"), title),
    h("div", { class: "field" }, h("label", {}, "종류"), h("div", { class: "seg", role: "radiogroup" }, [["illust", "일러스트"], ["photo", "사진"]].map(([k, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(up.kind === k), class: up.kind === k ? "on" : "", onclick: () => { up.kind = k; drawUpload(); } }, l)))),
    h("div", { class: "field" }, h("label", {}, "태그"),
      tags.length ? [...byAxis].map(([ax, ts]) => h("div", { class: "axisgrp" }, h("h4", {}, ax), h("div", { class: "tags" }, ts.map(tagBtn)))) : h("p", { class: "hint" }, "붙은 태그가 없어요. 아래에서 직접 추가하세요."),
      pickButton(h("div", { class: "pick" }), onPick, () => new Set(up.tags.keys()))),
    materialsField(up.materials, drawUpload),
    toolsField(up.tools, drawUpload),
    privacyField(up.private, (v) => { up.private = v; }));
  body.replaceChildren(h("div", { class: "up" }, h("div", { class: "pv" }, h("img", { src: up.url, alt: "올린 이미지" })), right),
    h("div", { class: "foot" }, isM() ? h("button", { class: "btn", type: "button", onclick: saveDraft }, "임시 저장") : h("button", { class: "btn", type: "button", onclick: closeUpload }, "취소"), h("button", { class: "btn primary", id: "pub", type: "button", onclick: publish }, isM() ? "등록" : "게시하기")));
}
/* 사용 소재 링크 (MYP_0200): 입력 + 저장, 최대 10개 */
function materialsField(list, redraw) {
  const inp = h("input", { class: "inp", type: "url", placeholder: "링크를 입력해주세요", "aria-label": "사용 소재 링크", maxlength: "300" });
  const add = () => { const v = inp.value.trim(); if (!v) return; if (list.length >= 10) return toast("사용 소재는 10개까지 넣을 수 있어요."); if (!list.includes(v)) list.push(v); redraw(); };
  inp.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); add(); } };
  return h("div", { class: "field mat" }, h("label", {}, "사용 소재"), h("div", { class: "row" }, inp, h("button", { class: "btn l", type: "button", onclick: add }, "저장")),
    list.length ? h("ul", { class: "mat-list" }, list.map((l, i) => h("li", {}, icon("link", 16), h("span", {}, l), h("button", { class: "icon-btn", type: "button", "aria-label": "링크 삭제", onclick: () => { list.splice(i, 1); redraw(); } }, icon("close", 16))))) : null);
}
/* 사용 툴 (Figma 2601:52939): 업로드 · 수정 때 여러 개 고름 → 상세 패널 '사용한 툴'에 보임 */
const TOOLS = ["Clip studio", "이비스 페인트 X", "Procreate", "사이툴", "Illustrator", "Photoshop", "MediBang", "기타"];
function toolsField(list, redraw, cls = "field") {
  return h("div", { class: cls + " tools-f" }, h("label", {}, "사용 툴"),
    h("div", { class: "tool-chips", role: "group", "aria-label": "사용 툴" }, TOOLS.map((t) => h("button", { type: "button", class: "tool-chip" + (list.includes(t) ? " on" : ""), "aria-pressed": String(list.includes(t)),
      // 창 전체를 다시 그리지 않고 누른 칩만 바꿈 (다시 그리면 스크롤이 맨 위로 가고 깜빡임)
      onclick: (e) => { const i = list.indexOf(t); if (i >= 0) list.splice(i, 1); else list.push(t); const on = list.includes(t); e.currentTarget.classList.toggle("on", on); e.currentTarget.setAttribute("aria-pressed", String(on)); } }, t))));
}
/* 공개 설정 토글 */
function privacyField(priv, onChange) {
  return h("label", { class: "swrow up-sw" }, h("span", {}, h("b", {}, "공개 설정"), h("small", {}, "끄면 나만 볼 수 있어요")),
    h("input", { type: "checkbox", class: "sw-in", role: "switch", checked: !priv, onchange: (e) => onChange(!e.target.checked) }), h("i", { class: "sw-ui" }));
}
/* 임시 저장: 이 브라우저에만 제목 · 사용 소재 · 공개 설정을 보관합니다 (이미지는 다시 골라야 해요) */
function saveDraft() {
  store.set("reffy.draft", { title: up.title || "", materials: up.materials || [], tools: up.tools || [], private: !!up.private, kind: up.kind });
  toast("임시 저장했어요. 다음에 이미지를 고르면 이어서 쓸 수 있어요");
}
async function publish() {
  const b = $("#pub"); b.disabled = true; b.textContent = "게시하는 중…";
  try {
    const r = await api("/api/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: up.token, title: up.title || "", kind: up.kind || "illust", tags: [...up.tags.keys()], materials: up.materials || [], tools: up.tools || [], private: !!up.private }) });
    if ((up.kind || "illust") === "photo") poseFill(1, [r.id]);   // 사진이면 3D 포즈 검색용 관절을 뽑아 둠
    store.set("reffy.draft", null); closeUpload(); toast(isM() ? "게시물을 등록했어요" : "게시했어요"); if (location.hash !== "#/") location.hash = "#/"; await reload(); loadVocab().catch(() => {}); openDetail(r.id);
  } catch (e) { b.disabled = false; b.textContent = isM() ? "등록" : "게시하기"; toast(e.message); }
}
if ($("#uploadBtn")) $("#uploadBtn").onclick = openUpload;


/* 검색창 지우기(×): 글자가 있을 때만 보임 */
{ const qc = $("#qClear"); const sync = () => (qc.hidden = !qEl.value);
  qEl.addEventListener("input", sync); sync();
  qc.onclick = () => { qEl.value = ""; sync(); qEl.focus(); };
  const _rq = runQuery; runQuery = function (q) { _rq(q); sync(); }; }

/* ================================================================ PC 업로드 모달 (Web 2차 HOM_0505 · 2249:49696 ~ 2249:50560)
   1단계: 이미지 선택(최대 10장) → 다음 / 2단계: 미리보기 + 썸네일 · 제목 · 사용 소재(최대 5) · 공개 설정 → 임시 저장 / 등록
   닫기·취소 시 작성 중이면 '작성을 그만둘까요?' 확인. 등록하면 그 자리에서 '게시물을 등록했어요' 토스트.
   여러 장을 고르면 같은 제목·사용 소재·공개 설정으로 장마다 게시물이 하나씩 올라가요. */
const UP_MAX = 10, MAT_MAX = 5, UP_TYPES = "image/jpeg,image/png,image/webp,image/gif";
let pu = null;
function puDirty() { return pu && (pu.items.length || (pu.title || "").trim() || pu.materials.length || (pu.tools || []).length); }
async function puClose(force) {
  if (!force && puDirty() && !(await confirmDialog("작성을 중단할까요?", "작성 중인 내용은 저장되지 않아요.", { fig: true, no: "계속 작성", yes: "그만두기", danger: true }))) return;
  pu?.items.forEach((it) => URL.revokeObjectURL(it.url)); pu = null; $(".modal.upl-pc")?.remove(); document.removeEventListener("keydown", puKey);
}
function puKey(e) { if (e.key === "Escape" && !$(".modal.center")) puClose(); }
function puAdd(files) {
  const ok = [...files].filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type));
  if (ok.length < files.length) toast("JPG · PNG · WEBP 이미지만 올릴 수 있어요.");
  const room = UP_MAX - pu.items.length;
  if (ok.length > room) toast(`이미지는 최대 ${UP_MAX}장까지 올릴 수 있어요.`);
  ok.slice(0, Math.max(0, room)).forEach((f) => {
    if (f.size > 20 * 1024 * 1024) { toast(`${f.name}: 20MB 이하만 올릴 수 있어요.`); return; }
    const it = { file: f, url: URL.createObjectURL(f), token: null, tags: new Map(), busy: true, err: "" };
    pu.items.push(it);
    puQueue = puQueue.then(() => puAnalyze(it));   // 한 장씩 차례로 분석 (동시에 보내면 서버 메모리가 부족해짐)
  });
}
let puQueue = Promise.resolve();
async function puAnalyze(it) {
  for (let n = 0; n < 3; n++) {   // 서버가 잠깐 다시 켜지는 중이면 잠시 뒤 다시 시도
    if (!pu || !pu.items.includes(it)) return;
    try {
      const fd = new FormData(); fd.append("file", it.file);
      const r = await api("/api/analyze", { method: "POST", body: fd });
      it.token = r.token; it.tags = new Map(r.tags.map((t) => [t.ikey, t])); it.msg = r.message; it.err = "";
      break;
    } catch (e) { it.err = e.message; if (/MB|읽을 수 없|파일만|해상도/.test(e.message)) break; await new Promise((ok) => setTimeout(ok, 5000 * (n + 1))); }
  }
  it.busy = false; if (pu && pu.step === 2) puDraw();
}
function openUploadPC() {
  if (!needLogin()) return;
  const dr = store.get("reffy.draft", null);
  pu = { step: 1, items: [], sel: 0, title: dr?.title || "", materials: (dr?.materials || []).slice(0, MAT_MAX), tools: dr?.tools || [], private: !!dr?.private, kind: dr?.kind || "illust" };
  document.body.append(h("div", { class: "modal upl-pc", onmousedown: (e) => e.target === e.currentTarget && puClose() }, h("div", { class: "dlg upd", role: "dialog", "aria-modal": "true", "aria-label": "새 게시물 업로드" })));
  document.addEventListener("keydown", puKey);
  puDraw();
}
function puHeader() {
  return h("header", { class: "upd-h" }, h("h2", {}, "새 게시물 업로드"), figClose(() => puClose()));
}
function puDraw() {
  const dlg = $(".modal.upl-pc .dlg"); if (!dlg || !pu) return;
  const pick = (multiple = true) => { const i = h("input", { type: "file", accept: UP_TYPES, multiple, hidden: true, onchange: (e) => { puAdd(e.target.files); puDraw(); } }); document.body.append(i); i.click(); setTimeout(() => i.remove(), 60000); };
  if (pu.step === 1) {
    const n = pu.items.length;
    const drop = h("div", { class: "upd-drop" + (n ? " has" : ""), tabindex: "0", role: "button", "aria-label": "이미지 선택", onclick: () => pick(),
      onkeydown: (e) => (e.key === "Enter" || e.key === " ") && pick(),
      ondragover: (e) => { e.preventDefault(); drop.classList.add("over"); }, ondragleave: () => drop.classList.remove("over"),
      ondrop: (e) => { e.preventDefault(); drop.classList.remove("over"); puAdd(e.dataTransfer.files); puDraw(); } },
      icon("upload", 32),
      h("div", { class: "upd-dt" }, h("b", {}, n ? `이미지 ${n}장을 골랐어요` : "이미지를 끌어다 놓거나 파일을 선택하세요"), h("p", {}, "JPG · PNG · WEBP, 최대 20MB · 최대 10장")),
      h("button", { class: "btn upd-file", type: "button", onclick: (e) => { e.stopPropagation(); pick(); } }, "파일 선택"));
    dlg.className = "dlg upd s1";
    dlg.replaceChildren(puHeader(), drop,
      h("div", { class: "upd-f" }, h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => puClose() }, "취소"),
        h("button", { class: "btn primary", type: "button", disabled: !n, onclick: () => { pu.step = 2; puDraw(); } }, "다음")));
    return;
  }
  dlg.className = "dlg upd s2";
  const cur = pu.items[pu.sel] || pu.items[0];
  const thumbs = h("div", { class: "upd-thumbs" },
    pu.items.map((it, i) => h("button", { type: "button", class: "upd-th" + (i === pu.sel ? " on" : ""), "aria-label": `${i + 1}번째 이미지`, onclick: () => { pu.sel = i; puDraw(); } },
      h("img", { src: it.url, alt: "" }), pu.items.length > 1 ? h("span", { class: "upd-thx", role: "button", "aria-label": "이 이미지 빼기", onclick: (e) => { e.stopPropagation(); URL.revokeObjectURL(it.url); pu.items.splice(i, 1); pu.sel = Math.min(pu.sel, pu.items.length - 1); puDraw(); } }, icon("close", 14)) : null)),
    pu.items.length < UP_MAX ? h("button", { type: "button", class: "upd-add", "aria-label": "이미지 추가", onclick: () => pick() }, icon("plus", 24)) : null);
  const left = h("div", { class: "upd-img" }, h("div", { class: "upd-pv" }, cur ? h("img", { src: cur.url, alt: "미리보기" }) : null, thumbs));   // 썸네일 줄은 미리보기 아래쪽 위에 겹쳐서 (Figma: 이미지 480×566)
  /* 오른쪽 폼 */
  const title = h("input", { class: "inp", id: "pTitle", maxlength: "120", placeholder: "게시물 제목을 입력하세요", value: pu.title, oninput: (e) => (pu.title = e.target.value) });
  const matIn = h("input", { class: "inp", type: "url", placeholder: "링크를 입력해주세요", "aria-label": "사용 소재 링크", maxlength: "300" });
  const addMat = () => { const v = matIn.value.trim(); if (!v) return; if (pu.materials.length >= MAT_MAX) return toast(`사용 소재는 ${MAT_MAX}개까지 넣을 수 있어요.`); if (!pu.materials.includes(v)) pu.materials.push(v); puDraw(); setTimeout(() => $("#pMat")?.focus(), 0); };
  matIn.id = "pMat"; matIn.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addMat(); } };
  /* Figma 업로드(2789:150988): 제목 · 종류 · 사용 툴 · 사용 소재 · 비공개 설정 (AI 태그는 그 아래) */
  const mats = h("div", { class: "upd-sec upd-mat" },
    h("label", { for: "pMat" }, "사용 소재"),
    h("div", { class: "upd-mrow" }, matIn, h("button", { class: "btn upd-madd", type: "button", onclick: addMat }, "추가")),
    pu.materials.map((l, i) => h("div", { class: "upd-link" }, dpSvg("link", 20), h("span", {}, l), h("button", { class: "icon-btn", type: "button", "aria-label": "링크 삭제", onclick: () => { pu.materials.splice(i, 1); puDraw(); } }, icon("close", 20)))));
  const vis = h("label", { class: "upd-vis" }, h("span", {}, h("b", {}, "비공개 설정"), h("small", {}, "키면 나만 볼 수 있어요")),
    h("input", { type: "checkbox", class: "sw-in", role: "switch", checked: !!pu.private, onchange: (e) => (pu.private = e.target.checked) }), h("i", { class: "sw-ui" }));
  const kind = h("div", { class: "upd-sec" }, h("label", {}, "종류"), h("div", { class: "tool-chips", role: "radiogroup", "aria-label": "종류" },
    [["illust", "일러스트"], ["photo", "사진"]].map(([k, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(pu.kind === k), class: "tool-chip" + (pu.kind === k ? " on" : ""), onclick: () => { pu.kind = k; puDraw(); } }, l))));
  let tagSec = null;
  if (cur) {
    const tags = [...cur.tags.values()];
    const onPick = (t) => { if (singleAxis(t.axis)) [...cur.tags.values()].filter((x) => S.labels[x.ikey]?.axis === t.axis).forEach((x) => cur.tags.delete(x.ikey)); cur.tags.set(t.ikey, { ikey: t.ikey, label: t.label, manual: true, group: "" }); puDraw(); };
    tagSec = h("div", { class: "upd-sec" }, h("label", {}, pu.items.length > 1 ? `태그 (${pu.sel + 1}번째 이미지)` : "태그"),
      cur.busy ? h("p", { class: "hint" }, h("span", { class: "busy" }), "AI가 태그를 붙이는 중이에요…")
        : cur.err ? h("p", { class: "note warn" }, cur.err)
        : h("div", {}, cur.msg ? h("p", { class: "hint" }, cur.msg) : null,
          tags.length ? h("div", { class: "tags" }, tags.map((t) => h("button", { type: "button", class: "tag " + (t.manual ? "user" : "ai"), title: "눌러서 삭제", "aria-label": `${t.label} 태그 삭제`, onclick: () => { cur.tags.delete(t.ikey); puDraw(); } }, "#" + t.label, h("x", {}, "×")))) : h("p", { class: "hint" }, "붙은 태그가 없어요."),
          pickButton(h("div", { class: "pick" }), onPick, () => new Set(cur.tags.keys()))));
  }
  const busy = pu.items.some((it) => it.busy);
  dlg.replaceChildren(puHeader(),
    h("div", { class: "upd-c" }, left, h("div", { class: "upd-form" }, h("div", { class: "upd-sec" }, h("label", { for: "pTitle" }, "제목"), title), kind, toolsField(pu.tools, puDraw, "upd-sec"), mats, vis, tagSec)),
    h("div", { class: "upd-f" }, h("span", { class: "sp" }),
      h("button", { class: "btn", type: "button", onclick: () => { store.set("reffy.draft", { title: pu.title || "", materials: pu.materials, tools: pu.tools, private: pu.private, kind: pu.kind }); toast("임시 저장했어요"); } }, "임시 저장"),
      h("button", { class: "btn primary", id: "pPub", type: "button", disabled: busy || !pu.items.some((it) => it.token), onclick: puPublish }, busy ? "분석 중…" : "등록")));
}
async function puPublish() {
  const b = $("#pPub"); b.disabled = true; b.textContent = "등록 중…";
  const ready = pu.items.filter((it) => it.token);
  try {
    const made = [];
    for (const it of ready) {
      const r = await api("/api/images", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: it.token, title: pu.title || "", kind: pu.kind, tags: [...it.tags.keys()], materials: pu.materials, tools: pu.tools || [], private: !!pu.private }) });
      if (r && r.id) made.push(r.id);
    }
    if (pu.kind === "photo" && made.length) poseFill(made.length, made);   // 사진이면 3D 포즈 검색용 관절을 뽑아 둠
    store.set("reffy.draft", null); await puClose(true); toast("게시물을 등록했어요");
    loadVocab().catch(() => {});
    if (location.hash.startsWith("#/me") || location.hash.startsWith("#/u/")) route(); else reload();
  } catch (e) { b.disabled = false; b.textContent = "등록"; toast(e.message); }
}

/* ---------------------------------------------------------------- 작은 반응 (마이크로 인터랙션)
   하트를 누르면 톡 튀고, 누른 자리에 잔물결이 퍼짐. '동작 줄이기' 설정이면 CSS에서 모두 꺼짐 */
document.addEventListener("click", (e) => {
  const lk = e.target.closest("[data-like]");
  if (lk) {
    const box = lk.closest(".panel, .modal, #page, body"), wasOn = lk.classList.contains("on");
    if (!wasOn) { let k = 0; const t = setInterval(() => { const n = box.querySelector("[data-like].on"); if (n || ++k > 25) { clearInterval(t); if (n) { n.classList.remove("pop"); void n.offsetWidth; n.classList.add("pop"); } } }, 50); }
  }
  const b = e.target.closest(".btn, .st-btn, .st-sbtn, .acct-it, .sortbtn");
  if (b && !b.disabled && e.clientX) {
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
    const w = document.createElement("span"); w.className = "rf-wave";
    w.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    if (getComputedStyle(b).position === "static") b.style.position = "relative";
    b.style.overflow = "hidden"; b.append(w); setTimeout(() => w.remove(), 520);
  }
}, true);
