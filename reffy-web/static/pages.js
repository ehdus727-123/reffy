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

/* Figma Common/Dialog 닫기 32 · 라디오 20 · 더하기 24 (고정 SVG 문자열) */
const FIG_SVG = {
  close: '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M22.6275 7.9594C23.0181 7.56887 23.6511 7.56887 24.0416 7.9594C24.4321 8.34992 24.4321 8.98294 24.0416 9.37346L17.4153 15.9998L24.0416 22.6261C24.4321 23.0166 24.4321 23.6496 24.0416 24.0401C23.6511 24.4307 23.0181 24.4307 22.6275 24.0401L16.0012 17.4138L9.37492 24.0401C8.9844 24.4307 8.35139 24.4307 7.96086 24.0401C7.57034 23.6496 7.57034 23.0166 7.96086 22.6261L14.5872 15.9998L7.96086 9.37346C7.57034 8.98294 7.57034 8.34992 7.96086 7.9594C8.35139 7.56887 8.9844 7.56887 9.37492 7.9594L16.0012 14.5857L22.6275 7.9594Z" fill="currentColor"/></svg>',
  plus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  radioOn: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8.88889" stroke="#7425F6" stroke-width="2.22222"/><circle cx="9.99913" cy="10.0001" r="4.44444" fill="#7425F6"/></svg>',
  radioOff: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8.88889" stroke="#6F6D72" stroke-width="2.22222"/></svg>',
};
const figSvg = (k, cls) => { const sp = h("span", { class: "fsv " + (cls || "") }); sp.innerHTML = FIG_SVG[k]; return sp; };
const figClose = (fn) => h("button", { class: "icon-btn fclose", type: "button", "aria-label": "닫기", onclick: fn }, figSvg("close"));
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
      : h("div", { class: "dlg confirm" + (opt.fig ? " fg" : title.length > 24 ? " long" : "") + (opt.fig && opt.danger ? " dz" : ""), role: "alertdialog", "aria-modal": "true", "aria-label": title },
        h("div", { class: "chd" }, h("h2", {}, title), opt.fig ? figClose(() => done(false)) : h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => done(false) }, icon("close", 24))),
        sub ? h("p", { class: "csub" }, sub) : null,
        h("div", { class: "cft" }, opt.remember ? h("label", { class: "cskip" }, h("input", { class: "cbx", type: "checkbox", onchange: (e) => (skip = e.target.checked) }), "다시 보지 않기") : null,
          btn(opt.no || "아니요", "", () => done(false)), btn(opt.yes || "네", "primary" + (opt.danger ? " danger" : ""), () => done(true), { id: "cYes" }))));
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
    isM() ? h("span", { class: "meta" + (it.liked ? " liked" : "") }, cardAv(it), h("span", { class: "tx" }, h("b", {}, it.author)), it.likes != null ? h("span", { class: "like" }, icon("heart", 16), h("span", { class: "lk" }, String(it.likes))) : null)
    : h("span", { class: "meta" }, cardAv(it, "av", (it.author || "?").slice(0, 1)), h("span", { class: "tx" }, h("b", {}, it.title || "제목 없음"), h("span", {}, it.author)),
      o.more ? h("button", { class: "more-btn", type: "button", "aria-label": "더보기", onclick: (e) => { e.stopPropagation(); o.more(e.currentTarget, it); } }, moreIc()) : o.noMore ? null : moreIc()));
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
  const name = h("input", { type: "text", maxlength: "40", placeholder: isM() ? "예) 앉은 포즈 모음" : "예: 역동적인 구도", "aria-label": "새 북 이름" });
  const drawList = () => list.replaceChildren(...(books.length ? books.map((b) => h("button", { class: "brow-pick" + (chosen === b.id ? " on" : ""), type: "button", role: "radio", "aria-checked": String(chosen === b.id), onclick: () => { chosen = b.id; drawList(); } },
    b.covers[0] ? h("img", { src: `/img/${b.covers[0]}?s=thumb`, alt: "" }) : h("span", { class: "th" }), h("span", { class: "bt" }, h("b", {}, b.name), h("span", {}, `${b.count}개`)), isM() ? h("span", { class: "radio" }) : figSvg(chosen === b.id ? "radioOn" : "radioOff", "rd")))
    : [h("p", { class: "hint" }, "아직 북이 없어요. 위에서 새 북을 만들어 주세요.")]));
  drawList();
  const make = async () => {
    const v = name.value.trim(); if (!v) return toast("북 이름을 입력해 주세요.");
    try { const b = await api("/api/books", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) }); books.unshift(b); chosen = b.id; name.value = ""; drawList(); } catch (e) { toast(e.message); }
  };
  const cb = h("input", { class: "cbx", type: "checkbox", onchange: (e) => (rm = e.target.checked) });
  const m = modal(isM() ? "북에 저장" : "저장하기", h("div", {}, isM() ? h("div", { class: "newbook" }, h("b", {}, "+ 새 북 만들기"), h("span", { class: "lbl", style: "margin-top:0" }, "새 북 이름"), h("div", { class: "row" }, name, btn("만들기", "", make, { style: "height:44px" })))
      : h("div", { class: "newbook" }, h("b", {}, figSvg("plus"), "새 북 만들기"), h("span", { class: "lbl", style: "margin-top:0" }, "북 이름"), h("div", { class: "row" }, name, btn("만들기", "", make))),
    h("span", { class: "lbl" }, "내 북"), list),
    h("div", { class: "foot" }, h("label", {}, cb, "저장 후 킵 스페이스에서 비우기"), btn("취소", "", () => m.remove()), btn("저장하기", "primary", async () => {
      if (chosen == null) return toast("저장할 북을 골라 주세요.");
      try { const b = await api(`/api/books/${chosen}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, remove_from_keep: rm }) }); m.remove(); toast(`“${b.name}”에 저장했어요`); o.after && o.after(); } catch (e) { toast(e.message); }
    })));
  if (!isM()) { const d = m.querySelector(".dlg"); d.classList.add("savebk"); d.querySelector("header .icon-btn").replaceWith(figClose(() => m.remove())); }
  setTimeout(() => name.focus(), 0);
}
function bookDialog(book, done) {
  let file = null;
  const name = h("input", { type: "text", maxlength: "40", value: book?.name || "", placeholder: "예: 앉은 포즈 모음", "aria-label": "북 이름" });
  const desc = h("textarea", { maxlength: "200", placeholder: "북에 대한 메모를 남겨보세요", "aria-label": "북 설명" }, book?.description || "");
  const prev = h("span", { class: "cvprev" });
  const showPrev = (url) => prev.replaceChildren(url ? h("img", { src: url, alt: "커버 미리보기" }) : "");
  showPrev(book?.cover || (book?.covers?.[0] ? `/img/${book.covers[0]}?s=thumb` : null));
  const pick = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: true, onchange: (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 5 << 20) { toast("5MB 이하의 이미지만 올릴 수 있어요."); return; } file = f; showPrev(URL.createObjectURL(f)); } });
  const m = h("div", { class: "modal", onmousedown: (e) => e.target === m && m.remove() },
    h("div", { class: "dlg bk", role: "dialog", "aria-modal": "true", "aria-label": book ? "북 수정하기" : "새 북 만들기" },
      h("div", { class: "chd" }, h("h2", {}, book ? "북 수정하기" : "새 북 만들기"), isM() ? h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: () => m.remove() }, icon("close", 24)) : figClose(() => m.remove())),
      h("div", { class: "cvrow" }, prev, h("div", { class: "cvtx" }, h("b", {}, "커버 이미지"), h("span", {}, "이미지를 고르면 커버로 지정돼요"),
        h("button", { class: "btn cvup", type: "button", onclick: () => pick.click() }, isM() ? icon("image", 20) : (() => { const sp = h("span", { class: "dic2" }); sp.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M12.6663 4.3335C12.6663 4.06828 12.5609 3.814 12.3734 3.62646C12.1858 3.43893 11.9316 3.3335 11.6663 3.3335H4.33301C4.06779 3.3335 3.81351 3.43893 3.62598 3.62646C3.43844 3.814 3.33301 4.06828 3.33301 4.3335V11.6668C3.33301 11.932 3.43844 12.1863 3.62598 12.3739C3.81351 12.5614 4.06779 12.6668 4.33301 12.6668H11.6663C11.9316 12.6668 12.1858 12.5614 12.3734 12.3739C12.5609 12.1863 12.6663 11.932 12.6663 11.6668V4.3335ZM13.6663 11.6668C13.6663 12.1973 13.4555 12.7058 13.0804 13.0809C12.7053 13.456 12.1968 13.6668 11.6663 13.6668H4.33301C3.80257 13.6668 3.29402 13.456 2.91895 13.0809C2.54387 12.7058 2.33301 12.1973 2.33301 11.6668V4.3335C2.33301 3.80306 2.54387 3.29451 2.91895 2.91943C3.29402 2.54436 3.80257 2.3335 4.33301 2.3335H11.6663C12.1968 2.3335 12.7053 2.54436 13.0804 2.91943C13.4555 3.29451 13.6663 3.80306 13.6663 4.3335V11.6668Z" fill="currentColor"/><path d="M5.16634 10.6668L6.49967 8.93351L7.53301 10.1335L9.16634 7.93351L10.833 10.6668H5.16634Z" fill="currentColor"/></svg>'; return sp; })(), "업로드"), pick)),
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
const KC_TRASH = '<svg class="kc-tr" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M32.0846 10C32.775 10 33.3346 10.5597 33.3346 11.25C33.3346 11.9404 32.775 12.5 32.0846 12.5H7.91797C7.22761 12.5 6.66797 11.9404 6.66797 11.25C6.66797 10.5597 7.22761 10 7.91797 10H32.0846Z" fill="currentColor"/><path d="M23.3346 11.25V8.75004C23.3346 8.63953 23.2907 8.53359 23.2126 8.45544C23.1344 8.3773 23.0285 8.33337 22.918 8.33337H17.0846C16.9741 8.33337 16.8682 8.3773 16.79 8.45544C16.7119 8.53359 16.668 8.63953 16.668 8.75004V11.25C16.668 11.9404 16.1083 12.5 15.418 12.5C14.7276 12.5 14.168 11.9404 14.168 11.25V8.75004C14.168 7.97649 14.4755 7.23485 15.0225 6.68787C15.5694 6.14089 16.3111 5.83337 17.0846 5.83337H22.918C23.6915 5.83337 24.4332 6.14089 24.9801 6.68787C25.5271 7.23485 25.8346 7.97649 25.8346 8.75004V11.25C25.8346 11.9404 25.275 12.5 24.5846 12.5C23.8943 12.5 23.3346 11.9404 23.3346 11.25Z" fill="currentColor"/><path d="M29.5846 10C29.932 10 30.2645 10.1443 30.501 10.3988C30.7373 10.6532 30.8567 10.9949 30.8314 11.3412L29.4154 30.6755L29.4137 30.6771C29.3269 31.832 28.8071 32.9115 27.957 33.698C27.1077 34.4835 25.9921 34.9176 24.8353 34.9154L15.1673 34.917C14.0105 34.9192 12.8949 34.4835 12.0456 33.698C11.1955 32.9115 10.6757 31.832 10.5889 30.6771L10.5872 30.6755L9.17122 11.3412C9.14591 10.9949 9.26532 10.6532 9.50163 10.3988C9.73812 10.1443 10.0706 10 10.418 10H29.5846ZM13.0807 30.4899L13.1051 30.6853C13.1822 31.1352 13.4055 31.5494 13.7432 31.862C14.1296 32.2194 14.6377 32.4184 15.1641 32.417H24.8385C25.3649 32.4184 25.873 32.2194 26.2594 31.862C26.6454 31.5046 26.8824 31.0145 26.9219 30.4899L28.2402 12.5H11.7624L13.0807 30.4899Z" fill="currentColor"/><path d="M15.8346 27.5V17.5C15.8346 16.8097 16.3943 16.25 17.0846 16.25C17.775 16.25 18.3346 16.8097 18.3346 17.5V27.5C18.3346 28.1904 17.775 28.75 17.0846 28.75C16.3943 28.75 15.8346 28.1904 15.8346 27.5ZM21.668 27.5V17.5C21.668 16.8097 22.2276 16.25 22.918 16.25C23.6083 16.25 24.168 16.8097 24.168 17.5V27.5C24.168 28.1904 23.6083 28.75 22.918 28.75C22.2276 28.75 21.668 28.1904 21.668 27.5Z" fill="currentColor"/></svg>';   // Figma icon/trash 40 (고정 문자열)
/* 빈 화면 아이콘 (Figma 2733:129392): 원 104 #F1F0F2 + 느낌표 53 */
function kpEx() {
  const e = h("span", { class: "kp-ex" });
  e.innerHTML = '<svg width="53" height="53" viewBox="0 0 53 53" fill="none" aria-hidden="true"><path d="M24.8444 33.125V8.83331C24.8444 7.91859 25.5859 7.17706 26.5007 7.17706C27.4154 7.17706 28.1569 7.91859 28.1569 8.83331V33.125C28.1569 34.0397 27.4154 34.7812 26.5007 34.7812C25.5859 34.7812 24.8444 34.0397 24.8444 33.125Z" fill="#6F6D72"/><path d="M29.2611 43.0625C29.2611 44.587 28.0252 45.8229 26.5007 45.8229C24.9761 45.8229 23.7402 44.587 23.7402 43.0625C23.7402 41.5379 24.9761 40.3021 26.5007 40.3021C28.0252 40.3021 29.2611 41.5379 29.2611 43.0625Z" fill="#6F6D72"/></svg>';
  return e;
}
/* 홈 피드와 같은 배치: n번째 카드는 (n % 열 수)번째 열 — 왼쪽 → 오른쪽으로 한 줄씩. 열 수는 폭에 맞춰(카드 약 217 · 간격 18) */
function rrGrid(items, o, opt = {}) {
  const cg = opt.gap ?? 18;
  const g = h("div", { class: "rrgrid", style: opt.gap != null ? `gap:${opt.gap}px` : null });
  const cards = items.map((it) => { const c = pcard(it, typeof o === "function" ? o(it) : o); const im = c.querySelector(".im"); if (im) im.style.setProperty("--ch", cardH(it)); return c; });
  const lay = () => {
    const W = g.clientWidth; if (!W) return;
    const n = Math.max(2, Math.floor((W + cg) / (200 + cg))); if (g._n === n) return; g._n = n;   // 카드 최소 폭 200
    const cols = Array.from({ length: n }, () => h("div", { class: "rrcol" }));
    cards.forEach((c, i) => cols[i % n].append(c));
    g.replaceChildren(...cols);
  };
  new ResizeObserver(lay).observe(g);
  return g;
}
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
    saveBtn.disabled = !n; if (!n) saveBtn.title = "저장할 이미지를 먼저 골라 주세요";   // 고른 이미지가 없으면 북에 저장 불가
    b.append(h("b", {}, `${n}개 선택`), h("span", { class: "sp" }), delBtn, saveBtn);
    return b;
  }
  function draw() {
    root.classList.toggle("selecting", sel);
    const chips = [["", "전체"], ["photo", "사진"], ["illust", "일러스트"]].map(([k, l]) => h("button", { class: "pill" + (kind === k ? " on" : ""), type: "button", onclick: () => { kind = k; picked.clear(); load(); } }, l));
    const selBtn = !data.items.length && !isM() ? h("div", { class: "kp-acts kp-acts0" }, (() => { const t = h("button", { class: "icon-btn kc-del", type: "button", disabled: true, "aria-label": "삭제" }); t.innerHTML = KC_TRASH; return t; })(), h("button", { class: "btn primary", type: "button", disabled: true }, "북에 저장")) : data.items.length ? (sel ? btn("취소", isM() ? "linkbtn" : "", () => { sel = false; picked.clear(); draw(); }) : btn("선택", isM() ? "linkbtn" : "primary", () => { sel = true; draw(); })) : null;
    root.replaceChildren(isM() ? mbar("킵 스페이스", { big: true, right: [selBtn] }) : "", h("div", { class: "kbar" }, chips, h("span", { class: "sp" }), isM() ? null : selBtn),
      data.items.length ? (isM() ? pgrid : rrGrid)(data.items, (it) => ({ noMore: true, on: picked.has(it.id), click: (_, el) => { if (!sel) return isM() ? keepViewer(data.items.slice(), data.items.indexOf(it), load) : keepCompare(data.items.slice(), data.items.indexOf(it), kind, (k) => { kind = k; picked.clear(); page(root); load(); }, () => { page(root); load(); }); picked.has(it.id) ? picked.delete(it.id) : picked.add(it.id); el.classList.toggle("on", picked.has(it.id)); root.querySelector(".selbar").replaceWith(bar()); } }), "c6")
        : isM() ? notice(kind ? "이 종류의 킵이 없어요" : "킵 스페이스가 비어있어요", "피드에서 마음에 드는 레퍼런스를 담아보세요", btn("홈으로", "primary", () => (location.hash = "#/")))
          : h("div", { class: "kp-empty" }, kpEx(), h("h2", {}, kind ? "이 종류의 킵이 없어요" : "킵 스페이스가 비어있어요"), btn("홈으로 이동", "", () => (location.hash = "#/"))),
      bar());
  }
  load();
}

/* ---------------------------------------------------------------- 킵 스페이스 비교 보기 (KEP_0100 · 0101 · 0102)
   레퍼런스를 하나씩 넘겨 가며 비교 · 체크해서 삭제하거나 북에 저장 · ←/→ 키, 화살표, 아래 썸네일로 이동 */
/* 꺾쇠 아이콘 (Figma Common · Icon — icon/chevronLeft 2126:628 · icon/chevronRight 2126:637, 24 기준) */
const CHEV_SVG = {
  L: '<path d="M13.9697 5.4697C14.2626 5.1768 14.7374 5.1768 15.0303 5.4697C15.3232 5.7626 15.3232 6.2374 15.0303 6.5303L9.5606 12L15.0303 17.4697C15.3232 17.7626 15.3232 18.2374 15.0303 18.5303C14.7374 18.8232 14.2626 18.8232 13.9697 18.5303L7.9697 12.5303C7.6768 12.2374 7.6768 11.7626 7.9697 11.4697L13.9697 5.4697Z" fill="currentColor"/>',
  R: '<path d="M8.9697 5.4697C9.2626 5.1768 9.7373 5.1768 10.0302 5.4697L16.0302 11.4697C16.3231 11.7626 16.3231 12.2374 16.0302 12.5303L10.0302 18.5303C9.7373 18.8232 9.2626 18.8232 8.9697 18.5303C8.6768 18.2374 8.6768 17.7626 8.9697 17.4697L14.4394 12L8.9697 6.5303C8.6768 6.2374 8.6768 5.7626 8.9697 5.4697Z" fill="currentColor"/>',
};
const chevSvg = (d) => { const sp = h("span", { class: "kc-chev" }); sp.innerHTML = `<svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden="true"><path d="${d === "L" ? "M62.83 26L36.83 52L62.83 78" : "M41.17 26L67.17 52L41.17 78"}" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`; return sp; };   // 104 크기 · 선 굵기 4(가운데)
function keepCompare(items, start, kind, setKind, onDone) {
  const root = $("#page"); let idx = Math.max(0, start); const picked = new Set();
  const full = (it) => (it.thumb || "").replace("s=thumb", "s=full");
  const navBack = (e) => { if (e.target.closest && e.target.closest('a[href="#/keep"]')) { e.preventDefault(); close(); } };   // 위 메뉴 '킵 스페이스'를 누르면 목록으로
  const close = () => { document.removeEventListener("keydown", key); document.removeEventListener("click", navBack, true); onDone(); };
  document.addEventListener("click", navBack, true);
  const key = (e) => { if ($(".modal:not(.closing)")) return; if (e.key === "ArrowRight") go(idx + 1); else if (e.key === "ArrowLeft") go(idx - 1); else if (e.key === "Escape") close(); else if (e.key === " ") { e.preventDefault(); toggle(items[idx]); } };
  document.addEventListener("keydown", key);
  const track = h("div", { class: "kc-track" });
  let tx = 0;   // 지금 트랙 위치(px)
  /* 카드를 누른 채 옆으로 끌어서 넘기기: 놓으면 끈 거리만큼(카드 폭 기준) 앞/뒤 카드로 이동, 조금만 끌어도(60px) 한 장 넘어감 */
  let drag = null, eatClick = false;
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !items.length) return;
    drag = { x: e.clientX, id: e.pointerId, moved: false };
  });
  track.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 6) return;
    if (!drag.moved) { drag.moved = true; track.setPointerCapture(e.pointerId); track.style.transition = "none"; track.classList.add("dragging"); }
    track.style.transform = `translateX(${tx + dx}px)`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.moved) return;
    track.classList.remove("dragging"); track.style.transition = "";
    eatClick = true; setTimeout(() => (eatClick = false), 0);
    const dx = e.clientX - d.x, c = track.children[idx];
    const step = c ? c.offsetWidth + parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || 0) : 400;
    let n = Math.round(-dx / step);
    if (n === 0 && Math.abs(dx) > 60) n = dx < 0 ? 1 : -1;
    go(idx + n);
  };
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);
  track.addEventListener("click", (e) => { if (eatClick) { e.stopPropagation(); e.preventDefault(); } }, true);   // 끌기 뒤 클릭(선택)은 무시
  const strip = h("div", { class: "kc-strip" });
  const fade = () => { const m = strip.scrollWidth - strip.clientWidth; strip.classList.toggle("fl", strip.scrollLeft > 2); strip.classList.toggle("fr", strip.scrollLeft < m - 2); };   // 더 있는 쪽만 흐리게
  strip.addEventListener("scroll", fade, { passive: true }); new ResizeObserver(fade).observe(strip);
  const count = h("b", { class: "kc-count" });

  const toggle = (it) => { if (!it) return; picked.has(it.id) ? picked.delete(it.id) : picked.add(it.id); paint(); };
  const ids = () => (picked.size ? [...picked] : items[idx] ? [items[idx].id] : []);
  const delBtn = h("button", { class: "icon-btn kc-del", type: "button", "aria-label": "선택한 레퍼런스 삭제", title: "삭제", onclick: async () => {
    const list = ids(); if (!list.length) return;
    if (!(await confirmDialog(`선택한 레퍼런스 ${list.length}개를 삭제할까요?`, "삭제한 레퍼런스는 되돌릴 수 없어요.", { ok: "네", cancel: "아니오" }))) return;
    try { await api("/api/me/keeps/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: list }) });
      items = items.filter((x) => !list.includes(x.id)); list.forEach((x) => picked.delete(x)); toast("킵 스페이스에서 삭제했어요");
      if (!items.length) return close(); idx = Math.min(idx, items.length - 1); build(); } catch (e) { toast(e.message); } } });
  delBtn.innerHTML = KC_TRASH;
  const saveBtn = h("button", { class: "btn primary kc-save", type: "button", disabled: true, title: "저장할 이미지를 먼저 골라 주세요", onclick: () => picked.size && saveToBook([...picked], { after: () => { picked.clear(); onDone(); } }) }, "북에 저장");
  const chips = [["", "전체"], ["photo", "사진"], ["illust", "일러스트"]].map(([k, l]) => h("button", { class: "pill" + (kind === k ? " on" : ""), type: "button", onclick: () => { document.removeEventListener("keydown", key); document.removeEventListener("click", navBack, true); setKind(k); } }, l));
  const prev = h("button", { class: "kc-nav prev", type: "button", "aria-label": "이전 레퍼런스", onclick: () => go(idx - 1) }, isM() ? icon("chevR", 48) : chevSvg("L"));
  const next = h("button", { class: "kc-nav next", type: "button", "aria-label": "다음 레퍼런스", onclick: () => go(idx + 1) }, isM() ? icon("chevR", 48) : chevSvg("R"));
  function build() {
    track.replaceChildren(...items.map((it, i) => h("div", { class: "kc-card", "data-i": i, onclick: () => { if (i !== idx) go(i); toggle(it); } },   // 카드를 누르면 바로 선택/해제 (가운데로도 이동)
      h("img", { src: full(it), alt: it.title || "레퍼런스 이미지", draggable: "false", loading: Math.abs(i - idx) < 4 ? "eager" : "lazy" }),
      h("span", { class: "kc-chk", role: "checkbox", "aria-label": "선택" }, icon("check", 18)))));
    strip.replaceChildren(...items.map((it, i) => h("button", { class: "kc-th", type: "button", "aria-label": `${i + 1}번째 레퍼런스`, onclick: () => go(i) },
      h("img", { src: it.thumb, alt: "", loading: "lazy" }), h("span", { class: "kc-chk" }, icon("check", 14)))));
    go(idx, true);
  }
  function paint() {
    track.querySelectorAll(".kc-card").forEach((c, i) => { c.classList.toggle("cur", i === idx); c.classList.toggle("on", picked.has(items[i]?.id)); c.querySelector(".kc-chk").setAttribute("aria-checked", String(picked.has(items[i]?.id))); });
    strip.querySelectorAll(".kc-th").forEach((t, i) => { t.classList.toggle("cur", i === idx); t.classList.toggle("on", picked.has(items[i]?.id)); });
    count.textContent = `${picked.size}/${items.length}`;   // 선택한 이미지 / 전체 이미지
    prev.disabled = idx <= 0; next.disabled = idx >= items.length - 1;
    saveBtn.textContent = "북에 저장";
    saveBtn.disabled = !picked.size; saveBtn.title = picked.size ? "" : "저장할 이미지를 먼저 골라 주세요";
  }
  function go(i, instant) {
    if (!items.length) return; idx = Math.max(0, Math.min(items.length - 1, i));
    const card = track.children[idx]; if (!card) return;
    const vw = track.parentElement.clientWidth;
    track.style.transition = instant ? "none" : "";
    tx = Math.round(vw / 2 - (card.offsetLeft + card.offsetWidth / 2));
    track.style.transform = `translateX(${tx}px)`;
    const th = strip.children[idx]; if (th) strip.scrollTo({ left: th.offsetLeft - strip.clientWidth / 2 + th.offsetWidth / 2, behavior: instant ? "auto" : "smooth" });
    paint();
  }
  root.replaceChildren(h("div", { class: "kc" },
    isM() ? h("div", { class: "kc-back" }, h("button", { class: "icon-btn", type: "button", "aria-label": "킵 스페이스로 돌아가기", onclick: close }, icon("chevR", 24))) : null,
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
  const root = h("div", { class: "drawer" }, h("aside", { class: "dnav" }, h("h2", {}, "서랍"), link("내 북", "#/drawer", !sub || sub === "book"), h("small", {}, "내 활동"),
    link("최근 본 게시물", "#/drawer/recent", sub === "recent"), link("반응한 게시물", "#/drawer/liked", sub === "liked")), main);
  // 이미 서랍 화면이면 새 내용을 다 불러온 뒤에 바꿔 끼움 (빈 화면이 잠깐 보이지 않게)
  const stay = !$("#page").hidden && $("#page > .drawer");
  if (!stay) page(root);
  try {
    if (sub === "recent") {
      const d = await api("/api/me/viewed");
      main.append(h("div", { class: "dhead2" }, h("div", {}, h("h1", {}, "최근 본 게시물"), h("p", { class: "sub" }, "최근 일주일 동안 본 게시물이 보여요"))),
        d.items.length ? (isM() ? pgrid : (items, o) => rrGrid(items, o, { gap: 12 }))(d.items, {}, "c5") : notice("최근 본 게시물이 없어요", "홈에서 마음에 드는 레퍼런스를 찾아 보세요.", btn("홈으로", "primary", () => (location.hash = "#/"))));
    } else if (sub === "liked") {
      // DRW_0302 반응한 게시물: 전체 · 하트 · 댓글 칩으로 거르기
      const body = h("div", { class: "dbody" });
      const chips = h("div", { class: "dchips", role: "radiogroup", "aria-label": "반응 종류" });
      const load = async () => {
        chips.replaceChildren(...[["", "전체"], ["like", "하트"], ["comment", "댓글"]].map(([k, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(drawerKind === k), class: "dchip" + (drawerKind === k ? " on" : ""), onclick: () => { if (drawerKind !== k) { drawerKind = k; load(); } } }, l)));
        const d = await api("/api/me/reacted" + (drawerKind ? "?kind=" + drawerKind : ""));
        // 카드: 피드와 같은 WF/Card (프로필 · 닉네임 · 하트 수), 누르면 게시물 화면으로
        const dcard = (it) => { const c = card(it); c.onclick = () => goPost(it.id); return c; };
        body.replaceChildren(d.items.length ? (isM() ? h("div", { class: "grid c5 dgrid" }, d.items.map(dcard)) : rrGrid(d.items, (it) => ({ click: () => goPost(it.id) }), { gap: 12 })) : notice(drawerKind === "comment" ? "아직 댓글을 단 게시물이 없어요" : drawerKind === "like" ? "아직 하트를 누른 게시물이 없어요" : "아직 반응한 게시물이 없어요", "홈에서 마음에 드는 레퍼런스를 찾아 보세요.", btn("홈으로", "primary", () => (location.hash = "#/"))));
      };
      await load();
      main.append(h("div", { class: "dhead2" }, h("div", {}, h("h1", {}, "반응한 게시물"), h("p", { class: "sub" }, "하트를 누르거나 댓글을 단 게시글이에요")), chips), body);
    } else if (sub === "book") await bookDetail(main, id); else await bookList(main);
  } catch (e) { main.replaceChildren(notice("불러오지 못했어요", e.message)); }
  if (stay && location.hash.startsWith("#/drawer")) page(root);
}
/* 내 북 화면 아이콘 (Figma DRW_0000 2733:130109): 정렬 화살표 20 · 더하기 20 · 더보기 24 */
const D_SVG = {
  drop: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.66693 8.5415H13.3336L10.0003 12.0832L6.66693 8.5415Z" fill="#5B595F"/><path d="M13.3336 7.9165C13.5828 7.9165 13.8084 8.06455 13.9073 8.29329C14.0062 8.52217 13.9594 8.78799 13.7885 8.96956L10.4552 12.5112C10.3371 12.6367 10.1726 12.7082 10.0003 12.7082C9.82793 12.7082 9.66346 12.6367 9.54535 12.5112L6.21202 8.96956C6.04116 8.78799 5.99431 8.52217 6.0932 8.29329C6.19216 8.06455 6.41768 7.9165 6.66693 7.9165H13.3336ZM10.0003 11.1717L11.8875 9.1665H8.11306L10.0003 11.1717Z" fill="#5B595F"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M9.37533 15.8332V10.6248H4.16699C3.82181 10.6248 3.54199 10.345 3.54199 9.99984C3.54199 9.65466 3.82181 9.37484 4.16699 9.37484H9.37533V4.1665C9.37533 3.82133 9.65515 3.5415 10.0003 3.5415C10.3455 3.5415 10.6253 3.82133 10.6253 4.1665V9.37484H15.8337C16.1788 9.37484 16.4587 9.65466 16.4587 9.99984C16.4587 10.345 16.1788 10.6248 15.8337 10.6248H10.6253V15.8332C10.6253 16.1783 10.3455 16.4582 10.0003 16.4582C9.65515 16.4582 9.37533 16.1783 9.37533 15.8332Z" fill="currentColor"/></svg>',
};
const dIc = (k) => { const sp = h("span", { class: "dic2" }); sp.innerHTML = D_SVG[k]; return sp; };
async function bookList(main, sort = "recent") {
  const d = await api("/api/books?sort=" + sort);
  const redo = () => bookList(main, sort);
  const sortBtn = h("button", { class: "sortbtn", type: "button", onclick: (e) => { e.stopPropagation(); popMenu(e.currentTarget, [["최근 순", () => { sort = "recent"; redo(); }], ["이름 순", () => { sort = "name"; redo(); }]]); } }, sort === "name" ? "이름 순" : "최근 순", dIc("drop"));
  main.replaceChildren(h("div", { class: "dhead" }, h("div", {}, h("h1", {}, "내 북"), h("p", { class: "sub" }, `북 ${d.total}개`)), h("span", { class: "sp" }), sortBtn, (() => { const b = btn("새 북 만들기", "primary newbk", () => bookDialog(null, redo)); b.prepend(dIc("plus")); return b; })()),
    d.items.length ? h("div", { class: "books" }, d.items.map((b) => h("div", { class: "bk" },
      h("button", { class: "book", type: "button", "aria-label": `${b.name} 열기`, onclick: () => (location.hash = "#/drawer/book/" + b.id) }, h("span", { class: "cover" + (b.cover ? " one" : "") }, b.cover ? h("img", { src: b.cover, alt: "" }) : [0, 1, 2].map((i) => h("span", {}, b.covers[i] ? h("img", { src: `/img/${b.covers[i]}?s=thumb`, alt: "" }) : null)))),
      h("div", { class: "brow" }, h("button", { class: "bt", type: "button", style: "text-align:left", onclick: () => (location.hash = "#/drawer/book/" + b.id) }, h("b", {}, b.name), h("span", {}, `${b.count}개 · ${ago(b.updated)}`)),
        h("button", { class: "more-btn bk-more", type: "button", "aria-label": `${b.name} 더보기`, onclick: (e) => { e.stopPropagation(); popMenu(e.currentTarget, [["편집", () => bookDialog(b, redo)], ["삭제", async () => { if (await confirmDialog(`‘${b.name}’ 북을 삭제하시겠어요?`, "삭제한 북은 복구할 수 없어요.", { fig: !isM(), no: "아니요", yes: "네" })) { try { await api("/api/books/" + b.id, { method: "DELETE" }); redo(); } catch (er) { toast(er.message); } } }]]); } }, moreIc())))))
      : notice("아직 북이 없어요", "마음에 드는 레퍼런스를 주제별로 모아 보세요.", btn("+ 새 북 만들기", "primary", () => bookDialog(null, redo))));
}
async function bookDetail(main, id) {
  const b = await api("/api/books/" + id); const redo = () => bookDetail(main, id);
  main.classList.add("bkd");
  let sel = false; const picked = new Set();
  const jpost = (url, body) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const delBook = async () => {
    if (!(await confirmDialog(`‘${b.name}’ 북을 삭제하시겠어요?`, "삭제한 북은 복구할 수 없어요.", { fig: !isM(), no: "아니요", yes: "네" }))) return;
    try { await api("/api/books/" + id, { method: "DELETE" }); location.hash = "#/drawer"; } catch (er) { toast(er.message); }
  };
  /* 선택 바 (Figma ActionBar): 'N개 선택' · 삭제 · 이동 */
  const bar = h("div", { class: "selbar bkbar", hidden: true });
  const paintBar = () => {
    const n = picked.size;
    const del = btn("삭제", "", async () => {
      if (!n) return;
      if (!(await confirmDialog(`선택한 게시물 ${n}개를 이 북에서 삭제할까요?`, "게시물 자체나 다른 북에 담긴 게시물은 그대로예요.", { fig: !isM(), no: "아니요", yes: "네" }))) return;
      try { await jpost(`/api/books/${id}/items/remove`, { ids: [...picked] }); toast("북에서 삭제했어요"); redo(); } catch (e) { toast(e.message); }
    });
    const mv = btn("이동", "", () => n && moveDialog([...picked], b, redo));
    del.disabled = mv.disabled = !n;
    bar.hidden = !sel; bar.replaceChildren(h("b", {}, `${n}개 선택`), h("span", { class: "sp" }), del, mv);
  };
  const draw = () => {
    main.classList.toggle("selecting", sel);
    const head = h("div", { class: "dhead" }, h("div", {}, h("div", { class: "bkt" }, h("h1", { style: "font-size:28px" }, b.name), h("p", { class: "sub" }, `${b.count}개 · ${ago(b.updated)}`)), b.description ? h("p", { class: "sub bkdesc" }, b.description) : null), h("span", { class: "sp" }),
      sel ? btn("취소", "bk-cancel", () => { sel = false; picked.clear(); draw(); }) : btn("편집", "primary", () => bookDialog(b, redo)));
    const opt = (it) => sel ? { on: picked.has(it.id), noMore: true, click: (_, el) => { picked.has(it.id) ? picked.delete(it.id) : picked.add(it.id); el.classList.toggle("on", picked.has(it.id)); paintBar(); } }
      : { more: (a) => popMenu(a, [["북에서 빼기", async () => { try { await jpost(`/api/books/${id}/items/remove`, { ids: [it.id] }); redo(); } catch (e) { toast(e.message); } }]]) };
    main.replaceChildren(h("div", { class: "back-row" }, h("button", { class: "icon-btn", type: "button", "aria-label": "북 목록으로", onclick: () => (location.hash = "#/drawer") }, isM() ? icon("back", 24) : dpSvg("back", 36)),
      h("button", { class: "more-btn", type: "button", "aria-label": "북 메뉴", onclick: (e) => { e.stopPropagation(); popMenu(e.currentTarget, [...(b.items.length && !sel ? [["게시물 선택", () => { sel = true; draw(); }]] : []), ["북 수정하기", () => bookDialog(b, redo)], ["북 삭제", delBook]]); } }, moreIc())),
      head,
      b.items.length ? (isM() ? pgrid : (items, o) => rrGrid(items, o, { gap: 12 }))(b.items, opt, "c5")
        : notice("이 북은 비어 있어요", "게시물 상세에서 ‘북에 저장’을 눌러 담아 보세요.", btn("홈으로", "primary", () => (location.hash = "#/"))),
      bar);
    paintBar();
  };
  draw();
}
/* 이동하기 (Figma Move 2733:135509): 다른 북을 골라 선택한 게시물을 옮김 (새 북에 담고 지금 북에서 뺌) */
async function moveDialog(ids, from, done) {
  let books;
  try { books = (await api("/api/books")).items.filter((x) => x.id !== from.id); } catch (e) { toast(e.message); return; }
  if (!books.length) return toast("옮길 다른 북이 없어요. 먼저 새 북을 만들어 주세요.");
  let chosen = books[0].id;
  const list = h("div", { class: "mvlist" });
  const draw = () => list.replaceChildren(...books.map((x) => h("button", { class: "brow-pick" + (chosen === x.id ? " on" : ""), type: "button", role: "radio", "aria-checked": String(chosen === x.id), onclick: () => { chosen = x.id; draw(); } },
    x.covers[0] ? h("img", { src: `/img/${x.covers[0]}?s=thumb`, alt: "" }) : h("span", { class: "th" }), h("span", { class: "bt" }, h("b", {}, x.name), h("span", {}, `${x.count}개`)), isM() ? h("span", { class: "radio" }) : figSvg(chosen === x.id ? "radioOn" : "radioOff", "rd"))));
  draw();
  const m = modal("이동하기", h("div", {}, h("span", { class: "lbl" }, "내 북"), list),
    h("div", { class: "foot" }, btn("취소", "", () => m.remove()), btn("이동하기", "primary", async () => {
      try {
        const t = await api(`/api/books/${chosen}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
        await api(`/api/books/${from.id}/items/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
        m.remove(); toast(`“${t.name}”(으)로 옮겼어요`); done();
      } catch (e) { toast(e.message); }
    })));
  if (!isM()) { const d = m.querySelector(".dlg"); d.classList.add("savebk", "movebk"); d.querySelector("header .icon-btn").replaceWith(figClose(() => m.remove())); }
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
  async function load() { body.replaceChildren(skFollows()); try { list = (await api(`/api/users/${u.uid}/follows?kind=${cur}`)).items; } catch (e) { list = []; toast(e.message); } drawList(); }
  drawTabs(); document.body.append(m); load();
}

/* Figma Common · Icon icon/link (24) · Common/Avatar 빈 상태(사람 아이콘, #E4E3E5 원) */
const IC_LINK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12C3 10.6739 3.52716 9.40253 4.46484 8.46484C5.40253 7.52716 6.67392 7 8 7H10.25C10.6642 7 11 7.33579 11 7.75C11 8.16421 10.6642 8.5 10.25 8.5H8C7.07174 8.5 6.18177 8.86901 5.52539 9.52539C4.86901 10.1818 4.5 11.0717 4.5 12C4.5 12.9283 4.86901 13.8182 5.52539 14.4746C6.18177 15.131 7.07174 15.5 8 15.5H10.25C10.6642 15.5 11 15.8358 11 16.25C11 16.6642 10.6642 17 10.25 17H8C6.67392 17 5.40253 16.4728 4.46484 15.5352C3.52716 14.5975 3 13.3261 3 12ZM19.5 12C19.5 11.0717 19.131 10.1818 18.4746 9.52539C17.8182 8.86901 16.9283 8.5 16 8.5H13.75C13.3358 8.5 13 8.16421 13 7.75C13 7.33579 13.3358 7 13.75 7H16C17.3261 7 18.5975 7.52716 19.5352 8.46484C20.4728 9.40253 21 10.6739 21 12C21 13.3261 20.4728 14.5975 19.5352 15.5352C18.5975 16.4728 17.3261 17 16 17H13.75C13.3358 17 13 16.6642 13 16.25C13 15.8358 13.3358 15.5 13.75 15.5H16C16.9283 15.5 17.8182 15.131 18.4746 14.4746C19.131 13.8182 19.5 12.9283 19.5 12ZM15.25 11.25C15.6642 11.25 16 11.5858 16 12C16 12.4142 15.6642 12.75 15.25 12.75H8.75C8.33579 12.75 8 12.4142 8 12C8 11.5858 8.33579 11.25 8.75 11.25H15.25Z" fill="currentColor"/></svg>';
const AV_PH = '<svg width="100%" height="100%" viewBox="0 0 80 80" fill="none" aria-hidden="true"><circle cx="40" cy="40" r="40" fill="#E4E3E5"/><path d="M45.001 31C45.001 29.6741 44.4736 28.4025 43.5361 27.4648C42.5986 26.5274 41.3268 26.0002 40.001 26L39.5068 26.0254C38.3622 26.1391 37.2863 26.6444 36.4658 27.4648C35.5284 28.4025 35.001 29.6741 35.001 31C35.0011 32.326 35.5282 33.5976 36.4658 34.5352C37.4035 35.4728 38.675 36 40.001 36C41.327 36 42.5985 35.4728 43.5361 34.5352C44.4737 33.5976 45.0009 32.326 45.001 31ZM48.001 31C48.0008 33.1215 47.1574 35.1561 45.6572 36.6562C44.157 38.1564 42.1226 39 40.001 39C37.8794 39 35.845 38.1564 34.3447 36.6562C32.8446 35.1561 32.0011 33.1215 32.001 31C32.001 28.8787 32.8431 26.844 34.3428 25.3438C35.8426 23.8435 37.8777 23.0005 39.999 23H40.0029L40.3994 23.0098C42.3764 23.1083 44.253 23.9373 45.6592 25.3438C47.1589 26.844 48.001 28.8787 48.001 31Z" fill="#6F6D72"/><path d="M53 54.5C53 49.3055 47.7074 45 40 45C32.2926 45 27 49.3055 27 54.5C27 54.6326 27.0527 54.7597 27.1465 54.8535C27.2403 54.9473 27.3674 55 27.5 55H52.5C52.6326 55 52.7598 54.9473 52.8535 54.8535C52.9473 54.7598 53 54.6326 53 54.5ZM56 54.5C56 55.4283 55.631 56.3182 54.9746 56.9746C54.3182 57.631 53.4283 58 52.5 58H27.5C26.5717 58 25.6818 57.631 25.0254 56.9746C24.369 56.3182 24 55.4283 24 54.5C24 46.8945 31.5074 42 40 42C48.4926 42 56 46.8945 56 54.5Z" fill="#6F6D72"/></svg>';
const htmlSpan = (cls, html) => { const sp = h("span", { class: cls }); sp.innerHTML = html; return sp; };
async function profilePage(uid) {
  const root = h("div", { class: "pf" }); page(root);
  let u, tab = "posts", posts = [], books = [], scope = "", kind = "";   // kind: 웹 탭(Figma MYP 2410:115952) 전체 · 일러스트 · 사진
  async function loadAll() {
    u = await api("/api/users/" + uid);
    posts = (await api(`/api/users/${uid}/posts?limit=100` + (u && u.me && scope ? "&scope=" + scope : "") + (kind ? "&kind=" + kind : ""))).items;
    books = u.me && isM() ? (await api(`/api/users/${uid}/books`)).items : [];
  }
  function draw() {
    const links = u.links.length ? h("div", { class: "pf-links" }, h("h2", {}, "링크"), h("ul", {}, u.links.map((l) => h("li", {}, isM() ? icon("link", 18) : htmlSpan("lic", IC_LINK), h("a", { href: l, target: "_blank", rel: "noopener noreferrer nofollow" }, shortLink(l)))))) : null;
    const shareBtn = h("button", { class: "btn pf-share", type: "button", "aria-label": "프로필 링크 복사", title: "프로필 링크 복사", onclick: async () => { const url = location.origin + location.pathname + "#/u/" + encodeURIComponent(u.uid); try { await navigator.clipboard.writeText(url); toast("프로필 링크를 복사했어요"); } catch { toast(url); } } }, dpSvg("share", 24));
    const stat = (n, l, fn) => (fn ? h("button", { class: "pf-stat", type: "button", onclick: fn }, h("b", {}, compact(n)), h("span", {}, l)) : h("span", { class: "pf-stat" }, h("b", {}, compact(n)), h("span", {}, l)));
    const blockAsk = async () => {
      if (!needLogin()) return;
      if (!(await confirmDialog(`${u.nick}님을 차단할까요?`, "차단하면 서로의 게시물과 프로필을 볼 수 없어요. 설정 > 차단 유저에서 언제든 해제할 수 있어요.", { ok: "차단하기", danger: true }))) return;
      try { await api(`/api/users/${u.uid}/block`, { method: "POST" }); toast("차단했어요"); await loadAll(); draw(); } catch (e) { toast(e.message); }
    };
    const unblock = async () => { try { await api(`/api/users/${u.uid}/block`, { method: "DELETE" }); toast("차단을 해제했어요"); await loadAll(); draw(); } catch (e) { toast(e.message); } };
    const moreBtn = u.me ? null : h("span", { class: "vdots pf-more" }, h("button", { class: "icon-btn", type: "button", "aria-label": "더보기", onclick: (e) => { e.stopPropagation(); menuCard(e.currentTarget, [
      u.blocked ? { label: "차단 해제", fn: unblock } : { label: "차단하기", fn: blockAsk }, { label: "신고하기", danger: true, fn: () => reportSheet("user", u.uid) }]); } }, icon("more", 24)));
    const upBtn = () => { const b = btn("새 게시물 업로드", "primary up", () => openUpload()); b.prepend(dIc("plus")); return b; };
    const acts = !isM() ? (u.me ? h("div", { class: "pf-acts" }, h("div", { class: "pf-row" }, btn("프로필 수정", "", () => (location.hash = "#/me/edit")), shareBtn), upBtn())
        : u.blocked ? h("div", { class: "pf-acts" }, h("div", { class: "pf-row" }, btn("차단 해제", "", unblock), shareBtn))
        : h("div", { class: "pf-acts" }, h("div", { class: "pf-row" }, btn(u.isFollowing ? "팔로잉" : "팔로우", u.isFollowing ? "" : "primary", async () => { if (!ME) return needLogin(); try { await toggleFollow(u.uid, u.isFollowing); await loadAll(); draw(); } catch (e) { toast(e.message); } }), shareBtn)))
      : u.me
      ? h("div", { class: "pf-acts" }, btn(isM() ? "프로필 수정" : "프로필 편집", "", () => (location.hash = "#/me/edit")), btn("+ 새 게시물 업로드", "primary up", () => openUpload()))
      : u.blocked ? h("div", { class: "pf-acts" }, btn("차단 해제", "", unblock))
      : h("div", { class: "pf-acts" }, btn(u.isFollowing ? "팔로잉" : "팔로우", u.isFollowing ? "" : "primary", async () => { if (!ME) return needLogin(); try { await toggleFollow(u.uid, u.isFollowing); await loadAll(); draw(); } catch (e) { toast(e.message); } }));
    const tabBtn = (k, l, sc = "") => { const on = tab === k && (k !== "posts" || scope === sc); return h("button", { class: "pf-tab" + (on ? " on" : ""), type: "button", role: "tab", "aria-selected": String(on), onclick: async () => { tab = k; if (k === "posts" && scope !== sc) { scope = sc; try { await loadAll(); } catch (e) { toast(e.message); } } draw(); } }, l); };
    const cell = (it) => h("button", { class: "pf-cell", type: "button", "aria-label": it.title || "레퍼런스 이미지", onclick: () => (isM() ? goPost(it.id) : postModal(it.id, async () => { await loadAll(); draw(); })) }, h("img", { src: it.thumb, alt: it.title || "", loading: "lazy" }), it.private ? h("span", { class: "prv" }, "비공개") : null);
    const grid = u.blocked ? notice("차단한 유저예요", `차단을 해제하면 ${u.nick}님의 게시물을 다시 볼 수 있어요.`) : tab === "posts"
      ? (posts.length && isM() ? pgrid(posts, {}, "c2") : posts.length ? h("div", { class: "pf-grid" }, posts.map(cell))
        : notice(kind === "illust" ? "일러스트 게시물이 없어요" : kind === "photo" ? "사진 게시물이 없어요" : scope === "private" ? "비공개 게시물이 없어요" : scope === "public" ? "공개 게시물이 없어요" : "아직 올린 게시물이 없어요", u.me ? "첫 레퍼런스를 올리면 AI가 태그를 붙여 줘요." : "", u.me ? btn("+ 업로드", "primary", () => openUpload()) : null))
      : (books.length ? h("div", { class: "pf-grid" }, books.map((b) => h("button", { class: "pf-cell book", type: "button", "aria-label": `${b.name} 열기`, onclick: () => (location.hash = "#/drawer/book/" + b.id) },
        b.cover ? h("img", { src: b.cover, alt: "" }) : (b.covers[0] ? h("img", { src: `/img/${b.covers[0]}?s=thumb`, alt: "" }) : h("span", { class: "ph" })), h("span", { class: "bn" }, h("b", {}, b.name), h("span", {}, `${b.count}개`)))))
        : notice("아직 북이 없어요", "서랍에서 새 북을 만들어 보세요.", btn("서랍으로", "primary", () => (location.hash = "#/drawer"))));
    root.replaceChildren(
      isM() ? (u.me ? mbar("마이페이지", { big: true, right: [h("button", { class: "icon-btn", type: "button", "aria-label": "게시물 등록", onclick: () => openUpload() }, icon("plus", 26)), h("a", { class: "icon-btn", href: "#/settings", "aria-label": "설정" }, icon("settings", 24))] })
        : mbar("", { back: true, right: [moreBtn] })) : "",
      h("div", { class: "pf-banner" + (u.cover ? " has" : "") }, u.cover ? h("img", { src: u.cover, alt: "" }) : null, isM() ? null : pcBack("#/", "on-banner")),
      h("div", { class: "pf-body" },
        h("aside", { class: "pf-side" },
          !isM() && !u.avatar ? htmlSpan("pf-av avt ph", AV_PH) : avatarEl(u, 134, "pf-av"), isM() ? null : moreBtn,
          h("div", { class: "pf-name" }, h("h1", {}, u.nick), h("span", {}, "@" + u.uid)),
          h("div", { class: "pf-stats" }, stat(u.posts, "게시물"), stat(u.followers, "팔로워", () => followsDialog(u, "followers", refresh)), stat(u.following, "팔로잉", () => followsDialog(u, "following", refresh))),
          h("div", { class: "pf-mid" }, u.bio ? h("p", { class: "pf-bio" }, u.bio) : null, acts),
          links),
        h("section", { class: "pf-main" },
          h("div", { class: "pf-tabs", role: "tablist" }, !isM() ? [["", "전체"], ["illust", "일러스트"], ["photo", "사진"]].map(([k, l]) => h("button", { class: "pf-tab" + (kind === k ? " on" : ""), type: "button", role: "tab", "aria-selected": String(kind === k), onclick: async () => { if (kind === k) return; kind = k; try { await loadAll(); } catch (e) { toast(e.message); } draw(); } }, l)) : u.me ? [tabBtn("posts", "전체", ""), tabBtn("posts", isM() ? "공개" : "공개 게시물", "public"), tabBtn("posts", isM() ? "비공개" : "비공개 게시물", "private"), tabBtn("books", `북 ${u.books}`)] : tabBtn("posts", isM() ? `게시물 ${u.posts}` : "게시물")),
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
  const snb = h("nav", { class: "st-snb", "aria-label": "내 설정" }, h("div", { class: "pc-head" }, h("button", { class: "pc-back", type: "button", "aria-label": "홈으로", title: "홈으로", onclick: () => (location.hash = "#/") }, icon("back", 24)), h("h1", {}, "내 설정")),
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
/* 계정 메뉴 아이콘 (Figma MenuCard 2574:148801 — icon/user · settings · language, 20) */
const ACCT_IC = { user: '<path d="M12.0844 6.24984C12.0844 5.69739 11.8646 5.16754 11.474 4.77686C11.0834 4.38624 10.5535 4.16659 10.0011 4.1665L9.79517 4.17708C9.31824 4.22444 8.86993 4.435 8.52808 4.77686C8.13748 5.16754 7.91772 5.69739 7.91772 6.24984C7.91777 6.80232 8.13741 7.33216 8.52808 7.72282C8.91877 8.11349 9.44855 8.33317 10.0011 8.33317C10.5536 8.33317 11.0833 8.11349 11.474 7.72282C11.8647 7.33216 12.0843 6.80232 12.0844 6.24984ZM13.3344 6.24984C13.3343 7.1338 12.9829 7.98155 12.3578 8.60661C11.7327 9.23167 10.8851 9.58317 10.0011 9.58317C9.11705 9.58317 8.2694 9.23167 7.64429 8.60661C7.01923 7.98155 6.66779 7.1338 6.66772 6.24984C6.66772 5.36598 7.0186 4.51815 7.64347 3.89307C8.26842 3.26798 9.11634 2.91672 10.0002 2.9165H10.0019L10.1671 2.92057C10.9908 2.96162 11.7727 3.30703 12.3586 3.89307C12.9835 4.51816 13.3344 5.36598 13.3344 6.24984Z"/><path d="M15.4173 16.0415C15.4173 13.8771 13.2121 12.0832 10.0007 12.0832C6.78925 12.0832 4.58398 13.8771 4.58398 16.0415C4.58398 16.0968 4.60595 16.1497 4.64502 16.1888C4.68409 16.2279 4.73706 16.2498 4.79232 16.2498H15.209C15.2642 16.2498 15.3172 16.2279 15.3563 16.1888C15.3954 16.1497 15.4173 16.0968 15.4173 16.0415ZM16.6673 16.0415C16.6673 16.4283 16.5136 16.7991 16.2401 17.0726C15.9666 17.3461 15.5958 17.4998 15.209 17.4998H4.79232C4.40554 17.4998 4.03472 17.3461 3.76123 17.0726C3.48774 16.7991 3.33398 16.4283 3.33398 16.0415C3.33398 12.8725 6.46205 10.8332 10.0007 10.8332C13.5392 10.8332 16.6673 12.8725 16.6673 16.0415Z"/>', settings: '<path d="M11.3083 2.625C11.6192 2.625 11.8826 2.85357 11.9268 3.1613L12.1172 4.49837L12.3914 4.61068L13.4648 3.80094C13.7136 3.61321 14.0631 3.63759 14.2835 3.85791L16.1423 5.71663C16.3623 5.93697 16.3866 6.2858 16.1992 6.53451L15.3879 7.60872L15.4993 7.88135L16.8381 8.07259C17.146 8.11658 17.3752 8.38086 17.3752 8.69189V11.3083C17.3752 11.6193 17.146 11.8828 16.8381 11.9268L15.5002 12.1172L15.3879 12.3906L16.1992 13.4648C16.3869 13.7136 16.3625 14.0631 16.1423 14.2835L14.2835 16.1423C14.0631 16.3625 13.7136 16.3869 13.4648 16.1992L12.3906 15.3879L12.1172 15.5002L11.9268 16.8381C11.8828 17.146 11.6193 17.3752 11.3083 17.3752H8.69189C8.38086 17.3752 8.11658 17.146 8.07259 16.8381L7.88135 15.4993L7.60872 15.3879L6.53451 16.1992C6.2858 16.3866 5.93697 16.3623 5.71663 16.1423L3.85791 14.2835C3.63759 14.0631 3.61321 13.7136 3.80094 13.4648L4.61068 12.3914L4.49837 12.1172L3.1613 11.9268C2.85357 11.8826 2.625 11.6192 2.625 11.3083V8.69189C2.625 8.38095 2.85352 8.11669 3.1613 8.07259L4.49919 7.88135L4.61068 7.60791L3.80094 6.53451C3.61345 6.28576 3.63774 5.93699 3.85791 5.71663L5.71663 3.85791L5.80452 3.78467C6.02235 3.63491 6.31677 3.63682 6.53451 3.80094L7.60791 4.61068L7.88135 4.49919L8.07259 3.1613L8.09945 3.0498C8.18373 2.79993 8.41986 2.625 8.69189 2.625H11.3083ZM9.06868 5.02979C9.03738 5.24893 8.89253 5.43547 8.68783 5.51969L7.75439 5.90299C7.55013 5.98689 7.31624 5.95707 7.13997 5.82406L6.21549 5.12581L5.12581 6.21549L5.82406 7.13997C5.95707 7.31624 5.98689 7.55013 5.90299 7.75439L5.51969 8.68783C5.43547 8.89253 5.24893 9.03738 5.02979 9.06868L3.875 9.23307V10.7663L5.02979 10.9315L5.11035 10.9486C5.29406 11.0001 5.44601 11.1331 5.51969 11.3123L5.90299 12.2458C5.98689 12.45 5.95707 12.6839 5.82406 12.8602L5.12581 13.7839L6.21549 14.8735L7.13997 14.1761L7.20915 14.1313C7.37467 14.0377 7.57571 14.0238 7.75439 14.0972L8.68783 14.4805L8.76107 14.5163C8.92657 14.6112 9.04116 14.7777 9.06868 14.9696L9.23389 16.1252H10.7663L10.9315 14.9696L10.9486 14.889C11.0002 14.7056 11.1333 14.5541 11.3123 14.4805L12.2458 14.0972L12.3239 14.0711C12.5078 14.0225 12.706 14.0597 12.8602 14.1761L13.7839 14.8735L14.8735 13.7839L14.1761 12.8602C14.0431 12.6839 14.0133 12.45 14.0972 12.2458L14.4805 11.3123L14.5163 11.2383C14.6113 11.073 14.7779 10.959 14.9696 10.9315L16.1252 10.7663V9.23307L14.9696 9.06868C14.7506 9.03727 14.5647 8.89238 14.4805 8.68783L14.0972 7.75439C14.0133 7.55013 14.0431 7.31624 14.1761 7.13997L14.8735 6.21549L13.7839 5.12581L12.8602 5.82406C12.6839 5.95707 12.45 5.98689 12.2458 5.90299L11.3123 5.51969C11.1076 5.4355 10.9628 5.24898 10.9315 5.02979L10.7663 3.875H9.23389L9.06868 5.02979Z"/><path d="M11.6671 9.99998C11.6671 9.55803 11.4912 9.13414 11.1788 8.82159C10.8663 8.50911 10.4423 8.33339 10.0004 8.33331L9.83518 8.34145C9.45381 8.37943 9.09538 8.54822 8.822 8.82159C8.50954 9.13414 8.33372 9.55803 8.33372 9.99998C8.33376 10.442 8.50948 10.8658 8.822 11.1784C9.13456 11.4909 9.55839 11.6666 10.0004 11.6666C10.4424 11.6666 10.8662 11.4909 11.1788 11.1784C11.4913 10.8658 11.667 10.442 11.6671 9.99998ZM12.9171 9.99998C12.917 10.7734 12.6095 11.5152 12.0626 12.0622C11.5156 12.6091 10.7739 12.9166 10.0004 12.9166C9.22688 12.9166 8.48519 12.6091 7.93821 12.0622C7.3913 11.5152 7.08379 10.7734 7.08372 9.99998C7.08372 9.22663 7.39067 8.48475 7.9374 7.93781C8.48421 7.39085 9.22617 7.08353 9.99957 7.08331H10.0012L10.1452 7.08657C10.8662 7.12239 11.5506 7.4249 12.0634 7.93781C12.6101 8.48475 12.9171 9.22663 12.9171 9.99998Z"/>', language: '<path d="M16.875 10C16.875 8.17683 16.1507 6.42844 14.8617 5.13916C13.5724 3.84982 11.8233 3.1251 10 3.125L9.65902 3.13314C7.95969 3.21745 6.34708 3.93033 5.13835 5.13916C3.84928 6.42844 3.125 8.17683 3.125 10C3.12505 11.8233 3.84908 13.5724 5.13835 14.8617C6.42765 16.1509 8.17667 16.875 10 16.875C11.8233 16.875 13.5723 16.1509 14.8617 14.8617C16.1509 13.5724 16.8749 11.8233 16.875 10ZM18.125 10C18.1249 12.1548 17.2691 14.2218 15.7454 15.7454C14.2217 17.2691 12.1548 18.125 10 18.125C7.84515 18.125 5.77828 17.2691 4.25456 15.7454C2.73088 14.2218 1.87506 12.1548 1.875 10C1.875 7.84532 2.73107 5.77907 4.25456 4.25537C5.77811 2.73169 7.84447 1.87522 9.99919 1.875H10.0008L10.4036 1.88477C12.4117 1.98457 14.3171 2.82691 15.7454 4.25537C17.2689 5.77907 18.125 7.84531 18.125 10Z"/><path d="M12.3747 10C12.3747 7.43071 11.5818 5.25 9.99926 3.42448C8.4169 5.24993 7.62458 7.43086 7.62458 10C7.62458 12.5689 8.41716 14.7493 9.99926 16.5747C11.5815 14.7493 12.3747 12.5691 12.3747 10ZM13.6247 10C13.6247 13.1154 12.5648 15.7741 10.446 17.937C10.3285 18.057 10.168 18.125 10 18.125C9.83212 18.1249 9.67078 18.0569 9.55329 17.937C7.43452 15.7741 6.37458 13.1154 6.37458 10C6.37458 6.88457 7.43452 4.22594 9.55329 2.06299L9.64851 1.98242C9.75117 1.91279 9.87326 1.87507 9.99919 1.875C10.1672 1.875 10.3285 1.94298 10.446 2.06299C12.5648 4.22593 13.6247 6.88461 13.6247 10Z"/><path d="M16.9994 11.875C17.3446 11.875 17.6244 12.1548 17.6244 12.5C17.6244 12.8452 17.3446 13.125 16.9994 13.125H2.99958C2.65441 13.125 2.37458 12.8452 2.37458 12.5C2.37458 12.1548 2.65441 11.875 2.99958 11.875H16.9994ZM16.9994 6.875C17.3446 6.875 17.6244 7.15482 17.6244 7.5C17.6244 7.84518 17.3446 8.125 16.9994 8.125H2.99958C2.65441 8.125 2.37458 7.84518 2.37458 7.5C2.37458 7.15482 2.65441 6.875 2.99958 6.875H16.9994Z"/>' };
function acctIc(k) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 20 20"); s.setAttribute("width", "20"); s.setAttribute("height", "20"); s.setAttribute("fill", "currentColor"); s.setAttribute("class", "acct-ic"); s.setAttribute("aria-hidden", "true"); s.innerHTML = ACCT_IC[k]; return s; }
function accountMenu(anchor) {
  const old = document.querySelector(".acct"); if (old) { old.remove(); return; }
  const r = anchor.getBoundingClientRect();
  const lang = (window.REFFY_LANG && REFFY_LANG.get()) || "ko";
  const seg = h("span", { class: "acct-seg", role: "radiogroup", "aria-label": "언어" }, [["ko", "KOR"], ["en", "ENG"]].map(([k, l]) =>
    h("button", { type: "button", role: "radio", "aria-checked": String(lang === k), class: lang === k ? "on" : "", "data-i18n-skip": "1", onclick: (e) => { e.stopPropagation(); seg.querySelectorAll("button").forEach((b) => { const on = b === e.currentTarget; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }); if (window.REFFY_LANG) REFFY_LANG.set(k); } }, l)));
  const go = (fn) => () => { m.remove(); fn(); };
  const m = h("div", { class: "acct", role: "menu", style: `right:${Math.max(8, window.innerWidth - r.right)}px;top:${r.bottom + 12}px`, onclick: (e) => e.stopPropagation() },
    h("div", { class: "acct-me" }, avatarEl(ME, 40), h("span", {}, h("b", {}, ME.nick), h("small", {}, "@" + ME.uid))),
    h("i", { class: "acct-div acct-div1" }),
    h("button", { type: "button", role: "menuitem", class: "acct-it", onclick: go(() => (location.hash = "#/me")) }, acctIc("user"), h("span", {}, "마이페이지")),
    h("button", { type: "button", role: "menuitem", class: "acct-it", onclick: go(() => (location.hash = "#/settings")) }, acctIc("settings"), h("span", {}, "설정")),
    h("div", { class: "acct-lang" }, acctIc("language"), h("span", {}, "언어"), seg),
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
      (d.tools || []).length ? h("section", { class: "pm-sec" }, h("div", { class: "pm-sh" }, h("h3", {}, "사용한 툴")), h("div", { class: "dp-tools" }, d.tools.map((t) => h("span", { class: "dp-tool" }, t)))) : null,
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
