"use strict";
/* REFFY — 라우팅과 홈 밖의 화면: 로그인·회원가입, 킵 스페이스, 서랍(레퍼런스 북), 알림. app.js 의 공통 함수를 사용합니다. */
const when = (iso) => new Date(String(iso).replace(" ", "T"));
function ago(iso) {
  const s = (Date.now() - when(iso)) / 1000;
  if (s < 60) return "방금"; if (s < 3600) return Math.floor(s / 60) + "분 전"; if (s < 86400) return Math.floor(s / 3600) + "시간 전";
  if (s < 604800) return Math.floor(s / 86400) + "일 전"; return when(iso).toLocaleDateString("ko-KR");
}
const btn = (label, cls, fn, attrs) => h("button", { class: "btn " + (cls || ""), type: "button", onclick: fn, ...(attrs || {}) }, label);
/* PC: 상단 메뉴(홈 · 킵 스페이스 · 서랍)로 바로 갈 수 없는 화면에 두는 뒤로 버튼 */
function pcBack(fallback = "#/", cls = "") {
  return h("button", { class: "pc-back " + cls, type: "button", "aria-label": "뒤로", title: "뒤로",
    onclick: () => { const here = location.hash; if (history.length > 1) { history.back(); setTimeout(() => { if (location.hash === here) location.hash = fallback; }, 250); } else location.hash = fallback; } }, icon("back", 24));
}
function page(el) {
  $("#layout").hidden = true; const p = $("#page");
  // 같은 화면(설정 · 서랍) 안에서 왼쪽 메뉴만 바꾸면: 화면 전체가 떠오르지 않고 오른쪽 내용만 살짝 바뀜
  const prev = p.hidden ? null : p.firstElementChild, cls = (x) => (x && x.className || "").split(" ")[0];
  p.classList.toggle("same", !!prev && cls(prev) === cls(el) && !!el.querySelector(".st-snb, .dnav"));
  p.hidden = false; p.replaceChildren(el); window.scrollTo(0, 0);
}
function popMenu(anchor, items) {
  if (isM()) return sheetMenu("더보기", items.map(([l, fn]) => ({ label: l, fn, danger: /삭제|빼기/.test(l) })));
  document.querySelector(".pop-menu")?.remove();
  const r = anchor.getBoundingClientRect();
  const m = h("div", { class: "pop-menu", role: "menu", style: `left:${Math.max(8, r.right - 140 + window.scrollX)}px;top:${r.bottom + 4 + window.scrollY}px` },
    items.map(([l, fn]) => h("button", { type: "button", role: "menuitem", onclick: () => { m.remove(); fn(); } }, l)));
  document.body.append(m);
  setTimeout(() => document.addEventListener("click", () => m.remove(), { once: true }), 0);
}

/* 아이콘 메뉴 카드 (Figma MenuCard): [{ic, label, fn, danger}] */
function menuCard(anchor, items, title) {
  if (isM()) return sheetMenu(title || "더보기", items);
  document.querySelector(".mcard")?.remove();
  const r = anchor.getBoundingClientRect();
  const m = h("div", { class: "mcard", role: "menu", style: `left:${Math.max(8, Math.min(r.right - 200, window.innerWidth - 208))}px;top:${r.bottom + 6}px` },
    items.map((it) => h("button", { type: "button", role: "menuitem", class: it.danger ? "danger" : "", onclick: () => { m.remove(); it.fn(); } }, it.ic ? icon(it.ic, 20) : null, it.label)));
  document.body.append(m);
  setTimeout(() => document.addEventListener("click", () => m.remove(), { once: true }), 0);
}

/* 확인 모달: 제목 + [아니요][네] (Figma 삭제 확인 양식) */
function confirmDialog(title, sub, opt = {}) {
  if (opt.remember && store.get(opt.remember, false)) return Promise.resolve(true);   // ‘다시 보지 않기’를 고른 뒤에는 바로 진행
  if (isM() && !opt.ok) opt = { ...opt, ok: /삭제/.test(title) ? "삭제" : "확인", danger: /삭제/.test(title) };
  return new Promise((res) => {
    let skip = false;
    const done = (v) => { if (v && skip && opt.remember) store.set(opt.remember, true); m.remove(); document.removeEventListener("keydown", key); res(v); };
    const key = (e) => { if (e.key === "Escape") done(false); };
    const wf = !!opt.ok;
    const m = h("div", { class: "modal center", onmousedown: (e) => e.target === m && done(false) },
      wf ? h("div", { class: "dlg confirm wf", role: "alertdialog", "aria-modal": "true", "aria-label": title },
        h("h2", {}, title), sub ? h("p", { class: "csub" }, sub) : null,
        h("div", { class: "cft" }, btn(opt.cancel || "취소", "", () => done(false)), btn(opt.ok, opt.danger ? "danger" : "primary", () => done(true), { id: "cYes" })))
      : h("div", { class: "dlg confirm" + (title.length > 24 ? " long" : ""), role: "alertdialog", "aria-modal": "true", "aria-label": title },
        h("div", { class: "chd" }, h("h2", {}, title), h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => done(false) }, icon("close", 24))),
        sub ? h("p", { class: "csub" }, sub) : null,
        h("div", { class: "cft" }, opt.remember ? h("label", { class: "cskip" }, h("input", { class: "cbx", type: "checkbox", onchange: (e) => (skip = e.target.checked) }), "다시 보지 않기") : null,
          btn("아니요", "", () => done(false)), btn("네", "primary", () => done(true), { id: "cYes" }))));
    document.body.append(m); document.addEventListener("keydown", key); setTimeout(() => $("#cYes")?.focus(), 0);
  });
}
/* 프로필 사진(없으면 첫 글자) */
function avatarEl(u, size, cls) {
  const el = h("span", { class: (cls || "") + " avt", style: `width:${size}px;height:${size}px;border-radius:${size / 2}px;font-size:${Math.round(size * .4)}px` });
  if (u && u.avatar) el.append(h("img", { src: u.avatar, alt: "" })); else el.append(((u && (u.nick || u.uid)) || "?").slice(0, 1).toUpperCase());
  return el;
}
function modal(title, body, foot) {
  const m = h("div", { class: "modal", onmousedown: (e) => e.target === m && m.remove() },
    h("div", { class: "dlg sm", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("header", {}, h("h2", {}, title), h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => m.remove() }, icon("close", 24))),
      h("div", { class: "body" }, body), foot));
  document.body.append(m); return m;
}

/* ---------------------------------------------------------------- 카드·그리드 */
function pcard(it, o = {}) {
  const el = h("div", { class: "card" + (o.on ? " on" : ""), "data-id": it.id, role: "button", tabindex: "0", onclick: () => (o.click ? o.click(it, el) : goPost(it.id)),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } } },
    h("span", { class: "im" }, h("img", { src: it.thumb, alt: it.title || "레퍼런스 이미지", loading: "lazy", width: it.w || null, height: it.h || null })), h("span", { class: "ck" }),
    it.private ? h("span", { class: "prv" }, "비공개") : null,
    isM() ? h("span", { class: "meta" + (it.liked ? " liked" : "") }, h("span", { class: "av" }), h("span", { class: "tx" }, h("b", {}, it.author)), it.likes != null ? h("span", { class: "like" }, icon("heart", 16), h("span", { class: "lk" }, String(it.likes))) : null)
    : h("span", { class: "meta" }, h("span", { class: "av" }, (it.author || "?").slice(0, 1)), h("span", { class: "tx" }, h("b", {}, it.title || "제목 없음"), h("span", {}, it.author)),
      o.more ? h("button", { class: "more-btn", type: "button", "aria-label": "더보기", onclick: (e) => { e.stopPropagation(); o.more(e.currentTarget, it); } }, moreIc()) : moreIc()));
  return el;
}
const pgrid = (items, o, cls) => h("div", { class: "grid " + (cls || "c6") }, items.map((it) => pcard(it, typeof o === "function" ? o(it) : o)));
const notice = (t, p, b) => h("div", { class: "notice" }, h("h2", {}, t), h("p", {}, p), b || null);

/* ---------------------------------------------------------------- 저장하기(북 고르기) */
async function saveToBook(ids, o = {}) {
  let books;
  try { books = (await api("/api/books")).items; } catch (e) { toast(e.message); return; }
  let chosen = books[0]?.id ?? null, rm = false;
  const list = h("div", {});
  const name = h("input", { type: "text", maxlength: "40", placeholder: "예) 앉은 포즈 모음", "aria-label": "새 북 이름" });
  const drawList = () => list.replaceChildren(...(books.length ? books.map((b) => h("button", { class: "brow-pick" + (chosen === b.id ? " on" : ""), type: "button", role: "radio", "aria-checked": String(chosen === b.id), onclick: () => { chosen = b.id; drawList(); } },
    b.covers[0] ? h("img", { src: `/img/${b.covers[0]}?s=thumb`, alt: "" }) : h("span", { class: "th" }), h("span", { class: "bt" }, h("b", {}, b.name), h("span", {}, `${b.count}개`)), h("span", { class: "radio" })))
    : [h("p", { class: "hint" }, "아직 북이 없어요. 위에서 새 북을 만들어 주세요.")]));
  drawList();
  const make = async () => {
    const v = name.value.trim(); if (!v) return toast("북 이름을 입력해 주세요.");
    try { const b = await api("/api/books", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) }); books.unshift(b); chosen = b.id; name.value = ""; drawList(); } catch (e) { toast(e.message); }
  };
  const cb = h("input", { class: "cbx", type: "checkbox", onchange: (e) => (rm = e.target.checked) });
  const m = modal(isM() ? "북에 저장" : "저장하기", h("div", {}, h("div", { class: "newbook" }, h("b", {}, "+ 새 북 만들기"), h("span", { class: "lbl", style: "margin-top:0" }, "새 북 이름"), h("div", { class: "row" }, name, btn("만들기", "", make, { style: "height:44px" }))), h("span", { class: "lbl" }, "내 북"), list),
    h("div", { class: "foot" }, h("label", {}, cb, "저장 후 킵 스페이스에서 비우기"), btn("취소", "", () => m.remove()), btn("저장하기", "primary", async () => {
      if (chosen == null) return toast("저장할 북을 골라 주세요.");
      try { const b = await api(`/api/books/${chosen}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, remove_from_keep: rm }) }); m.remove(); toast(`“${b.name}”에 저장했어요`); o.after && o.after(); } catch (e) { toast(e.message); }
    })));
  setTimeout(() => name.focus(), 0);
}
function bookDialog(book, done) {
  let file = null;
  const name = h("input", { type: "text", maxlength: "40", value: book?.name || "", placeholder: "예: 앉은 포즈 모음", "aria-label": "북 이름" });
  const desc = h("textarea", { maxlength: "200", placeholder: "북에 대한 메모를 남겨 보세요", "aria-label": "북 설명" }, book?.description || "");
  const prev = h("span", { class: "cvprev" });
  const showPrev = (url) => prev.replaceChildren(url ? h("img", { src: url, alt: "커버 미리보기" }) : "");
  showPrev(book?.cover || (book?.covers?.[0] ? `/img/${book.covers[0]}?s=thumb` : null));
  const pick = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: true, onchange: (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 5 << 20) { toast("5MB 이하의 이미지만 올릴 수 있어요."); return; } file = f; showPrev(URL.createObjectURL(f)); } });
  const m = h("div", { class: "modal", onmousedown: (e) => e.target === m && m.remove() },
    h("div", { class: "dlg bk", role: "dialog", "aria-modal": "true", "aria-label": book ? "북 편집" : "새 북 만들기" },
      h("div", { class: "chd" }, h("h2", {}, book ? "북 편집" : "새 북 만들기"), h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => m.remove() }, icon("close", 24))),
      h("div", { class: "cvrow" }, prev, h("div", { class: "cvtx" }, h("b", {}, "커버 이미지"), h("span", {}, "이미지를 고르면 커버로 지정돼요"),
        h("button", { class: "btn", type: "button", onclick: () => pick.click() }, icon("image", 20), "업로드"), pick)),
      h("label", { class: "fl2" }, "북 이름"), name,
      h("label", { class: "fl2" }, "설명 (선택)"), desc,
      h("div", { class: "cft" }, btn("취소", "", () => m.remove()), btn(book ? "저장" : "만들기", "primary", async () => {
        if (!name.value.trim()) return toast("북 이름을 입력해 주세요.");
        try {
          const b = await api(book ? `/api/books/${book.id}` : "/api/books", { method: book ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.value, description: desc.value }) });
          if (file) { const fd = new FormData(); fd.append("file", file); await api(`/api/books/${b.id}/cover`, { method: "POST", body: fd }); }
          m.remove(); done();
        } catch (e) { toast(e.message); }
      }))));
  document.body.append(m); setTimeout(() => name.focus(), 0);
}

/* ---------------------------------------------------------------- 킵 스페이스 */
async function keepPage() {
  if (!needLogin()) return;
  let kind = "", sel = false, data = { items: [] }; const picked = new Set();
  const root = h("div", { class: "pad" }); page(root);
  async function load() { try { data = await api("/api/me/keeps" + (kind ? "?kind=" + kind : "")); } catch (e) { toast(e.message); return; } draw(); }
  function bar() {
    const b = h("div", { class: "selbar", hidden: !sel });
    const n = picked.size;
    const delBtn = btn("삭제", "", async () => {
      if (!n) return toast("삭제할 이미지를 골라 주세요.");
      if (!(await confirmDialog(`선택한 레퍼런스 ${n}개를 삭제할까요?`, "삭제한 레퍼런스는 되돌릴 수 없어요.", { ok: "네", cancel: "아니오" }))) return;
      try { await api("/api/me/keeps/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...picked] }) }); picked.clear(); sel = false; toast("킵 스페이스에서 삭제했어요"); load(); } catch (e) { toast(e.message); }
    });
    const saveBtn = btn("북에 저장", "primary", () => n ? saveToBook([...picked], { after: () => { picked.clear(); sel = false; load(); } }) : toast("저장할 이미지를 골라 주세요."));
    b.append(h("b", {}, `${n}개 선택`), h("span", { class: "sp" }), delBtn, saveBtn);
    return b;
  }
  function draw() {
    root.classList.toggle("selecting", sel);
    const chips = [["", "전체"], ["photo", "사진"], ["illust", "일러스트"]].map(([k, l]) => h("button", { class: "pill" + (kind === k ? " on" : ""), type: "button", onclick: () => { kind = k; picked.clear(); load(); } }, l));
    const selBtn = !data.items.length && !isM() ? h("div", { class: "kp-acts" }, h("button", { class: "icon-btn", type: "button", disabled: true, "aria-label": "삭제" }, icon("trash", 24)), h("button", { class: "btn primary", type: "button", disabled: true }, "선택")) : data.items.length ? (sel ? btn("취소", isM() ? "linkbtn" : "", () => { sel = false; picked.clear(); draw(); }) : btn("선택", isM() ? "linkbtn" : "primary", () => { sel = true; draw(); })) : null;
    root.replaceChildren(isM() ? mbar("킵 스페이스", { big: true, right: [selBtn] }) : "", h("div", { class: "kbar" }, chips, h("span", { class: "sp" }), isM() ? null : selBtn),
      data.items.length ? pgrid(data.items, (it) => ({ on: picked.has(it.id), click: (_, el) => { if (!sel) return isM() ? keepViewer(data.items.slice(), data.items.indexOf(it), load) : keepCompare(data.items.slice(), data.items.indexOf(it), kind, (k) => { kind = k; picked.clear(); page(root); load(); }, () => { page(root); load(); }); picked.has(it.id) ? picked.delete(it.id) : picked.add(it.id); el.classList.toggle("on", picked.has(it.id)); root.querySelector(".selbar").replaceWith(bar()); } }), "c6")
        : isM() ? notice(kind ? "이 종류의 킵이 없어요" : "킵 스페이스가 비어있어요", "피드에서 마음에 드는 레퍼런스를 담아보세요", btn("홈으로", "primary", () => (location.hash = "#/")))
          : h("div", { class: "kp-empty" }, h("span", { class: "kp-ex" }, "!"), h("h2", {}, kind ? "이 종류의 킵이 없어요" : "킵 스페이스가 비어있어요"), btn("피드 둘러보기", "primary", () => (location.hash = "#/"))),
      bar());
  }
  load();
}

/* ---------------------------------------------------------------- 킵 스페이스 비교 보기 (KEP_0100 · 0101 · 0102)
   레퍼런스를 하나씩 넘겨 가며 비교 · 체크해서 삭제하거나 북에 저장 · ←/→ 키, 화살표, 아래 썸네일로 이동 */
function keepCompare(items, start, kind, setKind, onDone) {
  const root = $("#page"); let idx = Math.max(0, start); const picked = new Set();
  const full = (it) => (it.thumb || "").replace("s=thumb", "s=full");
  const close = () => { document.removeEventListener("keydown", key); onDone(); };
  const key = (e) => { if ($(".modal:not(.closing)")) return; if (e.key === "ArrowRight") go(idx + 1); else if (e.key === "ArrowLeft") go(idx - 1); else if (e.key === "Escape") close(); else if (e.key === " ") { e.preventDefault(); toggle(items[idx]); } };
  document.addEventListener("keydown", key);
  const track = h("div", { class: "kc-track" });
  const strip = h("div", { class: "kc-strip" });
  const count = h("b", { class: "kc-count" });
  const toggle = (it) => { if (!it) return; picked.has(it.id) ? picked.delete(it.id) : picked.add(it.id); paint(); };
  const ids = () => (picked.size ? [...picked] : items[idx] ? [items[idx].id] : []);
  const delBtn = h("button", { class: "icon-btn kc-del", type: "button", "aria-label": "선택한 레퍼런스 삭제", title: "삭제", onclick: async () => {
    const list = ids(); if (!list.length) return;
    if (!(await confirmDialog(`선택한 레퍼런스 ${list.length}개를 삭제할까요?`, "삭제한 레퍼런스는 되돌릴 수 없어요.", { ok: "네", cancel: "아니오" }))) return;
    try { await api("/api/me/keeps/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: list }) });
      items = items.filter((x) => !list.includes(x.id)); list.forEach((x) => picked.delete(x)); toast("킵 스페이스에서 삭제했어요");
      if (!items.length) return close(); idx = Math.min(idx, items.length - 1); build(); } catch (e) { toast(e.message); } } }, icon("trash", 24));
  const saveBtn = h("button", { class: "btn primary kc-save", type: "button", onclick: () => saveToBook(ids(), { after: () => { picked.clear(); onDone(); } }) }, "북에 저장");
  const chips = [["", "전체"], ["photo", "사진"], ["illust", "일러스트"]].map(([k, l]) => h("button", { class: "pill" + (kind === k ? " on" : ""), type: "button", onclick: () => { document.removeEventListener("keydown", key); setKind(k); } }, l));
  const prev = h("button", { class: "kc-nav prev", type: "button", "aria-label": "이전 레퍼런스", onclick: () => go(idx - 1) }, icon("chevR", 48));
  const next = h("button", { class: "kc-nav next", type: "button", "aria-label": "다음 레퍼런스", onclick: () => go(idx + 1) }, icon("chevR", 48));
  function build() {
    track.replaceChildren(...items.map((it, i) => h("div", { class: "kc-card", "data-i": i, onclick: () => (i === idx ? toggle(it) : go(i)) },
      h("img", { src: full(it), alt: it.title || "레퍼런스 이미지", loading: Math.abs(i - idx) < 4 ? "eager" : "lazy" }),
      h("span", { class: "kc-chk", role: "checkbox", "aria-label": "선택" }, icon("check", 18)))));
    strip.replaceChildren(...items.map((it, i) => h("button", { class: "kc-th", type: "button", "aria-label": `${i + 1}번째 레퍼런스`, onclick: () => go(i) },
      h("img", { src: it.thumb, alt: "", loading: "lazy" }), h("span", { class: "kc-chk" }, icon("check", 14)))));
    go(idx, true);
  }
  function paint() {
    track.querySelectorAll(".kc-card").forEach((c, i) => { c.classList.toggle("cur", i === idx); c.classList.toggle("on", picked.has(items[i]?.id)); c.querySelector(".kc-chk").setAttribute("aria-checked", String(picked.has(items[i]?.id))); });
    strip.querySelectorAll(".kc-th").forEach((t, i) => { t.classList.toggle("cur", i === idx); t.classList.toggle("on", picked.has(items[i]?.id)); });
    count.textContent = `${idx + 1}/${items.length}`;
    prev.disabled = idx <= 0; next.disabled = idx >= items.length - 1;
    saveBtn.textContent = picked.size ? `북에 저장 (${picked.size})` : "북에 저장";
  }
  function go(i, instant) {
    if (!items.length) return; idx = Math.max(0, Math.min(items.length - 1, i));
    const card = track.children[idx]; if (!card) return;
    const vw = track.parentElement.clientWidth;
    track.style.transition = instant ? "none" : "";
    track.style.transform = `translateX(${Math.round(vw / 2 - (card.offsetLeft + card.offsetWidth / 2))}px)`;
    const th = strip.children[idx]; if (th) strip.scrollTo({ left: th.offsetLeft - strip.clientWidth / 2 + th.offsetWidth / 2, behavior: instant ? "auto" : "smooth" });
    paint();
  }
  root.replaceChildren(h("div", { class: "kc" },
    h("div", { class: "kc-back" }, h("button", { class: "icon-btn", type: "button", "aria-label": "킵 스페이스로 돌아가기", onclick: close }, icon("chevR", 24))),
    h("div", { class: "kc-bar" }, h("div", { class: "kc-chips" }, chips), count, h("div", { class: "kc-acts" }, delBtn, saveBtn)),
    h("div", { class: "kc-stage" }, track, prev, next),
    h("div", { class: "kc-dock" }, strip)));
  requestAnimationFrame(build);
}

/* ---------------------------------------------------------------- 서랍 */
let drawerKind = "";
async function drawerPage(sub, id) {
  if (!needLogin()) return;
  if (isM()) return drawerPageM(sub, id);
  if (sub === "act") sub = "";
  const link = (t, href, on) => h("a", { href, class: on ? "on" : "", "aria-current": on ? "page" : null }, t);
  const main = h("div", { class: "dmain" });
  const root = h("div", { class: "drawer" }, h("aside", { class: "dnav" }, h("h2", {}, "서랍"), link("레퍼런스 북", "#/drawer", !sub || sub === "book"), h("small", {}, "내 활동"),
    link("최근 본 게시물", "#/drawer/recent", sub === "recent"), link("반응한 게시물", "#/drawer/liked", sub === "liked")), main);
  // 이미 서랍 화면이면 새 내용을 다 불러온 뒤에 바꿔 끼움 (빈 화면이 잠깐 보이지 않게)
  const stay = !$("#page").hidden && $("#page > .drawer");
  if (!stay) page(root);
  try {
    if (sub === "recent") {
      const d = await api("/api/me/viewed");
      main.append(h("div", { class: "dhead2" }, h("div", {}, h("h1", {}, "최근 본 게시물"), h("p", { class: "sub" }, "최근 일주일 동안 본 게시물이에요"))),
        d.items.length ? pgrid(d.items, {}, "c5") : notice("최근 본 게시물이 없어요", "홈에서 마음에 드는 레퍼런스를 찾아 보세요.", btn("홈으로", "primary", () => (location.hash = "#/"))));
    } else if (sub === "liked") {
      // DRW_0302 반응한 게시물: 전체 · 하트 · 댓글 칩으로 거르기
      const body = h("div", { class: "dbody" });
      const chips = h("div", { class: "dchips", role: "radiogroup", "aria-label": "반응 종류" });
      const load = async () => {
        chips.replaceChildren(...[["", "전체"], ["like", "하트"], ["comment", "댓글"]].map(([k, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(drawerKind === k), class: "dchip" + (drawerKind === k ? " on" : ""), onclick: () => { if (drawerKind !== k) { drawerKind = k; load(); } } }, l)));
        const d = await api("/api/me/reacted" + (drawerKind ? "?kind=" + drawerKind : ""));
        // 카드: 피드와 같은 WF/Card (프로필 · 닉네임 · 하트 수), 누르면 게시물 화면으로
        const dcard = (it) => { const c = card(it); c.onclick = () => goPost(it.id); return c; };
        body.replaceChildren(d.items.length ? h("div", { class: "grid c5 dgrid" }, d.items.map(dcard)) : notice(drawerKind === "comment" ? "아직 댓글을 단 게시물이 없어요" : drawerKind === "like" ? "아직 하트를 누른 게시물이 없어요" : "아직 반응한 게시물이 없어요", "홈에서 마음에 드는 레퍼런스를 찾아 보세요.", btn("홈으로", "primary", () => (location.hash = "#/"))));
      };
      await load();
      main.append(h("div", { class: "dhead2" }, h("div", {}, h("h1", {}, "반응한 게시물"), h("p", { class: "sub" }, "하트를 누르거나 댓글을 단 게시글이에요")), chips), body);
    } else if (sub === "book") await bookDetail(main, id); else await bookList(main);
  } catch (e) { main.replaceChildren(notice("불러오지 못했어요", e.message)); }
  if (stay && location.hash.startsWith("#/drawer")) page(root);
}
async function bookList(main, sort = "recent") {
  const d = await api("/api/books?sort=" + sort);
  const redo = () => bookList(main, sort);
  const sortBtn = h("button", { class: "sortbtn", type: "button", onclick: (e) => { e.stopPropagation(); popMenu(e.currentTarget, [["최근 수정 순", () => { sort = "recent"; redo(); }], ["이름 순", () => { sort = "name"; redo(); }]]); } }, sort === "name" ? "이름 순" : "최근 수정 순", icon("chevronDown"));
  main.replaceChildren(h("div", { class: "dhead" }, h("div", {}, h("h1", {}, "레퍼런스 북"), h("p", { class: "sub" }, `북 ${d.total}개`)), h("span", { class: "sp" }), sortBtn, btn("+ 새 북 만들기", "primary", () => bookDialog(null, redo))),
    d.items.length ? h("div", { class: "books" }, d.items.map((b) => h("div", { class: "bk" },
      h("button", { class: "book", type: "button", "aria-label": `${b.name} 열기`, onclick: () => (location.hash = "#/drawer/book/" + b.id) }, h("span", { class: "cover" + (b.cover ? " one" : "") }, b.cover ? h("img", { src: b.cover, alt: "" }) : [0, 1, 2].map((i) => h("span", {}, b.covers[i] ? h("img", { src: `/img/${b.covers[i]}?s=thumb`, alt: "" }) : null)))),
      h("div", { class: "brow" }, h("button", { class: "bt", type: "button", style: "text-align:left", onclick: () => (location.hash = "#/drawer/book/" + b.id) }, h("b", {}, b.name), h("span", {}, `${b.count}개 · ${ago(b.updated)}`)),
        h("button", { class: "more-btn", type: "button", "aria-label": `${b.name} 더보기`, onclick: (e) => { e.stopPropagation(); popMenu(e.currentTarget, [["편집", () => bookDialog(b, redo)], ["삭제", async () => { if (await confirmDialog(`“${b.name}” 북을 삭제할까요? 담긴 게시물은 삭제되지 않아요.`)) { try { await api("/api/books/" + b.id, { method: "DELETE" }); redo(); } catch (er) { toast(er.message); } } }]]); } }, moreIc())))))
      : notice("아직 북이 없어요", "마음에 드는 레퍼런스를 주제별로 모아 보세요.", btn("+ 새 북 만들기", "primary", () => bookDialog(null, redo))));
}
async function bookDetail(main, id) {
  const b = await api("/api/books/" + id); const redo = () => bookDetail(main, id);
  main.replaceChildren(h("div", { class: "back-row" }, h("button", { class: "icon-btn", type: "button", "aria-label": "북 목록으로", onclick: () => (location.hash = "#/drawer") }, icon("back", 24)),
    h("button", { class: "more-btn", type: "button", "aria-label": "북 메뉴", onclick: (e) => { e.stopPropagation(); popMenu(e.currentTarget, [["북 삭제", async () => { if (await confirmDialog(`“${b.name}” 북을 삭제할까요? 담긴 게시물은 삭제되지 않아요.`)) { try { await api("/api/books/" + id, { method: "DELETE" }); location.hash = "#/drawer"; } catch (er) { toast(er.message); } } }]]); } }, moreIc())),
    h("div", { class: "dhead" }, h("div", {}, h("h1", { style: "font-size:28px" }, b.name), h("p", { class: "sub" }, `총 ${b.count}장 · ${ago(b.updated)}`), b.description ? h("p", { class: "sub" }, b.description) : null), h("span", { class: "sp" }), btn("편집", "primary", () => bookDialog(b, redo))),
    b.items.length ? pgrid(b.items, { more: (a, it) => popMenu(a, [["북에서 빼기", async () => { try { await api(`/api/books/${id}/items/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [it.id] }) }); redo(); } catch (e) { toast(e.message); } }]]) }, "c5")
      : notice("이 북은 비어 있어요", "게시물 상세에서 ‘북에 저장’을 눌러 담아 보세요.", btn("홈으로", "primary", () => (location.hash = "#/"))));
}

/* ---------------------------------------------------------------- 알림 */
let nTab = "";
function bucket(iso) { const d = when(iso), n = new Date(); if (d.toDateString() === n.toDateString()) return "오늘"; return n - d < 6048e5 ? "이번 주" : "이전"; }
async function drawNotif(box = $("#notif")) {
  let r;
  try { r = await api("/api/notifications" + (nTab ? "?kind=" + nTab : "")); } catch (e) { box.replaceChildren(h("p", { class: "nempty" }, e.message)); return; }
  const text = (n) => n.kind === "like" ? `${n.actor}님이 회원님의 게시물에 하트를 눌렀어요` : n.kind === "comment" ? `${n.actor}님이 댓글을 남겼어요: “${n.body}”` : `${n.actor}님이 회원님을 팔로우해요`;
  const groups = {}; r.items.forEach((n) => (groups[bucket(n.created)] ||= []).push(n));
  box.replaceChildren(h("div", { class: "hd" }, h("h2", {}, "알림"), h("button", { type: "button", onclick: async () => { try { await api("/api/notifications/read", { method: "POST" }); UNREAD = 0; drawMe(); drawNotif(box); } catch (e) { toast(e.message); } } }, "모두 읽음")),
    h("div", { class: "ntabs", role: "tablist" }, [["", "전체"], ["like", "하트"], ["comment", "댓글"], ["follow", "팔로잉"]].map(([k, l]) => h("button", { type: "button", role: "tab", class: nTab === k ? "on" : "", "aria-selected": String(nTab === k), onclick: () => { nTab = k; drawNotif(box); } }, l))),
    ...(r.items.length ? ["오늘", "이번 주", "이전"].filter((k) => groups[k]).map((k) => h("div", {}, h("h4", {}, k), groups[k].map((n) => h("div", { class: "nitem" + (n.read ? "" : " unread") },
      h("button", { class: "nitem", type: "button", style: "flex:1;padding:0", onclick: () => { if (box.id === "notif") box.hidden = true; if (n.image_id) goPost(n.image_id); else if (n.actor_uid) location.hash = "#/u/" + n.actor_uid; } },
        h("span", { class: "av" }, n.actor.slice(0, 1)), h("span", { class: "nt" }, text(n), h("small", {}, ago(n.created))), n.thumb ? h("img", { src: n.thumb, alt: "" }) : null),
      n.kind === "follow" && !n.following ? btn("맞팔로우", "primary", async () => { try { await api(`/api/users/${n.actor_uid}/follow`, { method: "POST" }); drawNotif(box); } catch (e) { toast(e.message); } }) : null))))
      : [h("p", { class: "nempty" }, "새 알림이 없어요")]));
}
$("#bell").onclick = (e) => {
  e.stopPropagation(); if (!needLogin()) return;
  if (isM()) { location.hash = "#/notif"; return; }
  const box = $("#notif"); box.hidden = !box.hidden; $("#bell").setAttribute("aria-expanded", String(!box.hidden));
  if (!box.hidden) drawNotif();
};
document.addEventListener("click", (e) => { if (!e.target.closest("#notif, #bell")) { $("#notif").hidden = true; $("#bell").setAttribute("aria-expanded", "false"); } });
async function doLogout() { try { await api("/api/auth/logout", { method: "POST" }); } catch { /* 이미 만료 */ } ME = null; UNREAD = 0; drawMe(); location.hash = "#/"; toast("로그아웃했어요"); }
$("#me").onclick = (e) => {
  e.stopPropagation();
  if (!ME) return needLogin();
  if (!isM()) return accountMenu(e.currentTarget);
  popMenu(e.currentTarget, [["마이페이지", () => (location.hash = "#/me")], ["설정", () => (location.hash = "#/settings")], ...(NO_LOGIN ? [] : [["로그아웃", doLogout]])]);
};

/* ---------------------------------------------------------------- 로그인 · 회원가입 */
function authLayout(inner) {
  const col = (hs) => h("div", {}, hs.map((x) => h("i", { style: `height:${x}px` })));
  return h("div", { class: "authwrap" }, h("div", { class: "aside-art" }, h("b", {}, "REFFY"), h("div", { class: "art", "aria-hidden": "true" }, col([300, 260, 280]), col([220, 240, 320, 240]), col([360, 340, 250]))), h("div", { class: "formcol" }, h("div", { class: "fbox" }, inner)));
}
const goNext = () => { const n = sessionStorage.getItem("reffy.next") || "#/"; sessionStorage.removeItem("reffy.next"); location.hash = n.startsWith("#/login") || n.startsWith("#/signup") ? "#/" : n; };
const snsRow = () => h("div", { class: "snsrow" }, [["G", "#fff", "#4285f4", "Google"], ["K", "#fee500", "#3c1e1e", "카카오"], ["N", "#03c75a", "#fff", "네이버"], ["X", "#000", "#fff", "X"]].map(([t, bg, fg, n]) =>
  h("button", { type: "button", disabled: true, title: `${n} 로그인은 준비 중이에요`, "aria-label": `${n} 로그인 (준비 중)`, style: `background:${bg};color:${fg}` }, t)));
function loginPage() {
  const uid = h("input", { class: "inp", id: "lu", name: "username", autocomplete: "username", placeholder: "영문과 숫자 6~20자리" });
  const pw = h("input", { class: "inp", id: "lp", name: "password", type: "password", autocomplete: "current-password", placeholder: "8자 이상 입력" });
  const keepc = h("input", { class: "cbx", type: "checkbox", checked: true });
  const msg = h("p", { class: "msg bad", role: "alert" });
  const go = h("button", { class: "cta", type: "submit" }, "로그인");
  const f = h("form", { onsubmit: async (e) => {
    e.preventDefault(); msg.textContent = "";
    if (!uid.value.trim() || !pw.value) { msg.textContent = "아이디와 비밀번호를 입력해 주세요."; return; }
    go.disabled = true;
    try { await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: uid.value.trim(), pw: pw.value, keep: keepc.checked }) }); await loadMe(); goNext(); }
    catch (er) { msg.textContent = er.message; go.disabled = false; }
  } },
    h("h1", {}, "만나서 반가워요"), h("p", { class: "lead" }, "레퍼런스를 모아 정리해 보세요"),
    h("label", { class: "fl", for: "lu", style: "margin-top:0" }, "아이디"), uid, h("label", { class: "fl", for: "lp" }, "비밀번호"), pw, msg,
    h("div", { class: "rowline" }, h("label", {}, keepc, "로그인 상태 유지"), h("button", { class: "linkbtn", type: "button", disabled: true, title: "준비 중이에요", style: "color:var(--ink3)" }, "비밀번호 찾기")),
    go, h("div", { class: "sns" }, "SNS 계정으로 계속하기"), snsRow(), h("p", { class: "foot-link", style: "margin-top:157px" }, "아직 계정이 없나요? ", h("a", { href: "#/signup" }, "회원가입")));
  page(authLayout(f)); uid.focus();
}
function signupPage() {
  const nick = h("input", { class: "inp", id: "sn", maxlength: "20", placeholder: "닉네임 입력", autocomplete: "nickname" });
  const uid = h("input", { class: "inp", id: "su", maxlength: "20", placeholder: "영문과 숫자 6~20자리", autocomplete: "username" });
  const pw = h("input", { class: "inp", id: "sp", type: "password", placeholder: "영문 · 숫자 포함 8자 이상", autocomplete: "new-password" });
  const pw2 = h("input", { class: "inp", id: "sp2", type: "password", placeholder: "비밀번호를 한 번 더 입력", autocomplete: "new-password" });
  const mNick = h("p", { class: "msg" }), mUid = h("p", { class: "msg" }), mPw = h("p", { class: "msg" }), mPw2 = h("p", { class: "msg" }), mAll = h("p", { class: "msg bad", role: "alert" });
  const set = (el, t, k) => { el.textContent = t; el.className = "msg " + (k || ""); };
  let nickOk = "";
  const check = async () => { const v = nick.value.trim(); if (!v) return set(mNick, "닉네임을 입력해 주세요.", "bad"); try { const r = await api("/api/auth/nick-check?nick=" + encodeURIComponent(v)); nickOk = r.ok ? v : ""; set(mNick, r.message, r.ok ? "ok" : "bad"); } catch (e) { set(mNick, e.message, "bad"); } };
  nick.oninput = () => { nickOk = ""; set(mNick, ""); };
  uid.onblur = () => set(mUid, uid.value && !/^[A-Za-z0-9]{6,20}$/.test(uid.value) ? "아이디는 영문과 숫자 6~20자로 입력해 주세요." : "", "bad");
  pw.onblur = () => set(mPw, pw.value && (pw.value.length < 8 || !/[A-Za-z]/.test(pw.value) || !/\d/.test(pw.value)) ? "영문과 숫자를 포함해 8자 이상이어야 해요." : "", "bad");
  pw2.oninput = () => set(mPw2, pw2.value && pw.value !== pw2.value ? "비밀번호가 서로 달라요." : "", "bad");
  const boxes = ["terms", "privacy", "marketing"].map(() => h("input", { class: "cbx", type: "checkbox" }));
  const all = h("input", { class: "cbx", type: "checkbox", onchange: (e) => boxes.forEach((b) => (b.checked = e.target.checked)) });
  boxes.forEach((b) => (b.onchange = () => (all.checked = boxes.every((x) => x.checked))));
  const see = () => modal("약관", h("p", {}, "약관 전문은 서비스 공개 전에 등록할 예정이에요."), h("div", { class: "foot" }, btn("확인", "primary", (e) => e.target.closest(".modal").remove())));
  const row = (cb, t, req) => h("label", {}, cb, t, h("button", { class: "see linkbtn", type: "button", onclick: (e) => { e.preventDefault(); see(); } }, "보기"));
  const go = h("button", { class: "cta", type: "submit" }, "가입하기");
  const f = h("form", { onsubmit: async (e) => {
    e.preventDefault(); set(mAll, "", "bad");
    if (nick.value.trim() !== nickOk) { set(mAll, "닉네임 중복 확인을 해 주세요.", "bad"); return; }
    go.disabled = true;
    try { await api("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nick: nick.value.trim(), uid: uid.value.trim(), pw: pw.value, pw2: pw2.value, terms: boxes[0].checked, privacy: boxes[1].checked, marketing: boxes[2].checked }) }); await loadMe(); toast("가입을 환영해요"); goNext(); }
    catch (er) { set(mAll, er.message, "bad"); go.disabled = false; }
  } },
    h("h1", { style: "margin-bottom:0" }, "회원가입"),
    h("label", { class: "fl", for: "sn" }, "닉네임"), h("div", { class: "nickrow" }, nick, btn("중복 확인", "", check)), mNick,
    h("label", { class: "fl", for: "su", style: "margin-top:8px" }, "아이디"), uid, mUid, h("label", { class: "fl", for: "sp", style: "margin-top:8px" }, "비밀번호"), pw, mPw,
    h("label", { class: "fl", for: "sp2", style: "margin-top:8px" }, "비밀번호 확인"), pw2, mPw2,
    h("div", { class: "terms" }, h("label", { class: "all" }, all, "약관 전체 동의"), row(boxes[0], "[필수] 이용약관 동의"), row(boxes[1], "[필수] 개인정보 수집 · 이용 동의"), row(boxes[2], "[선택] 마케팅 정보 수신 동의")),
    mAll, go, h("p", { class: "foot-link" }, "이미 계정이 있나요? ", h("a", { href: "#/login" }, "로그인")));
  page(authLayout(f)); nick.focus();
}

/* ---------------------------------------------------------------- 라우터 */
let homeLoaded = false;
function showHome() { $("#page").hidden = true; $("#layout").hidden = false; if (!homeLoaded) { homeLoaded = true; reload(); } }
/* ---------------------------------------------------------------- 마이페이지 (프로필 · 팔로워/팔로잉 · 프로필 편집) */
const shortLink = (l) => l.replace(/^https?:\/\//i, "").replace(/\/$/, "");
const compact = (n) => (n >= 10000 ? (n / 1000).toFixed(0) + "k" : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));
async function toggleFollow(uid, on) { await api(`/api/users/${uid}/follow`, { method: on ? "DELETE" : "POST" }); }

function followsDialog(u, kind, after) {
  let cur = kind, list = [], q = "";
  const body = h("div", { class: "fl-body" });
  const tabs = h("div", { class: "fl-tabs", role: "tablist" });
  const m = h("div", { class: "modal", onmousedown: (e) => e.target === m && close() },
    h("div", { class: "dlg fol", role: "dialog", "aria-modal": "true", "aria-label": `${u.uid} 팔로워 / 팔로잉` },
      h("div", { class: "chd" }, h("h2", {}, u.nick), h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => close() }, icon("close", 24))),
      tabs,
      h("label", { class: "fl-search" }, icon("search", 20), h("input", { type: "search", placeholder: "검색", "aria-label": "사용자 검색", oninput: (e) => { q = e.target.value.trim().toLowerCase(); drawList(); } })),
      body));
  const close = () => { m.remove(); after && after(); };
  const drawTabs = () => tabs.replaceChildren(...[["followers", `팔로워 ${compact(u.followers)}`], ["following", `팔로잉 ${compact(u.following)}`]].map(([k, l]) =>
    h("button", { type: "button", role: "tab", class: cur === k ? "on" : "", "aria-selected": String(cur === k), onclick: () => { cur = k; drawTabs(); load(); } }, l)));
  function drawList() {
    const rows = list.filter((x) => !q || x.uid.toLowerCase().includes(q) || x.nick.toLowerCase().includes(q));
    body.replaceChildren(...(rows.length ? rows.map((x) => {
      const isMine = u.me && cur === "following";
      const label = x.isFollowing ? "팔로잉" : (cur === "followers" && u.me ? "맞팔로우" : "팔로우");
      return h("div", { class: "fl-row" },
        h("a", { href: "#/u/" + x.uid, onclick: () => m.remove() }, avatarEl(x, 44)),
        h("a", { class: "fl-name", href: "#/u/" + x.uid, onclick: () => m.remove() }, h("b", {}, x.uid), h("span", {}, x.nick)),
        x.me ? null : h("button", { class: "btn" + (x.isFollowing ? "" : " primary"), type: "button", onclick: async () => {
          if (!ME) return needLogin();
          try { await toggleFollow(x.uid, x.isFollowing); x.isFollowing = !x.isFollowing; if (isMine && !x.isFollowing) { /* 목록에는 남겨 두고 버튼만 바꿈 */ } drawList(); } catch (e) { toast(e.message); }
        } }, label));
    }) : [h("p", { class: "nempty" }, q ? "검색 결과가 없어요" : cur === "followers" ? "아직 팔로워가 없어요" : "아직 팔로잉한 사용자가 없어요")]));
  }
  async function load() { body.replaceChildren(h("p", { class: "nempty" }, "불러오는 중…")); try { list = (await api(`/api/users/${u.uid}/follows?kind=${cur}`)).items; } catch (e) { list = []; toast(e.message); } drawList(); }
  drawTabs(); document.body.append(m); load();
}

async function profilePage(uid) {
  const root = h("div", { class: "pf" }); page(root);
  let u, tab = "posts", posts = [], books = [], scope = "";
  async function loadAll() {
    u = await api("/api/users/" + uid);
    posts = (await api(`/api/users/${uid}/posts?limit=100` + (u && u.me && scope ? "&scope=" + scope : ""))).items;
    books = u.me ? (await api(`/api/users/${uid}/books`)).items : [];
  }
  function draw() {
    const links = u.links.length ? h("div", { class: "pf-links" }, h("h2", {}, "링크"), h("ul", {}, u.links.map((l) => h("li", {}, icon("link", 18), h("a", { href: l, target: "_blank", rel: "noopener noreferrer nofollow" }, shortLink(l)))))) : null;
    const stat = (n, l, fn) => (fn ? h("button", { class: "pf-stat", type: "button", onclick: fn }, h("b", {}, compact(n)), h("span", {}, l)) : h("span", { class: "pf-stat" }, h("b", {}, compact(n)), h("span", {}, l)));
    const blockAsk = async () => {
      if (!needLogin()) return;
      if (!(await confirmDialog(`${u.nick}님을 차단할까요?`, "차단하면 서로의 게시물과 프로필을 볼 수 없어요. 설정 > 차단 유저에서 언제든 해제할 수 있어요.", { ok: "차단하기", danger: true }))) return;
      try { await api(`/api/users/${u.uid}/block`, { method: "POST" }); toast("차단했어요"); await loadAll(); draw(); } catch (e) { toast(e.message); }
    };
    const unblock = async () => { try { await api(`/api/users/${u.uid}/block`, { method: "DELETE" }); toast("차단을 해제했어요"); await loadAll(); draw(); } catch (e) { toast(e.message); } };
    const moreBtn = u.me ? null : h("span", { class: "vdots pf-more" }, h("button", { class: "icon-btn", type: "button", "aria-label": "더보기", onclick: (e) => { e.stopPropagation(); menuCard(e.currentTarget, [
      u.blocked ? { label: "차단 해제", fn: unblock } : { label: "차단하기", fn: blockAsk }, { label: "신고하기", danger: true, fn: () => reportSheet("user", u.uid) }]); } }, icon("more", 24)));
    const acts = u.me
      ? h("div", { class: "pf-acts" }, btn(isM() ? "프로필 수정" : "프로필 편집", "", () => (location.hash = "#/me/edit")), btn("+ 새 게시물 업로드", "primary up", () => openUpload()))
      : u.blocked ? h("div", { class: "pf-acts" }, btn("차단 해제", "", unblock))
      : h("div", { class: "pf-acts" }, btn(u.isFollowing ? "팔로잉" : "팔로우", u.isFollowing ? "" : "primary", async () => { if (!ME) return needLogin(); try { await toggleFollow(u.uid, u.isFollowing); await loadAll(); draw(); } catch (e) { toast(e.message); } }));
    const tabBtn = (k, l, sc = "") => { const on = tab === k && (k !== "posts" || scope === sc); return h("button", { class: "pf-tab" + (on ? " on" : ""), type: "button", role: "tab", "aria-selected": String(on), onclick: async () => { tab = k; if (k === "posts" && scope !== sc) { scope = sc; try { await loadAll(); } catch (e) { toast(e.message); } } draw(); } }, l); };
    const cell = (it) => h("button", { class: "pf-cell", type: "button", "aria-label": it.title || "레퍼런스 이미지", onclick: () => (isM() ? goPost(it.id) : postModal(it.id, async () => { await loadAll(); draw(); })) }, h("img", { src: it.thumb, alt: it.title || "", loading: "lazy" }), it.private ? h("span", { class: "prv" }, "비공개") : null);
    const grid = u.blocked ? notice("차단한 유저예요", `차단을 해제하면 ${u.nick}님의 게시물을 다시 볼 수 있어요.`) : tab === "posts"
      ? (posts.length && isM() ? pgrid(posts, {}, "c2") : posts.length ? h("div", { class: "pf-grid" }, posts.map(cell))
        : notice(scope === "private" ? "비공개 게시물이 없어요" : scope === "public" ? "공개 게시물이 없어요" : "아직 올린 게시물이 없어요", u.me ? "첫 레퍼런스를 올리면 AI가 태그를 붙여 줘요." : "", u.me ? btn("+ 업로드", "primary", () => openUpload()) : null))
      : (books.length ? h("div", { class: "pf-grid" }, books.map((b) => h("button", { class: "pf-cell book", type: "button", "aria-label": `${b.name} 열기`, onclick: () => (location.hash = "#/drawer/book/" + b.id) },
        b.cover ? h("img", { src: b.cover, alt: "" }) : (b.covers[0] ? h("img", { src: `/img/${b.covers[0]}?s=thumb`, alt: "" }) : h("span", { class: "ph" })), h("span", { class: "bn" }, h("b", {}, b.name), h("span", {}, `${b.count}개`)))))
        : notice("아직 북이 없어요", "서랍에서 새 북을 만들어 보세요.", btn("서랍으로", "primary", () => (location.hash = "#/drawer"))));
    root.replaceChildren(
      isM() ? (u.me ? mbar("마이페이지", { big: true, right: [h("button", { class: "icon-btn", type: "button", "aria-label": "게시물 등록", onclick: () => openUpload() }, icon("plus", 26)), h("a", { class: "icon-btn", href: "#/settings", "aria-label": "설정" }, icon("settings", 24))] })
        : mbar("", { back: true, right: [moreBtn] })) : "",
      h("div", { class: "pf-banner" + (u.cover ? " has" : "") }, u.cover ? h("img", { src: u.cover, alt: "" }) : null, isM() ? null : pcBack("#/", "on-banner")),
      h("div", { class: "pf-body" },
        h("aside", { class: "pf-side" },
          avatarEl(u, 134, "pf-av"), isM() ? null : moreBtn,
          h("div", { class: "pf-name" }, h("h1", {}, u.nick), h("span", {}, "@" + u.uid)),
          h("div", { class: "pf-stats" }, stat(u.posts, "게시물"), stat(u.followers, "팔로워", () => followsDialog(u, "followers", refresh)), stat(u.following, "팔로잉", () => followsDialog(u, "following", refresh))),
          h("div", { class: "pf-mid" }, u.bio ? h("p", { class: "pf-bio" }, u.bio) : null, acts),
          links),
        h("section", { class: "pf-main" },
          h("div", { class: "pf-tabs", role: "tablist" }, u.me ? [tabBtn("posts", "전체", ""), tabBtn("posts", isM() ? "공개" : "공개 게시물", "public"), tabBtn("posts", isM() ? "비공개" : "비공개 게시물", "private"), tabBtn("books", `북 ${u.books}`)] : tabBtn("posts", isM() ? `게시물 ${u.posts}` : "게시물")),
          grid)));
  }
  const refresh = async () => { try { await loadAll(); draw(); } catch { /* 유지 */ } };
  try { await loadAll(); draw(); } catch (e) { root.replaceChildren(notice("프로필을 찾을 수 없어요", e.message, btn("홈으로", "primary", () => (location.hash = "#/")))); }
}

async function profileEdit() {
  if (!needLogin()) return;
  const root = h("div", { class: "pe" }); page(root);
  let u; try { u = await api("/api/users/" + ME.uid); } catch (e) { root.replaceChildren(notice("불러오지 못했어요", e.message)); return; }
  let links = [...u.links], avatar = u.avatar;
  const avBox = h("div", { class: "pe-av" });
  const nick = h("input", { class: "inp", id: "peNick", value: u.nick, maxlength: "20", placeholder: "입력해 주세요", "aria-label": "닉네임" });
  const bio = h("textarea", { class: "inp ta", maxlength: "100", placeholder: "한 줄 소개를 입력하세요 (최대 100자)", "aria-label": "소개" }, u.bio);
  const pickAv = async (e) => {
    const f = e.target.files[0]; if (!f) return; if (f.size > 5 << 20) return toast("5MB 이하의 이미지만 올릴 수 있어요.");
    const fd = new FormData(); fd.append("file", f);
    try { const r = await api("/api/me/avatar", { method: "POST", body: fd }); avatar = r.avatar; await loadMe(); drawAv(); toast("프로필 사진을 바꿨어요"); } catch (er) { toast(er.message); }
  };
  const file = h("input", { type: "file", accept: "image/jpeg,image/png", hidden: true, onchange: pickAv });
  const delAv = async () => { try { await api("/api/me/avatar", { method: "DELETE" }); avatar = null; await loadMe(); drawAv(); } catch (er) { toast(er.message); } };
  const cam = h("input", { type: "file", accept: "image/*", capture: "user", hidden: true, onchange: pickAv });
  const avMenu = (e) => (isM() ? sheetMenu("프로필 사진", [{ ic: "image", label: "앨범에서 선택", fn: () => file.click() }, { ic: "camera", label: "사진 찍기", fn: () => cam.click() }, ...(avatar ? [{ ic: "trash", label: "기본 이미지로 변경", fn: delAv }] : [])])
    : avatar ? menuCard(e.currentTarget, [{ ic: "image", label: "앨범에서 선택", fn: () => file.click() }, { ic: "trash", label: "기본 이미지로 변경", fn: delAv }]) : file.click());
  const drawAv = () => avBox.replaceChildren(h("button", { class: "pe-avb", type: "button", "aria-label": "프로필 사진 변경", onclick: avMenu }, avatarEl({ nick: nick.value || u.nick, avatar }, isM() ? 96 : 88, "pe-avt"), h("i", {}, icon("camera", 16))), cam,
    h("div", { class: "pe-avtx" }, isM() ? null : h("span", { class: "pe-lbl" }, "프로필 이미지"), h("div", { class: "pe-avbtns" }, btn("사진 변경", "", avMenu), avatar ? btn("삭제", "alt", delAv) : null), h("span", {}, "JPG · PNG, 5MB 이하"), file));
  /* 헤더(커버) 이미지 (HOM_0501_01 · 0501_02): 헤더 변경 → 앨범에서 선택 / 기본 이미지로 변경 */
  let cover = u.cover;
  const cvBox = h("div", { class: "pe-cv" });
  const cvFile = h("input", { type: "file", accept: "image/jpeg,image/png", hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return; if (f.size > 10 << 20) return toast("10MB 이하의 이미지만 올릴 수 있어요.");
    const fd = new FormData(); fd.append("file", f);
    try { cover = (await api("/api/me/cover", { method: "POST", body: fd })).cover; drawCv(); toast("헤더 이미지를 바꿨어요"); } catch (er) { toast(er.message); } } });
  const delCv = async () => { try { await api("/api/me/cover", { method: "DELETE" }); cover = null; drawCv(); toast("기본 이미지로 바꿨어요"); } catch (er) { toast(er.message); } };
  const cvMenu = (e) => (isM() ? sheetMenu("헤더 이미지", [{ ic: "image", label: "앨범에서 선택", fn: () => cvFile.click() }, ...(cover ? [{ ic: "trash", label: "기본 이미지로 변경", fn: delCv }] : [])])
    : cover ? menuCard(e.currentTarget, [{ ic: "image", label: "앨범에서 선택", fn: () => cvFile.click() }, { ic: "trash", label: "기본 이미지로 변경", fn: delCv }]) : cvFile.click());
  const drawCv = () => cvBox.replaceChildren(h("label", { class: "pe-lbl" }, "헤더 이미지"),
    h("div", { class: "pe-cvimg" + (cover ? " has" : "") }, cover ? h("img", { src: cover, alt: "" }) : null,
      h("button", { class: "pe-cvbtn", type: "button", onclick: cvMenu }, icon("camera", 16), "헤더 변경")),
    h("span", { class: "pe-cap" }, "권장 1440 × 260px · JPG · PNG, 10MB 이하"), cvFile);
  drawCv();
  const linkBox = h("div", { class: "pe-links" });
  const drawLinks = () => { linkCnt.textContent = `${links.length} / 5`; linkBox.replaceChildren(...links.map((l, i) => h("div", { class: "pe-link" }, icon("link", 20),
      h("input", { value: l, "aria-label": `외부 링크 ${i + 1}`, placeholder: "https://", maxlength: "120", oninput: (e) => (links[i] = e.target.value) }),
      h("button", { type: "button", "aria-label": "링크 삭제", onclick: () => { links.splice(i, 1); drawLinks(); } }, icon("close", 20)))),
    links.length < 5 ? h("button", { class: "pe-add", type: "button", onclick: () => { links.push(""); drawLinks(); linkBox.querySelectorAll("input")[links.length - 1]?.focus(); } }, icon("plus", 20), "링크 추가") : null);};
  const nickMsg = h("p", { class: "pe-hint" }, "다른 유저와 중복되지 않는 닉네임을 입력해 주세요. (2~20자)");
  const nickBtn = btn("중복 확인", "", async () => {
    const v = nick.value.trim();
    if (v === u.nick) { nickMsg.className = "pe-hint"; nickMsg.textContent = "지금 쓰고 있는 닉네임이에요."; nick.classList.remove("err"); return; }
    try { const r = await api("/api/auth/nick-check?nick=" + encodeURIComponent(v)); nickMsg.className = "pe-hint " + (r.ok ? "ok" : "err"); nickMsg.textContent = r.message; nick.classList.toggle("err", !r.ok); } catch (er) { toast(er.message); }
  });
  nick.addEventListener("input", () => { nick.classList.remove("err"); nickMsg.className = "pe-hint"; nickMsg.textContent = "다른 유저와 중복되지 않는 닉네임을 입력해 주세요. (2~20자)"; });
  const bioCnt = h("span", { class: "pe-cnt" }, `${bio.value.length}/100`);
  bio.addEventListener("input", () => (bioCnt.textContent = `${bio.value.length}/100`));
  const linkCnt = h("span", {}, "");
  drawAv(); drawLinks();
  const save = async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    try { await api("/api/me/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nick: nick.value, bio: bio.value, links: links.filter((x) => x.trim()) }) }); await loadMe(); toast("프로필을 저장했어요"); location.hash = "#/me"; }
    catch (er) { toast(er.message); b.disabled = false; }
  };
  root.replaceChildren(isM() ? mbar("프로필 수정", { back: () => (location.hash = "#/me"), right: [h("button", { class: "linkbtn", type: "button", onclick: save }, "저장")] }) : "", isM() ? h("h1", {}, "프로필 편집") : h("div", { class: "pc-head" }, pcBack("#/me"), h("h1", {}, "프로필 편집")), cvBox, avBox,
    h("div", { class: "pe-f" }, h("label", { for: "peNick" }, "닉네임"), h("div", { class: "pe-nick" }, nick, nickBtn), nickMsg),
    h("div", { class: "pe-f s" }, h("label", {}, "소개"), bio, bioCnt),
    h("div", { class: "pe-lh" }, h("h2", {}, "외부 링크"), linkCnt), linkBox,
    h("div", { class: "pe-ft" }, btn("취소", "l", () => (location.hash = "#/me")), btn("저장", "primary l", save)));
}

function route() {
  const [, a = "", b = "", c = ""] = (location.hash.slice(1) || "/").split("/");
  document.body.classList.toggle("auth", a === "login" || a === "signup");
  if (a !== "post") route.prev = location.hash || "#/";
  document.body.classList.toggle("route-home", a === "" || a === "post");
  document.body.classList.toggle("no-tab", a === "login" || a === "signup" || (a === "me" && b === "edit") || (a === "settings" && ["inquiry", "privacy", "terms", "leave"].includes(b)));
  document.querySelectorAll("#mtab a").forEach((l) => { const on = l.dataset.r === (a === "post" || a === "notif" ? "" : a === "settings" ? "me" : a); l.classList.toggle("on", on); on ? l.setAttribute("aria-current", "page") : l.removeAttribute("aria-current"); });
  document.documentElement.classList.remove("m-search");
  document.querySelectorAll(".mcard, .pop-menu, .modal.msheet").forEach((x) => x.remove());
  if (a !== "post") document.documentElement.classList.remove("m-detail");
  document.querySelectorAll("#nav a").forEach((l) => { const on = l.dataset.r === (a === "post" ? "" : a); l.classList.toggle("on", on); on ? l.setAttribute("aria-current", "page") : l.removeAttribute("aria-current"); });
  $("#notif").hidden = true;
  if ((ME || NO_LOGIN) && (a === "login" || a === "signup")) { location.hash = "#/"; return; }
  if (a === "login") loginPage();
  else if (a === "signup") signupPage();
  else if (a === "keep") keepPage();
  else if (a === "drawer") drawerPage(b, +c);
  else if (a === "notif") notifPage();
  else if (a === "settings") settingsPage(b);
  else if (a === "me" && !ME) needLogin();
  else if (a === "me" && b === "edit") profileEdit();
  else if (a === "me") profilePage(ME.uid);
  else if (a === "u" && b) profilePage(decodeURIComponent(b));
  else if (a === "post" && +b) { showHome(); openDetail(+b); }
  else { showHome(); if (!$("#panel").hidden) closeDetail(); }
}
$("#home").onclick = (e) => { e.preventDefault(); if (location.hash && location.hash !== "#/") location.hash = "#/"; else { $("#reset").click(); closeDetail(); } };
window.addEventListener("hashchange", route);
setInterval(() => { if (ME) loadMe().catch(() => {}); }, 60000);
(async () => {
  try { await loadMe(); } catch { /* 서버에 연결되지 않음 */ }
  try { await loadVocab(); } catch (e) { $("#empty").hidden = false; $("#empty").replaceChildren(h("h2", {}, "서비스에 연결하지 못했어요"), h("p", {}, e.message)); }
  route();
})();

/* ---------------------------------------------------------------- 내 설정 · PC (HOM_0502_01 ~ 07) */
const SET_DOCS = {
  privacy: ["개인정보 처리 방침", [
    ["1. 수집하는 개인정보", "REFFY는 회원가입과 서비스 제공을 위해 이메일, 닉네임, 프로필 이미지, 연결된 소셜 계정 식별자를 수집합니다. 서비스 이용 과정에서 게시물, 댓글, 접속 기록이 생성될 수 있습니다."],
    ["2. 개인정보의 이용 목적", "수집한 정보는 회원 식별, 레퍼런스 검색과 추천, 알림 발송, 신고 처리 및 서비스 개선에만 이용합니다."],
    ["3. 보관 및 파기", "회원 탈퇴 시 개인정보는 지체 없이 파기합니다. 단, 관계 법령에 따라 보관이 필요한 정보는 정해진 기간 동안 안전하게 보관한 뒤 파기합니다."],
    ["4. 제3자 제공", "REFFY는 이용자의 동의 없이 개인정보를 외부에 제공하지 않습니다. 법령에 근거한 요청이 있는 경우에만 예외적으로 제공할 수 있습니다."],
    ["5. 문의처", "개인정보 관련 문의는 내 설정 > 문의하기에서 접수할 수 있습니다."]]],
  terms: ["서비스 약관", [
    ["제1조 (목적)", "이 약관은 REFFY가 제공하는 레퍼런스 검색·공유 서비스의 이용 조건과 절차, 회원과 회사의 권리와 의무를 정하는 것을 목적으로 합니다."],
    ["제2조 (게시물의 권리)", "회원이 올린 게시물의 저작권은 해당 회원에게 있습니다. 회원은 본인이 권리를 가진 이미지만 업로드해야 하며, 타인의 권리를 침해한 게시물은 삭제될 수 있습니다."],
    ["제3조 (금지 행위)", "타인의 계정 도용, 무단 복제 및 재배포, 스팸 게시, 다른 이용자에 대한 괴롭힘 등 서비스 운영을 방해하는 행위를 금지합니다."],
    ["제4조 (이용 제한)", "금지 행위가 확인되면 게시물 숨김, 이용 정지, 탈퇴 처리 등의 조치를 할 수 있습니다."],
    ["제5조 (탈퇴)", "회원은 언제든지 내 설정 > 탈퇴하기에서 탈퇴할 수 있으며, 탈퇴 즉시 계정과 게시물이 삭제됩니다."]]],
};
const SET_MENU = [["notif", "알림 설정"], ["account", "계정 관리"], ["blocks", "차단 유저"], ["inquiry", "문의하기"], ["privacy", "개인정보 처리 방침"], ["terms", "서비스 약관"]];
const ymd = (s) => { const d = new Date(s); return isNaN(d) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
const hm12 = (v) => { const [H, M] = v.split(":").map(Number); return `${H < 12 ? "오전" : "오후"} ${H % 12 || 12}:${String(M).padStart(2, "0")}`; };

async function settingsPC(sub) {
  sub = sub || "notif";
  if (sub === "security") sub = "account";
  const main = h("div", { class: "st-main" });
  const snb = h("nav", { class: "st-snb", "aria-label": "내 설정" }, h("div", { class: "pc-head" }, pcBack("#/me"), h("h1", {}, "내 설정")),
    SET_MENU.map(([k, l]) => h("a", { href: "#/settings/" + k, class: sub === k ? "on" : "", "aria-current": sub === k ? "page" : null }, l)),
    h("i", { class: "st-div" }), h("a", { href: "#/settings/leave", class: "st-leave" + (sub === "leave" ? " on" : ""), "aria-current": sub === "leave" ? "page" : null }, "탈퇴하기"));
  const root = h("div", { class: "st" }, snb, main);
  const stay = !$("#page").hidden && $("#page > .st");   // 이미 설정 화면이면 내용이 준비된 뒤에 바꿔 끼움
  if (!stay) page(root);
  const head = (t, d) => h("div", { class: "st-head" }, h("h2", {}, t), d ? h("p", {}, d) : null);
  const show = (...kids) => { main.replaceChildren(h("div", { class: "st-c" }, ...kids.flat(3).filter((k) => k != null && k !== false))); if (!root.isConnected && location.hash.startsWith("#/settings")) page(root); };
  const toggle = (on, fn, label) => { const i = h("input", { type: "checkbox", class: "st-tg-in", role: "switch", checked: on, "aria-label": label, onchange: (e) => fn(e.target.checked) }); return h("label", { class: "st-tg" }, i, h("i", {})); };
  const row = (t, d, right) => h("div", { class: "st-row" }, h("div", { class: "st-tx" }, h("b", {}, t), d ? h("small", {}, d) : null), right);
  const group = (t, ...rows) => h("section", { class: "st-grp" }, h("h3", {}, t), ...rows);
  try {
    if (sub === "notif") {
      const st = await api("/api/me/settings"); const n = st.notif; let dnd = st.dnd || "";
      const save = async () => { try { await api("/api/me/settings", jsonOpt("PUT", { notif: n, dnd })); } catch (e) { toast(e.message); } };
      const set = (k) => (v) => { n[k] = v; save(); };
      const [f0, t0] = (dnd || "23:00-08:00").split("-");
      const times = []; for (let m = 0; m < 1440; m += 30) times.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
      const sel = (v, label) => h("span", { class: "st-time" }, h("select", { "aria-label": label, onchange: () => { if (dnd) { dnd = `${from.value}-${to.value}`; save(); } } }, times.map((t) => h("option", { value: t, selected: t === v }, hm12(t)))), icon("chevronDown", 18));
      const fromW = sel(f0, "방해 금지 시작 시간"), toW = sel(t0, "방해 금지 끝 시간"); const from = fromW.querySelector("select"), to = toW.querySelector("select");
      const range = h("div", { class: "st-range", hidden: !dnd }, fromW, h("span", {}, "~"), toW);
      return show(head("알림 설정", "받고 싶은 알림을 선택하세요."),
        group("활동 알림", row("팔로워", "누군가 나를 팔로우하면 알려드려요.", toggle(n.follow, set("follow"), "팔로워 알림")),
          row("댓글", "내 게시물에 댓글이 달리면 알려드려요.", toggle(n.comment, set("comment"), "댓글 알림")),
          row("대댓글", "내 댓글에 답글이 달리면 알려드려요.", toggle(n.reply !== false, set("reply"), "대댓글 알림")),
          row("하트", "내 게시물에 하트가 눌리면 알려드려요.", toggle(n.like, set("like"), "하트 알림"))),
        group("알림 수신 시간", row("방해 금지 시간", "설정한 시간에는 알림을 보내지 않아요.", toggle(!!dnd, (v) => { dnd = v ? `${from.value}-${to.value}` : ""; range.hidden = !v; save(); }, "방해 금지 시간")), range));
    }
    if (sub === "account") {
      const a = await api("/api/me/account");
      const info = (k, v) => h("div", { class: "st-row st-kv" }, h("b", {}, k), h("span", {}, v));
      const sns = (name) => h("div", { class: "st-row st-sns" }, h("span", { class: "st-sic", "aria-hidden": "true" }), h("div", { class: "st-tx" }, h("b", {}, name), h("small", {}, "연결되지 않음")),
        h("button", { class: "st-sbtn", type: "button", onclick: () => toast("소셜 계정 연결은 준비 중이에요") }, "연결하기"));
      return show(head("계정 관리", "로그인에 연결된 계정 정보를 확인하세요."),
        group("기본 정보", info("아이디", "@" + a.uid), info("이메일", a.email || "등록된 이메일이 없어요"), info("가입일", ymd(a.created))),
        group("연결된 계정", ["Google", "카카오", "네이버", "X"].map(sns)),
        h("p", { class: "st-note" }, "연결된 계정이 하나뿐이면 연결을 해제할 수 없어요."));
    }
    if (sub === "blocks") {
      const d = await api("/api/me/blocks");
      const un = async (x) => {
        if (!(await confirmDialog(`${x.uid}님의 차단을 해제할까요?`, "차단을 해제하면 서로의 프로필과 게시물을 다시 볼 수 있어요.", { ok: "해제하기" }))) return;
        try { await api(`/api/users/${x.uid}/block`, { method: "DELETE" }); toast("차단을 해제했어요"); settingsPC("blocks"); } catch (e) { toast(e.message); }
      };
      return show(head("차단 유저", "차단한 유저는 내 게시물과 프로필을 볼 수 없어요."),
        d.items.length ? group(`차단한 유저 ${d.items.length}`, d.items.map((x) => h("div", { class: "st-row st-user" }, avatarEl(x, 40),
          h("a", { class: "st-tx", href: "#/u/" + x.uid }, h("b", {}, x.uid), h("small", {}, [x.nick, x.at ? ymd(x.at) + " 차단" : ""].filter(Boolean).join(" · "))),
          h("button", { class: "st-sbtn", type: "button", onclick: () => un(x) }, "차단 해제"))))
          : h("div", { class: "st-empty" }, h("b", {}, "차단한 유저가 없어요"), h("p", {}, "프로필의 더보기 메뉴에서 차단할 수 있어요.")));
    }
    if (sub === "inquiry") {
      let kind = ""; const photos = [];
      const chips = h("div", { class: "st-chips", role: "radiogroup", "aria-label": "문의 유형" });
      const drawChips = () => chips.replaceChildren(...["계정", "게시물", "신고", "서비스 오류", "기타"].map((k) => h("button", { type: "button", role: "radio", "aria-checked": String(kind === k), class: "st-chip" + (kind === k ? " on" : ""), onclick: () => { kind = k; drawChips(); } }, k)));
      drawChips();
      const email = h("input", { class: "st-inp", id: "iqMail", type: "email", placeholder: "답변 받을 이메일을 입력해 주세요", autocomplete: "email", maxlength: "120" });
      const title = h("input", { class: "st-inp", id: "iqTitle", placeholder: "제목을 입력해 주세요", maxlength: "100" });
      const body = h("textarea", { class: "st-ta", id: "iqBody", maxlength: "1000", placeholder: "문의 내용을 자세히 적어주세요. (최대 1,000자)" });
      const file = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: () => { for (const f of file.files) { if (photos.length >= 3) { toast("사진은 최대 3장까지 첨부할 수 있어요."); break; } if (f.size > 10 * 1024 * 1024) { toast("사진은 한 장에 10MB 이하로 올려 주세요."); continue; } photos.push({ f, url: URL.createObjectURL(f) }); } file.value = ""; drawPh(); } });
      const ph = h("div", { class: "st-photos" });
      const drawPh = () => ph.replaceChildren(...photos.map((p, i) => h("span", { class: "st-ph" }, h("img", { src: p.url, alt: `첨부 사진 ${i + 1}` }), h("button", { type: "button", "aria-label": "사진 빼기", onclick: () => { photos.splice(i, 1); drawPh(); } }, icon("close", 14)))),
        photos.length < 3 ? h("button", { class: "st-add", type: "button", "aria-label": "사진 첨부", onclick: () => file.click() }, icon("plus", 24)) : null, file);
      drawPh();
      const send = async (e) => {
        e.preventDefault();
        if (!kind) return toast("문의 유형을 선택해 주세요.");
        if (body.value.trim().length < 5) return toast("문의 내용을 5자 이상 적어 주세요.");
        const fd = new FormData(); fd.append("kind", kind); fd.append("email", email.value.trim()); fd.append("title", title.value.trim()); fd.append("body", body.value.trim());
        photos.forEach((p) => fd.append("photos", p.f));
        try { await api("/api/inquiries", { method: "POST", body: fd }); toast("문의를 보냈어요"); settingsPC("inquiry"); } catch (er) { toast(er.message); }
      };
      return show(head("문의하기", "답변은 입력한 이메일로 영업일 기준 3일 이내에 보내드려요."),
        h("form", { class: "st-form", onsubmit: send },
          h("div", { class: "st-f" }, h("span", { class: "st-lb" }, "문의 유형"), chips),
          h("div", { class: "st-f" }, h("label", { class: "st-lb dk", for: "iqMail" }, "답변 받을 이메일"), email),
          h("div", { class: "st-f" }, h("label", { class: "st-lb dk", for: "iqTitle" }, "제목"), title),
          h("div", { class: "st-f" }, h("label", { class: "st-lb", for: "iqBody" }, "내용"), body),
          h("div", { class: "st-f" }, h("span", { class: "st-lb" }, "사진 첨부", h("small", {}, "선택 · 최대 3장")), ph),
          h("div", { class: "st-foot" }, h("button", { class: "st-btn", type: "submit" }, "문의 보내기"))));
    }
    if (sub === "privacy" || sub === "terms") {
      const [t, items] = SET_DOCS[sub];
      return show(head(t, "시행일 2026.11.01"), h("article", { class: "st-doc" }, items.map(([a, b]) => h("section", {}, h("h3", {}, a), h("p", {}, b)))),
        h("button", { class: "st-prev", type: "button", onclick: () => toast("이전 버전이 없어요") }, "이전 버전 보기", icon("chevR", 16)));
    }
    if (sub === "leave") {
      let posts = 0; try { posts = (await api("/api/users/" + encodeURIComponent(ME.uid))).posts || 0; } catch { /* 개수 없이 */ }
      let why = ""; const ok = h("input", { type: "checkbox", class: "st-cbx", id: "lvOk", onchange: () => (go.disabled = !ok.checked) });
      const pw = NO_LOGIN ? null : h("input", { class: "st-inp", id: "lvPw", type: "password", placeholder: "본인 확인을 위해 비밀번호를 입력해 주세요", autocomplete: "current-password" });
      const radios = h("div", { class: "st-radios", role: "radiogroup", "aria-label": "떠나시는 이유" },
        ["자주 사용하지 않아요", "원하는 레퍼런스를 찾기 어려워요", "다른 서비스를 이용해요", "개인정보가 걱정돼요", "기타"].map((r) =>
          h("label", { class: "st-radio" }, h("input", { type: "radio", name: "lvWhy", value: r, onchange: () => (why = r) }), h("i", {}), r)));
      const go = h("button", { class: "st-btn danger", type: "button", disabled: true, onclick: async () => {
        if (!ok.checked) return toast("안내 사항을 확인해 주세요.");
        if (pw && !pw.value) return toast("비밀번호를 입력해 주세요.");
        if (!(await confirmDialog("정말 탈퇴할까요?", "탈퇴하면 계정과 게시물이 바로 삭제되며 다시 복구할 수 없어요.", { ok: "탈퇴하기", danger: true }))) return;
        try { await api("/api/me/leave", jsonOpt("POST", { pw: pw ? pw.value : "", reason: why })); ME = null; UNREAD = 0; location.hash = "#/"; toast("탈퇴가 완료됐어요"); if (NO_LOGIN) setTimeout(() => location.reload(), 900); else drawMe(); } catch (er) { toast(er.message); }
      } }, "탈퇴하기");
      return show(head("탈퇴하기", "탈퇴하기 전에 아래 내용을 꼭 확인해 주세요."),
        h("div", { class: "st-notice" }, h("b", {}, "탈퇴하면 이렇게 돼요"), h("p", {}, `· 내 게시물 ${posts}개, 북, 킵 스페이스에 담은 레퍼런스가 모두 삭제돼요.`), h("p", {}, "· 팔로워·팔로잉 관계와 알림 내역이 사라져요."), h("p", {}, "· 삭제된 정보는 다시 복구할 수 없어요.")),
        h("div", { class: "st-reason" }, h("div", { class: "st-rh" }, h("b", {}, "떠나시는 이유를 알려주세요"), h("small", { "data-en": "Optional" }, "선택")), radios),
        pw ? h("div", { class: "st-f" }, h("label", { class: "st-lb dk", for: "lvPw" }, "비밀번호"), pw) : null,
        h("label", { class: "st-agree", for: "lvOk" }, ok, h("span", { class: "st-cbx-ui" }, icon("check", 14)), "위 안내 사항을 모두 확인했어요."),
        h("div", { class: "st-foot" }, go));
    }
    location.hash = "#/settings/notif";
  } catch (e) { show(h("div", { class: "st-empty" }, h("b", {}, "불러오지 못했어요"), h("p", {}, e.message))); }
}

/* ---------------------------------------------------------------- 프로필 메뉴 (HOM_0503: 마이페이지 · 설정 · 언어 · 로그아웃) */
function accountMenu(anchor) {
  const old = document.querySelector(".acct"); if (old) { old.remove(); return; }
  const r = anchor.getBoundingClientRect();
  const lang = (window.REFFY_LANG && REFFY_LANG.get()) || "ko";
  const seg = h("span", { class: "acct-seg", role: "radiogroup", "aria-label": "언어" }, [["ko", "KOR"], ["en", "ENG"]].map(([k, l]) =>
    h("button", { type: "button", role: "radio", "aria-checked": String(lang === k), class: lang === k ? "on" : "", "data-i18n-skip": "1", onclick: (e) => { e.stopPropagation(); seg.querySelectorAll("button").forEach((b) => { const on = b === e.currentTarget; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }); if (window.REFFY_LANG) REFFY_LANG.set(k); } }, l)));
  const go = (fn) => () => { m.remove(); fn(); };
  const m = h("div", { class: "acct", role: "menu", style: `right:${Math.max(8, window.innerWidth - r.right)}px;top:${r.bottom + 12}px`, onclick: (e) => e.stopPropagation() },
    h("div", { class: "acct-me" }, avatarEl(ME, 40), h("span", {}, h("b", {}, ME.nick), h("small", {}, "@" + ME.uid))),
    h("button", { type: "button", role: "menuitem", class: "acct-it", onclick: go(() => (location.hash = "#/me")) }, icon("user", 20), "마이페이지"),
    h("button", { type: "button", role: "menuitem", class: "acct-it", onclick: go(() => (location.hash = "#/settings")) }, icon("settings", 20), "설정"),
    h("div", { class: "acct-lang" }, h("span", {}, "언어"), seg),
    ...(NO_LOGIN ? [] : [h("i", { class: "acct-div" }), h("button", { type: "button", role: "menuitem", class: "acct-out", onclick: go(async () => { if (await confirmDialog("로그아웃할까요?", "다시 로그인하면 이어서 이용할 수 있어요.", { ok: "로그아웃" })) doLogout(); }) }, "로그아웃")]));
  document.body.append(m);
  window.addEventListener("hashchange", () => m.remove(), { once: true });
  const close = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("click", close); } };
  setTimeout(() => document.addEventListener("click", close), 0);
  const esc = (e) => { if (e.key === "Escape") { m.remove(); document.removeEventListener("keydown", esc); anchor.focus(); } };
  document.addEventListener("keydown", esc);
}

/* ---------------------------------------------------------------- 게시물 모달 · PC (HOM_0501_05 / COM_0102 / COM_0102_04)
   마이페이지 등에서 게시물을 누르면 페이지를 떠나지 않고 가운데 모달로 보여 줌 */
async function postModal(id, onChange) {
  let d;
  try { const [a, so] = await Promise.all([api("/api/images/" + id), api("/api/images/" + id + "/social")]); d = a; d.so = so; }
  catch (e) { return toast(e.message); }
  const m = h("div", { class: "modal pm-wrap", onmousedown: (e) => e.target === m && m.remove() });
  const right = h("div", { class: "pm-r" });
  const box = h("div", { class: "pm", role: "dialog", "aria-modal": "true", "aria-label": d.title || "게시물" },
    h("div", { class: "pm-l" }, h("button", { class: "pm-img", type: "button", "aria-label": "이미지 크게 보기", onclick: () => openLightbox(d.full, d.title) }, h("img", { src: d.full, alt: d.title || "레퍼런스 이미지" }))), right);
  m.append(box);
  const refresh = async () => { try { d.so = await api(`/api/images/${d.id}/social`); draw(); } catch (e) { toast(e.message); } };
  const act = async (method, url, body, msg) => {
    if (!needLogin()) return;
    try { await api(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); if (msg) toast(msg); await refresh(); } catch (e) { toast(e.message); }
  };
  const removeIt = async () => {
    if (!(await confirmDialog("게시물을 삭제할까요?", "삭제한 게시물은 다시 복구할 수 없어요.", { ok: "삭제", cancel: "취소", danger: true }))) return;
    try { await api("/api/images/" + d.id, { method: "DELETE" }); m.remove(); toast("게시물을 삭제했어요"); if (onChange) onChange(); reload(); } catch (e) { toast(e.message); }
  };
  let allMats = false, allCmts = false;
  function draw() {
    const so = d.so, o = so.owner || {};
    const menu = (e) => { e.stopPropagation(); menuCard(e.currentTarget, [
      { ic: "save", label: "북에 추가", fn: () => needLogin() && saveToBook([d.id], { after: refresh }) },
      { ic: "keep", label: so.kept ? "킵 해제" : "킵에 담기", fn: () => act(so.kept ? "DELETE" : "POST", `/api/images/${d.id}/keep`, null, so.kept ? "킵에서 뺐어요" : "킵 스페이스에 담았어요") },
      ...(so.editable ? [{ ic: "edit", label: "수정하기", fn: () => editPost(d, async () => { draw(); if (onChange) onChange(); }) }, { ic: "trash", label: "삭제하기", danger: true, fn: removeIt }]
        : [{ ic: "flag", label: "이 게시물 신고하기", danger: true, fn: () => reportSheet("post", d.id) }])]); };
    const tags = (d.tags || []).filter((t) => t.active);
    const mats = d.materials || [];
    const cin = h("input", { class: "pm-cin", maxlength: "500", placeholder: "댓글을 작성해보세요.", "aria-label": "댓글 입력" });
    const send = () => { const v = cin.value.trim(); if (v) act("POST", `/api/images/${d.id}/comments`, { body: v }); };
    cin.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); send(); } };
    const cmts = so.comments || [];
    const top = right.scrollTop;
    const put = (...k) => right.replaceChildren(...k.filter((x) => x != null && x !== false));
    put(
      h("div", { class: "pm-head" },
        h("a", { class: "pm-user", href: o.uid ? "#/u/" + o.uid : null, onclick: () => m.remove() }, avatarEl({ nick: o.nick || d.author, avatar: o.avatar }, 36), h("span", {}, h("b", {}, o.nick || d.author || ""), o.uid ? h("small", {}, "@" + o.uid) : null)),
        h("div", { class: "pm-icons" },
          h("button", { class: "icon-btn", type: "button", "aria-label": "공유하기", onclick: () => (typeof sharePost === "function" ? sharePost(d) : null) }, icon("share", 24)),
          h("button", { class: "icon-btn", type: "button", "aria-label": "더보기", "aria-haspopup": "menu", onclick: menu }, icon("more", 24)),
          h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => m.remove() }, icon("close", 24)))),
      h("h2", { class: "pm-title" }, d.title || "제목 없음"),
      h("div", { class: "pm-stats" },
        h("button", { class: "pm-st" + (so.liked ? " on" : ""), type: "button", "data-like": "1", "aria-pressed": String(!!so.liked), "aria-label": "하트", onclick: () => act(so.liked ? "DELETE" : "POST", `/api/images/${d.id}/like`) }, icon(so.liked ? "heart:f" : "heart", 20), h("span", {}, String(so.likes || 0))),
        h("span", { class: "pm-st" }, icon("comment", 20), h("span", {}, String(cmts.length))),
        h("span", { class: "pm-sp" }),
        h("button", { class: "pm-btn", type: "button", onclick: () => act(so.kept ? "DELETE" : "POST", `/api/images/${d.id}/keep`, null, so.kept ? "킵에서 뺐어요" : "킵 스페이스에 담았어요") }, so.kept ? "킵 해제" : "킵에 담기"),
        h("button", { class: "pm-btn dark", type: "button", onclick: () => needLogin() && saveToBook([d.id], { after: refresh }) }, "북에 저장")),
      h("hr", { class: "pm-hr" }),
      tags.length ? h("section", { class: "pm-sec" }, h("h3", {}, "태그"), h("div", { class: "pm-tags" }, kindTag ? kindTag(d) : null, tags.map((t) => h("span", { class: "pm-tag" }, "#" + t.label)))) : null,
      mats.length ? h("section", { class: "pm-sec" }, h("div", { class: "pm-sh" }, h("h3", {}, "사용 소재"), mats.length > 3 ? h("button", { class: "pm-more", type: "button", onclick: () => { allMats = !allMats; draw(); } }, allMats ? "접기" : "더보기") : null),
        h("div", { class: "pm-links" }, mats.slice(0, allMats ? mats.length : 3).map((l) => h("a", { href: l, target: "_blank", rel: "noopener noreferrer nofollow" }, icon("link", 15), h("span", {}, l))))) : null,
      h("section", { class: "pm-sec" }, h("h3", {}, `댓글 ${cmts.length}`),
        h("div", { class: "pm-cbox" }, cin, h("button", { class: "pm-send", type: "button", "aria-label": "댓글 등록", onclick: send }, icon("send", 20))),
        h("div", { class: "pm-clist" }, cmts.slice(0, allCmts ? cmts.length : 5).map((c) => h("div", { class: "pm-c" }, avatarEl({ nick: c.nick, avatar: c.avatar }, 28),
          h("div", {}, h("div", { class: "pm-cm" }, h("b", {}, c.nick), h("small", {}, ago(c.created))), h("p", {}, c.body)),
          h("button", { class: "icon-btn pm-cmore", type: "button", "aria-label": "댓글 더보기", onclick: (e) => { e.stopPropagation(); menuCard(e.currentTarget, c.mine
            ? [{ ic: "trash", label: "댓글 삭제", danger: true, fn: () => act("DELETE", `/api/comments/${c.id}`) }]
            : [{ ic: "flag", label: "댓글 신고하기", danger: true, fn: () => reportSheet("comment", c.id) }]); } }, icon("more", 18))))),
        cmts.length > 5 && !allCmts ? h("button", { class: "pm-more", type: "button", onclick: () => { allCmts = true; draw(); } }, `댓글 ${cmts.length}개 모두 보기`) : null));
    right.scrollTop = top;
  }
  draw(); document.body.append(m);
  right.querySelector(".icon-btn")?.focus();
}
