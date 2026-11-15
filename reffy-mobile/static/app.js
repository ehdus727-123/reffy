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
  S.vocab.groups.forEach((g) => g.axes.forEach((a) => a.tags.forEach((t) => (S.labels[t.ikey] = { label: t.kw, axis: a.name, group: g.name }))));
  drawGroups();
}
const openState = store.get("reffy.open", {});
const KINDS = [["photo", "사진"], ["illust", "일러스트"]];
/* PC: 필터 패널에서 태그를 고르면 바로 적용 → 상단에 칩으로 나타남 (모바일은 시트의 '적용하기'로) */
function liveApply() { /* 체크만으로는 적용하지 않음 — ‘필터 적용하기’를 눌러야 결과에 반영 */ }
function drawGroups() {
  const root = $("#groups"); root.replaceChildren();
  S.pickedKind = S.pickedKind || new Set();
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
$("#apply").onclick = () => {
  if (curTab === "pose") { toast("3D 포즈 검색은 준비 중이에요"); return; }
  if (CP.dirty && !$("#cpanel").hidden) { const c = hsv2hex(CP.h, CP.s, CP.v); if (!S.pickColors.includes(c)) S.pickColors = [...S.pickColors, c].slice(-5); CP.dirty = false; }   // 저장하지 않아도 지금 고른 색으로 적용
  S.applied = [...S.picked]; S.kinds = [...(S.pickedKind || [])]; S.colors = [...S.pickColors]; if (!$("#cpanel").hidden) drawColorPanel(); reload();
  if (isM()) setFilterOpen(false);
};
$("#reset").onclick = () => { S.picked.clear(); S.applied = []; S.pickedKind = new Set(); S.kinds = []; S.colors = []; S.pickColors = []; drawColorPanel(); S.q = ""; $("#q").value = ""; drawGroups(); reload(); };
const isTablet = () => !isM() && LAYOUT !== "pc" && innerWidth >= 768 && innerWidth < 1200;
/* 태블릿: 딤(빈 곳)을 누르면 드로어를 닫는다 */
$("#layout").addEventListener("click", (e) => { if (e.target !== e.currentTarget || !isTablet()) return; if (!$("#panel").hidden) closeDetail(); else setFilterOpen(false); });
let fCloseT;
function setFilterOpen(o) {
  const L = $("#layout"), was = L.classList.contains("f-open");
  if (was !== o) masSnap();
  clearTimeout(fCloseT);
  // PC에서 닫을 때: 필터 창을 바로 없애지 않고 왼쪽으로 미끄러져 사라지게 (그동안 피드는 왼쪽으로 채워짐)
  if (was && !o && !isM() && !RM.matches) { L.classList.add("f-closing"); fCloseT = setTimeout(() => L.classList.remove("f-closing"), 340); }
  else L.classList.remove("f-closing");
  L.classList.toggle("f-open", o); $("#filterBtn").setAttribute("aria-expanded", String(o));
}
$("#filterBtn").onclick = () => setFilterOpen(!$("#layout").classList.contains("f-open"));
if (isTablet()) setFilterOpen(false);
$("#home").onclick = (e) => { e.preventDefault(); $("#reset").click(); closeDetail(); };

/* ---------------------------------------------------------------- 색상 필터 (컬러 팔레트) */
const hsv2hex = (h, s, v) => { const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join(""); };
const hex2hsv = (hex) => { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0; if (d) hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: hh * 60, s: mx ? d / mx : 0, v: mx }; };
const CP = { h: 0, s: 0.75, v: 0.9, dirty: false };
const pastPal = () => store.get("reffy.pal", []);
function drawColorPanel() {
  const root = $("#cpanel"); root.replaceChildren();
  const cur = () => hsv2hex(CP.h, CP.s, CP.v);
  const add = (c) => { c = c.toLowerCase(); if (!S.pickColors.includes(c)) S.pickColors = [...S.pickColors, c].slice(-5); CP.dirty = false; drawColorPanel(); };
  const saveColor = (c) => { c = c.toLowerCase(); store.set("reffy.pal", [c, ...pastPal().filter((x) => x !== c)].slice(0, 15)); add(c); toast("지난 팔레트에 저장했어요"); };
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
    h("div", { class: "ccode" }, h("span", {}, "Color Code"), h("div", { class: "cfield" }, hex, sw), h("button", { class: "btn", type: "button", onclick: () => saveColor(cur()) }, "저장")),
    h("hr", { class: "cdiv" }),
    h("h3", { class: "ctit" }, "현재 팔레트"),
    h("div", { class: "cpal" }, h("button", { type: "button", class: "ccirc plus", "aria-label": "현재 색 추가", title: "현재 색 추가", onclick: () => add(cur()) }, icon("plus", 20)), S.pickColors.map((c) => circle(c, () => { S.pickColors = S.pickColors.filter((x) => x !== c); drawColorPanel(); }, "삭제"))),
    h("h3", { class: "ctit" }, "지난 팔레트"),
    h("div", { class: "cpal" }, pastPal().length ? pastPal().map((c) => h("span", { class: "pc-wrap" }, circle(c, () => add(c), "현재 팔레트에 추가"), h("button", { type: "button", class: "pc-x", "aria-label": `${c.toUpperCase()} 지난 팔레트에서 삭제`, onclick: () => { store.set("reffy.pal", pastPal().filter((x) => x !== c)); drawColorPanel(); } }, "×"))) : h("p", { class: "hint", style: "margin:0" }, "‘저장’을 누른 색이 여기에 남아 나중에 다시 쓸 수 있어요.")));
  paint();
}
async function pullPalette(id) {
  if (!(await (isM() ? confirmDialog("해당 이미지의 컬러를 ‘무드’에 덮어씌울까요?", "무드 필터에 이 이미지의 컬러가 적용돼요.", { ok: "적용", cancel: "취소" })
    : confirmDialog("해당 이미지의 컬러를 ‘현재 팔레트’에 얹어 씌우겠습니까?", "이미지 대표 색 5개를 현재 팔레트로 불러와요.", { remember: "reffy.palAsk" })))) return;
  try {
    const r = await api(`/api/images/${id}/colors`);
    if (!r.colors.length) return toast("이 이미지에서 색을 찾지 못했어요.");
    S.pickColors = r.colors.map((c) => c[0]); CP.dirty = false;
    if (isM() && !$("#panel").hidden) closeDetail();
    setFilterOpen(true);
    showTab(true); toast(isM() ? "무드에 색을 불러왔어요. ‘적용하기’를 눌러 같은 색을 찾아보세요." : "현재 팔레트에 색을 불러왔어요. ‘색상 적용하기’를 눌러 같은 색을 찾아보세요.");
  } catch (e) { toast(e.message); }
}
let curTab = "tag";
function showTab(t) {
  curTab = t === true ? "color" : t === false ? "tag" : t;
  const on = { tag: curTab === "tag", pose: curTab === "pose", color: curTab === "color" };
  $("#groups").hidden = !on.tag; $("#cpanel").hidden = !on.color; $("#ppanel").hidden = !on.pose;
  [["tabTag", on.tag], ["tabPose", on.pose], ["tabColor", on.color]].forEach(([id, v]) => { $("#" + id).classList.toggle("on", v); $("#" + id).setAttribute("aria-selected", String(v)); });
  $("#apply").textContent = isM() ? "적용하기" : on.color ? "색상 적용하기" : on.pose ? "포즈 적용하기" : "필터 적용하기";
  if (on.color) drawColorPanel();
  if (on.pose) drawPosePanel();
}
$("#tabTag").onclick = () => showTab("tag");
$("#tabPose").onclick = () => showTab("pose");
$("#tabColor").onclick = () => showTab("color");
/* 3D 포즈 (HOM_0202): 화면만 있고 검색은 아직 준비 중 */
function drawPosePanel() {
  const vbtn = (l) => h("button", { class: "pill sm", type: "button", onclick: () => toast("3D 포즈 조작은 준비 중이에요") }, l);
  $("#ppanel").replaceChildren(
    h("div", { class: "pose-vp", role: "img", "aria-label": "3D 포즈 뷰포트 (준비 중)" }, icon("person", 72), h("div", { class: "pose-ctl" }, vbtn("회전"), vbtn("확대"), vbtn("시점 초기화"))),
    h("p", { class: "pose-hint" }, "관절을 드래그하거나 신체 파츠를 눌러 포즈를 만드세요"),
    h("div", { class: "pose-sec" }, h("div", { class: "pose-h" }, h("h3", {}, "신체 파츠"), h("button", { class: "linkbtn", type: "button", onclick: () => toast("준비 중이에요") }, "전체 보기")),
      h("div", { class: "pose-parts" }, ["머리", "몸통", "팔", "다리"].map((p) => h("button", { type: "button", onclick: () => toast("준비 중이에요") }, h("span", { class: "ph" }), p)))),
    h("div", { class: "pose-sec" }, h("div", { class: "pose-h" }, h("h3", {}, "저장한 포즈"), h("button", { class: "linkbtn", type: "button", onclick: () => toast("준비 중이에요") }, "전체 보기")),
      h("p", { class: "hint" }, "저장한 포즈가 없어요.")));
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
const SORTS = [["recent", "최근 순"], ["popular", "인기 순"], ["relevance", "관련도 순"]];
let curSort = "recent";
function drawSort() {
  $("#sortLabel").textContent = SORTS.find((x) => x[0] === curSort)[1];
  const m = $("#sortMenu"); m.replaceChildren(...SORTS.map(([k, l]) => h("button", { type: "button", role: "option", "aria-selected": String(k === curSort), onclick: () => { S.sort = k; curSort = k; m.hidden = true; $("#sortBtn").setAttribute("aria-expanded", "false"); drawSort(); reload(); } }, l, k === curSort ? icon("check") : null)));
}
$("#sortBtn").onclick = (e) => { e.stopPropagation();
  if (isM()) return sheetMenu("정렬", SORTS.map(([k, l]) => ({ label: l, on: k === curSort, fn: () => { S.sort = k; curSort = k; drawSort(); reload(); } })));
  const m = $("#sortMenu"); m.hidden = !m.hidden; $("#sortBtn").setAttribute("aria-expanded", String(!m.hidden)); };
document.addEventListener("click", () => { $("#sortMenu").hidden = true; });
drawSort();

/* ---------------------------------------------------------------- 피드(무한 스크롤) */
function card(it) {
  const img = h("img", { src: it.thumb, alt: it.title || "레퍼런스 이미지", loading: "lazy", width: it.w || null, height: it.h || null });
  return h("button", { class: "card" + (S.open === it.id ? " sel" : ""), type: "button", "data-id": it.id, title: it.title || "", "aria-label": (it.title || "레퍼런스 이미지") + " · " + it.author, onclick: () => openDetail(it.id) },
    h("span", { class: "im" }, img),
    it.private ? h("span", { class: "prv" }, "비공개") : null,
    h("span", { class: "meta" + (it.liked ? " liked" : "") }, h("span", { class: "av" }), h("span", { class: "tx" }, h("b", {}, it.author)), h("span", { class: "like" }, icon("heart", 16), h("span", { class: "lk" }, String(it.likes ?? 0)))));
}
const moreIc = () => icon("more", 24);
/* 피드 배치: 받은 순서대로 왼쪽 → 오른쪽, 그다음 가장 짧은 열에 채움 (CSS 다단은 위→아래로 채워 순서가 어긋남) */
const MAS = { cols: [], hs: [], n: 0, seq: 0, el: new Map() };
function masCount() { const g = $("#grid"); g.classList.remove("mas"); const n = parseInt(getComputedStyle(g).columnCount, 10) || 2; g.classList.add("mas"); return n; }
function masReset() {
  const g = $("#grid"); MAS.n = masCount();
  MAS.cols = Array.from({ length: MAS.n }, () => h("div", { class: "mcol" })); MAS.hs = Array(MAS.n).fill(0);
  g.replaceChildren(...MAS.cols);
}
function masPlace(it, el) {
  let k = 0;
  for (let i = 1; i < MAS.n; i++) if (MAS.hs[i] < MAS.hs[k] - 0.01) k = i;
  MAS.cols[k].append(el);
  MAS.hs[k] += (it.w && it.h ? it.h / it.w : 1.25) + 0.2;
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
    const dx = r0.left - r1.left, dy = r0.top - r1.top, sx = r0.width / r1.width;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < .01) return;
    c.classList.add("in");
    c.animate([{ transform: `translate(${dx}px,${dy}px) scale(${sx})` }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
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
  try {
    const d = await api("/api/images?" + p);
    if (my !== S.req) return;
    if (first) { MAS.cols = []; MAS.el.clear(); masReset(); }
    S.items.push(...d.items); S.total = d.total;
    masAdd(d.items);
    S.done = d.items.length === 0 || S.items.length >= d.total;
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
  const any = S.q || S.applied.length || S.colors.length || (S.kinds || []).length;
  const kw = h("div", { class: "z-kw" }), rec = h("div", { class: "z-rec" });
  z.replaceChildren(
    h("div", { class: "z-empty" }, h("span", { class: "z-ic" }, icon("search", 40)),
      h("div", { class: "z-tx" }, h("h2", {}, any ? "검색 결과가 없어요" : "아직 레퍼런스가 없어요"), h("p", {}, any ? "다른 키워드로 검색하거나 필터를 바꿔 보세요" : "첫 레퍼런스를 올려 보세요")),
      any ? h("button", { class: "btn m", type: "button", onclick: () => { S.q = ""; qEl.value = ""; S.applied = []; S.picked = new Set(); S.kinds = []; S.pickedKind = new Set(); S.colors = []; S.pickColors = []; drawGroups(); reload(); } }, "피드 둘러보기")
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
function drawBar(d) {
  const hasQ = !!S.q;
  mobileBar(hasQ);
  $("#qClear").hidden = !qEl.value;
  const t = $("#resultTitle"); t.textContent = isM() ? "검색 결과" : hasQ ? `“${S.q}”` : (S.applied.length || S.colors.length || (S.kinds || []).length ? "검색 결과" : "레퍼런스"); t.className = hasQ ? "q" : "";
  $("#count").textContent = `${S.total.toLocaleString()}개`;
  curSort = d.sort; drawSort();
  const chips = $("#chips"); chips.replaceChildren();
  const seen = new Set();
  if (S.q) chips.append(h("span", { class: "chip dark" }, S.q, h("button", { type: "button", "aria-label": `검색어 ${S.q} 지우기`, onclick: () => runQuery("") }, "✕")));
  S.applied.map((k) => ({ ikey: k, label: S.labels[k]?.label || k })).forEach((m) => {
    if (seen.has(m.ikey)) return; seen.add(m.ikey);
    chips.append(h("span", { class: "chip dark" }, "#" + m.label, S.applied.includes(m.ikey) ? h("button", { type: "button", "aria-label": `${m.label} 필터 해제`, onclick: () => { S.picked.delete(m.ikey); S.applied = S.applied.filter((x) => x !== m.ikey); drawGroups(); reload(); } }, "✕") : null));
  });
  (S.kinds || []).forEach((k) => chips.append(h("span", { class: "chip dark" }, "#" + (KINDS.find((x) => x[0] === k) || [k, k])[1],
    h("button", { type: "button", "aria-label": "종류 필터 해제", onclick: () => { S.kinds = S.kinds.filter((x) => x !== k); S.pickedKind.delete(k); drawGroups(); reload(); } }, "✕"))));
  S.colors.forEach((c) => chips.append(h("span", { class: "chip dark" }, h("i", { class: "sw", style: `background:${c}` }), c.toUpperCase(),
    h("button", { type: "button", "aria-label": `${c} 색상 해제`, onclick: () => { S.colors = S.colors.filter((x) => x !== c); S.pickColors = [...S.colors]; drawColorPanel(); reload(); } }, "✕"))));
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

/* ---------------------------------------------------------------- 상세 패널 */
async function openDetail(id, back = false) {
  if (!back && S.open && S.open !== id) S.hist.push(S.open);   // back 버튼용: 직전에 본 이미지 기록
  S.open = id; document.querySelectorAll(".card").forEach((c) => c.classList.toggle("sel", +c.dataset.id === id));
  masSnap(); clearTimeout(closeDetail.t); $("#layout").classList.remove("p-closing"); $("#panel").style.cssText = "";
  const panel = $("#panel"); panel.hidden = false; $("#layout").classList.add("has-panel"); document.documentElement.classList.add("m-detail"); if (isM()) panel.scrollTop = 0;
  panel.replaceChildren(h("div", { class: "pbody" }, "불러오는 중…"));
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
  if (!(await confirmDialog("해당 이미지의 구도를 ‘3D Pose’에 덮어씌울까요?", "3D Pose 필터에 이 이미지의 구도가 적용돼요.", { ok: "덮어씌우기", cancel: "취소" }))) return;
  if (isM() && !$("#panel").hidden) closeDetail();
  setFilterOpen(true); showTab("pose");
  toast("3D 포즈 검색은 준비 중이에요. 구도를 보고 포즈를 만들어 보세요");
}
/* 게시물 수정 (MYP_0200 수정 모드): 제목 · 사용 소재 · 공개 설정. 태그는 상세 화면의 ‘태그 수정’에서 */
function editPost(d) {
  const st = { title: d.title || "", materials: [...(d.materials || [])], private: !!d.private };
  const m = h("div", { class: "modal" + (isM() ? " mfull" : ""), onmousedown: (e) => !isM() && e.target === m && m.remove() });
  const save_ = async () => {
    try {
      await api(`/api/images/${d.id}/meta`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(st) });
      m.remove(); toast("게시물을 수정했어요");
      const fresh = await api(`/api/images/${d.id}`); fresh.so = d.so; Object.assign(d, fresh); drawDetail(d); reload();
    } catch (e) { toast(e.message); }
  };
  const draw = () => m.replaceChildren(h("div", { class: "dlg bk edit", role: "dialog", "aria-modal": "true", "aria-label": "게시물 수정" },
    isM() ? h("div", { class: "mbar" }, h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => m.remove() }, icon("close", 24)), h("h1", {}, "게시물 수정"), h("div", { class: "mbar-r" }))
      : h("div", { class: "chd" }, h("h2", {}, "게시물 수정"), h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => m.remove() }, icon("close", 24))),
    h("div", { class: "ed-body" },
      h("div", { class: "ed-img" }, h("img", { src: d.full, alt: "" })),
      h("div", { class: "field" }, h("label", { for: "edTitle" }, "제목"), h("input", { class: "inp", id: "edTitle", maxlength: "120", value: st.title, placeholder: "게시물 제목을 입력하세요", oninput: (e) => (st.title = e.target.value) })),
      materialsField(st.materials, draw),
      privacyField(st.private, (v) => { st.private = v; }),
      h("p", { class: "hint" }, "태그는 게시물 상세의 ‘태그 수정’에서 고칠 수 있어요.")),
    h("div", { class: "cft" }, btn("취소", "", () => m.remove()), btn(isM() ? "수정 완료" : "저장", "primary", save_))));
  draw(); document.body.append(m);
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
  const drawMats = (all) => matList.replaceChildren(...mats.slice(0, all ? mats.length : 3).map((l) => h("a", { href: l, target: "_blank", rel: "noopener noreferrer nofollow" }, icon("link", 15), h("span", {}, l))));
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
  const relCard = (it) => h("button", { class: "dp-card", type: "button", "aria-label": (it.title || "레퍼런스") + " · " + it.author, onclick: () => openDetail(it.id) },
    h("span", { class: "dp-im" }, h("img", { src: it.thumb, alt: "", loading: "lazy", width: it.w || null, height: it.h || null })),
    h("span", { class: "dp-ft" }, h("span", { class: "dp-av" }), h("span", { class: "dp-nk" }, it.author), h("span", { class: "dp-lk" + (it.liked ? " on" : "") }, icon("heart", 12), String(it.likes ?? 0))));
  const loadRel = async () => {
    if (relBusy) return; relBusy = true; relMore.disabled = true; relMore.textContent = "불러오는 중…";
    try {
      const r = await api(`/api/images/${d.id}/related?limit=10&offset=${relOff}`); if (S.open !== d.id) return;
      r.items.forEach((it) => { const c = relCols[0].offsetHeight <= relCols[1].offsetHeight ? relCols[0] : relCols[1]; c.append(relCard(it)); });
      relOff += r.items.length; relMore.hidden = !r.more;
    } catch { relMore.hidden = true; } finally { relBusy = false; relMore.disabled = false; relMore.textContent = "더보기"; }
  };
  relMore.onclick = loadRel;
  const head = (t, extra) => h("div", { class: "dp-h" }, h("h3", {}, t), extra || null);
  panel.replaceChildren(
    h("div", { class: "dp-img" }, h("img", { src: d.full, alt: d.title || "레퍼런스 이미지", class: "zoomable", title: "눌러서 크게 보기", onclick: () => openLightbox(d.full, d.title) }),
      h("div", { class: "dp-top" },
        h("button", { class: "dp-ib back", type: "button", "aria-label": "이전에 본 이미지", title: "이전에 본 이미지", disabled: !S.hist.length, onclick: goBack }, icon("arrowLeft", 24)),
        h("span", { class: "sp" }),
        h("button", { class: "dp-ib", type: "button", "aria-label": "공유하기", title: "공유하기", onclick: () => sharePost(d) }, icon("share", 24)),
        h("button", { class: "dp-ib", type: "button", "aria-label": "더보기", "aria-haspopup": "menu", onclick: postMenu }, icon("more", 24)),
        h("button", { class: "dp-ib", type: "button", "aria-label": "창 닫기", title: "닫기", onclick: closeDetail }, icon("close", 24))),
      h("div", { class: "dp-fab" },
        h("button", { type: "button", class: "dp-fb", "aria-label": "이 이미지의 구도로 3D 포즈 찾기", title: "이 이미지의 구도를 3D 포즈로", onclick: () => pullPose() }, icon("pose", 24)),
        h("button", { type: "button", class: "dp-fb", "aria-label": "이 이미지의 색상으로 팔레트 만들기", title: "이 이미지의 색상을 팔레트로", onclick: () => pullPalette(d.id) }, icon("palette", 24)))),
    h("div", { class: "dp-info" },
      h("div", { class: "dp-head" },
        h("div", { class: "dp-user" }, o ? avatarEl(o, 40, "dp-av40") : h("span", { class: "dp-av40 avt" }, (d.author || "?").slice(0, 1)),
          h("div", { class: "dp-name" }, o ? h("a", { href: "#/u/" + o.uid }, d.author) : h("b", {}, d.author), h("span", {}, o ? `@${o.uid}` : `조회 ${d.views.toLocaleString()}`)),
          o && !isOwner ? h("button", { class: "dp-follow" + (o.following ? " ing" : ""), type: "button", onclick: () => act(d, o.following ? "DELETE" : "POST", `/api/users/${o.uid}/follow`, null, edit) }, o.following ? "팔로잉" : "팔로우") : null),
        h("div", { class: "dp-tr" },
          h("h2", { class: "dp-title" }, d.title || "제목 없음", d.private ? h("span", { class: "prv-b" }, "비공개") : null),
          h("div", { class: "dp-react" },
            h("button", { class: "dp-st" + (so.liked ? " on" : ""), type: "button", "aria-pressed": String(!!so.liked), "aria-label": "하트", "data-like": "1", onclick: () => act(d, so.liked ? "DELETE" : "POST", `/api/images/${d.id}/like`, null, edit) }, icon("heart", 20), String(so.likes)),
            h("button", { class: "dp-st", type: "button", "aria-label": "댓글", onclick: () => comment.focus() }, icon("comment", 20), String(so.comments.length))))),
      h("div", { class: "dp-sec" },
        head("태그", so.editable ? h("button", { class: "dp-link", type: "button", onclick: () => drawDetail(d, !edit) }, edit ? "수정 완료" : "태그 수정") : null),
        edit ? kindTag(d, true, () => drawDetail(d, true)) : null,
        h("div", { class: "tags" }, edit ? null : kindTag(d, false), act_.length ? act_.map(tagEl) : (edit ? h("span", { class: "hint" }, "아직 태그가 없어요.") : null)),
        edit ? h("div", { class: "tags", style: "margin-top:10px" }, pickButton(box, (t) => save(d, { add: [t.ikey] }, t), () => new Set(d.tags.filter((x) => x.active).map((x) => x.ikey))),
          off.map((t) => h("button", { class: "tag off", type: "button", title: "눌러서 되돌리기", onclick: () => save(d, { restore: [t.ikey] }, t) }, "#" + t.label))) : null),
      mats.length ? h("div", { class: "dp-sec" }, head("사용 소재", mats.length > 3 ? h("button", { class: "dp-link", type: "button", onclick: (e) => { drawMats(true); e.currentTarget.remove(); } }, "더보기") : null), matList) : null,
      h("div", { class: "dp-sec dp-cmt" },
        h("div", { class: "dp-cw" }, head(`댓글 ${so.comments.length}`),
          h("div", { class: "dp-cin" }, ME ? avatarEl(ME, 24, "dp-cav") : h("span", { class: "dp-cav avt" }), comment, postBtn)),
        so.comments.length ? clist : null, allBtn),
      h("div", { class: "dp-sec dp-rel" }, head("연관 이미지"), h("div", { class: "dp-grid" }, relCols), relMore)));
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
function openLightbox(src, title) {
  let z = 1, x = 0, y = 0, drag = null;
  const img = h("img", { src, alt: title || "레퍼런스 이미지", draggable: "false" });
  const stage = h("div", { class: "lb-stage" }, img);
  const apply = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${z})`; stage.classList.toggle("zoomed", z > 1); minus.disabled = z <= 1; plus.disabled = z >= 4; };
  const zoomTo = (nz) => { z = Math.max(1, Math.min(4, Math.round(nz * 100) / 100)); if (z === 1) { x = 0; y = 0; } apply(); };
  const plus = h("button", { class: "lb-z", type: "button", "aria-label": "확대", onclick: () => zoomTo(z + 0.5) }, icon("plus", 28));
  const minus = h("button", { class: "lb-z", type: "button", "aria-label": "축소", onclick: () => zoomTo(z - 0.5) }, h("span", { class: "lb-minus" }));
  const close = () => { m.remove(); document.removeEventListener("keydown", key); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } else if (e.key === "+" || e.key === "=") zoomTo(z + 0.5); else if (e.key === "-") zoomTo(z - 0.5); };
  const m = h("div", { class: "modal lightbox", role: "dialog", "aria-modal": "true", "aria-label": "이미지 크게 보기",
    onclick: (e) => { if (e.target === m || e.target === stage) close(); } },
    h("button", { class: "lb-close", type: "button", "aria-label": "닫기", onclick: close }, icon("close", 28)),
    stage, h("div", { class: "lb-zoom" }, plus, minus));
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
  up = { token: null, tags: new Map(), file: null, kind: dr?.kind || "illust", title: dr?.title || "", materials: dr?.materials || [], private: !!dr?.private };
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
  up.materials = up.materials || []; up.private = !!up.private;
  const right = h("div", {},
    up.msg ? h("div", { class: "note warn" }, up.msg) : h("div", { class: "note" }, `AI가 ${tags.length}개의 태그를 붙였어요 (${up.sec}초). 틀린 태그는 지우고, 빠진 태그는 추가하세요.`),
    h("div", { class: "field" }, h("label", { for: "upTitle" }, "제목"), title),
    h("div", { class: "field" }, h("label", {}, "종류"), h("div", { class: "seg", role: "radiogroup" }, [["illust", "일러스트"], ["photo", "사진"]].map(([k, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(up.kind === k), class: up.kind === k ? "on" : "", onclick: () => { up.kind = k; drawUpload(); } }, l)))),
    h("div", { class: "field" }, h("label", {}, "태그"),
      tags.length ? [...byAxis].map(([ax, ts]) => h("div", { class: "axisgrp" }, h("h4", {}, ax), h("div", { class: "tags" }, ts.map(tagBtn)))) : h("p", { class: "hint" }, "붙은 태그가 없어요. 아래에서 직접 추가하세요."),
      pickButton(h("div", { class: "pick" }), onPick, () => new Set(up.tags.keys()))),
    materialsField(up.materials, drawUpload),
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
/* 공개 설정 토글 */
function privacyField(priv, onChange) {
  return h("label", { class: "swrow up-sw" }, h("span", {}, h("b", {}, "공개 설정"), h("small", {}, "끄면 나만 볼 수 있어요")),
    h("input", { type: "checkbox", class: "sw-in", role: "switch", checked: !priv, onchange: (e) => onChange(!e.target.checked) }), h("i", { class: "sw-ui" }));
}
/* 임시 저장: 이 브라우저에만 제목 · 사용 소재 · 공개 설정을 보관합니다 (이미지는 다시 골라야 해요) */
function saveDraft() {
  store.set("reffy.draft", { title: up.title || "", materials: up.materials || [], private: !!up.private, kind: up.kind });
  toast("임시 저장했어요. 다음에 이미지를 고르면 이어서 쓸 수 있어요");
}
async function publish() {
  const b = $("#pub"); b.disabled = true; b.textContent = "게시하는 중…";
  try {
    const r = await api("/api/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: up.token, title: up.title || "", kind: up.kind || "illust", tags: [...up.tags.keys()], materials: up.materials || [], private: !!up.private }) });
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
function puDirty() { return pu && (pu.items.length || (pu.title || "").trim() || pu.materials.length); }
async function puClose(force) {
  if (!force && puDirty() && !(await confirmDialog("작성을 그만둘까요?", "작성 중인 내용은 저장되지 않아요.", { ok: "그만두기", cancel: "계속 작성", danger: true }))) return;
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
    const fd = new FormData(); fd.append("file", f);
    api("/api/analyze", { method: "POST", body: fd })
      .then((r) => { it.token = r.token; it.tags = new Map(r.tags.map((t) => [t.ikey, t])); it.msg = r.message; })
      .catch((e) => { it.err = e.message; })
      .finally(() => { it.busy = false; if (pu && pu.step === 2) puDraw(); });
  });
}
function openUploadPC() {
  if (!needLogin()) return;
  const dr = store.get("reffy.draft", null);
  pu = { step: 1, items: [], sel: 0, title: dr?.title || "", materials: (dr?.materials || []).slice(0, MAT_MAX), private: !!dr?.private, kind: dr?.kind || "illust" };
  document.body.append(h("div", { class: "modal upl-pc", onmousedown: (e) => e.target === e.currentTarget && puClose() }, h("div", { class: "dlg upd", role: "dialog", "aria-modal": "true", "aria-label": "새 게시물 업로드" })));
  document.addEventListener("keydown", puKey);
  puDraw();
}
function puHeader() {
  return h("header", { class: "upd-h" }, h("h2", {}, "새 게시물 업로드"), h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => puClose() }, icon("close", 24)));
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
  const left = h("div", { class: "upd-img" }, h("div", { class: "upd-pv" }, cur ? h("img", { src: cur.url, alt: "미리보기" }) : null), thumbs);
  /* 오른쪽 폼 */
  const title = h("input", { class: "inp", id: "pTitle", maxlength: "120", placeholder: "게시물 제목을 입력하세요", value: pu.title, oninput: (e) => (pu.title = e.target.value) });
  const matIn = h("input", { class: "inp", type: "url", placeholder: "링크를 입력해 주세요", "aria-label": "사용 소재 링크", maxlength: "300" });
  const addMat = () => { const v = matIn.value.trim(); if (!v) return; if (pu.materials.length >= MAT_MAX) return toast(`사용 소재는 ${MAT_MAX}개까지 넣을 수 있어요.`); if (!pu.materials.includes(v)) pu.materials.push(v); puDraw(); setTimeout(() => $("#pMat")?.focus(), 0); };
  matIn.id = "pMat"; matIn.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addMat(); } };
  const mats = h("div", { class: "upd-sec" },
    h("div", { class: "upd-mh" }, h("label", { for: "pMat" }, "사용 소재"), h("small", {}, `${pu.materials.length} / ${MAT_MAX}`)),
    h("div", { class: "upd-mrow" }, matIn, h("button", { class: "btn", type: "button", onclick: addMat }, "추가")),
    pu.materials.map((l, i) => h("div", { class: "upd-link" }, icon("link", 18), h("span", {}, l), h("button", { class: "icon-btn", type: "button", "aria-label": "링크 삭제", onclick: () => { pu.materials.splice(i, 1); puDraw(); } }, icon("close", 18)))));
  const vis = h("label", { class: "upd-vis" }, h("span", {}, h("b", {}, "공개 설정"), h("small", {}, "끄면 나만 볼 수 있어요")),
    h("input", { type: "checkbox", class: "sw-in", role: "switch", checked: !pu.private, onchange: (e) => (pu.private = !e.target.checked) }), h("i", { class: "sw-ui" }));
  /* 기존 기능(종류 · AI 태그)은 그대로 두고 공개 설정 아래에 이어서 보여 줌 */
  const kind = h("div", { class: "upd-sec" }, h("label", {}, "종류"), h("div", { class: "seg", role: "radiogroup" },
    [["illust", "일러스트"], ["photo", "사진"]].map(([k, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(pu.kind === k), class: pu.kind === k ? "on" : "", onclick: () => { pu.kind = k; puDraw(); } }, l))));
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
    h("div", { class: "upd-c" }, left, h("div", { class: "upd-form" }, h("div", { class: "upd-sec" }, h("label", { for: "pTitle" }, "제목"), title), mats, vis, kind, tagSec)),
    h("div", { class: "upd-f" }, h("span", { class: "sp" }),
      h("button", { class: "btn", type: "button", onclick: () => { store.set("reffy.draft", { title: pu.title || "", materials: pu.materials, private: pu.private, kind: pu.kind }); toast("임시 저장했어요"); } }, "임시 저장"),
      h("button", { class: "btn primary", id: "pPub", type: "button", disabled: busy || !pu.items.some((it) => it.token), onclick: puPublish }, busy ? "분석 중…" : "등록")));
}
async function puPublish() {
  const b = $("#pPub"); b.disabled = true; b.textContent = "등록 중…";
  const ready = pu.items.filter((it) => it.token);
  try {
    for (const it of ready) {
      await api("/api/images", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: it.token, title: pu.title || "", kind: pu.kind, tags: [...it.tags.keys()], materials: pu.materials, private: !!pu.private }) });
    }
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
