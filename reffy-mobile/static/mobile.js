"use strict";
/* REFFY — 모바일(767px 이하) 화면 조각. Figma "Mobile 2차" 와이어프레임 기준.
   공통 틀(앱바 · 바텀시트), 게시물 상세, 알림, 서랍, 설정 화면이 들어 있습니다. app.js 의 공통 함수를 씁니다. */

/* ---------------------------------------------------------------- 공통: 앱바 · 바텀시트 */
function mbar(title, o = {}) {
  return h("header", { class: "mbar" + (o.big ? " big" : "") },
    o.back ? h("button", { class: "icon-btn", type: "button", "aria-label": "뒤로", onclick: typeof o.back === "function" ? o.back : () => history.back() }, icon("back", 24)) : null,
    h("h1", {}, title), h("div", { class: "mbar-r" }, o.right || []));
}
function sheet(title, body, foot, cls) {
  const close = () => { ov.remove(); document.removeEventListener("keydown", key); };
  const key = (e) => { if (e.key === "Escape") close(); };
  const ov = h("div", { class: "modal msheet " + (cls || ""), onmousedown: (e) => e.target === ov && close() },
    h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "m-sheet-h" }, h("h2", {}, title), h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: close }, icon("close", 24))),
      h("div", { class: "sheet-b" }, [body].flat(4)), foot || null));
  document.body.append(ov); document.addEventListener("keydown", key);
  return { el: ov, close };
}
/* 메뉴 시트: [{ic, label, fn, danger, on}] */
function sheetMenu(title, items) {
  const s = sheet(title, items.map((it) => h("button", { class: "srow" + (it.danger ? " danger" : ""), type: "button", "aria-pressed": it.on == null ? null : String(!!it.on), onclick: () => { s.close(); it.fn(); } },
    it.ic ? icon(it.ic, 24) : null, h("span", {}, it.label), it.on ? icon("check", 20) : null)), null, "smenu");
  return s;
}
const jsonOpt = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/* ---------------------------------------------------------------- 홈: 필터 버튼 · 검색 상태 */
function mobileBar(hasQ) {
  const any = hasQ || S.applied.length || S.colors.length;
  document.body.classList.toggle("searching", !!any);
  $("#mBack").hidden = !hasQ && !document.documentElement.classList.contains("m-search");
  if (!isM()) return;
  const n = S.applied.length + S.colors.length, fb = $("#filterBtn");
  fb.replaceChildren(icon("filter", 16), "필터" + (n ? " " + n : "")); fb.classList.toggle("on", n > 0);
}
$("#mOv").onclick = () => setFilterOpen(false);
$("#mFilterClose").onclick = () => setFilterOpen(false);
$("#mReset").onclick = () => { $("#reset").click(); };
$("#mBack").onclick = () => {
  const root = document.documentElement;
  if (root.classList.contains("m-search")) { root.classList.remove("m-search"); qEl.value = S.q; qEl.blur(); $("#mBack").hidden = !S.q; return; }
  S.q = ""; qEl.value = ""; reload();
};
qEl.addEventListener("focus", () => { if (isM()) { document.documentElement.classList.add("m-search"); $("#mBack").hidden = false; } });
if (isM()) {
  setFilterOpen(false);
  qEl.placeholder = "찾고 싶은 레퍼런스, 유저를 검색해보세요";
  $("#tabTag").textContent = "키워드"; $("#tabColor").textContent = "무드";
  document.querySelector(".tabs [disabled]").textContent = "3D Pose";
  $("#apply").textContent = "적용하기";
  mobileBar(false);
}
if (LAYOUT === "auto") MQ.addEventListener("change", () => location.reload());   // PC ↔ 모바일 틀이 달라 새로 그립니다

/* ---------------------------------------------------------------- 공유 · 신고 */
async function sharePost(d) {
  const url = location.origin + location.pathname + "#/post/" + d.id;
  try {
    if (navigator.share) await navigator.share({ title: d.title || "REFFY 레퍼런스", url });
    else { await navigator.clipboard.writeText(url); toast("링크를 복사했어요"); }
  } catch { /* 공유 취소 */ }
}
const REPORT_REASONS = ["스팸 · 광고", "음란물 · 선정적인 내용", "폭력적이거나 혐오스러운 내용", "저작권 침해 (무단 도용)", "기타"];
function reportSheet(type, id) {
  if (!needLogin()) return;
  let reason = "";
  const detail = h("textarea", { class: "inp ta", maxlength: "200", placeholder: "신고 사유를 입력해 주세요 (최대 200자)", "aria-label": "신고 사유", hidden: true });
  const list = h("div", { role: "radiogroup", "aria-label": "신고 사유" });
  const draw = () => list.replaceChildren(...REPORT_REASONS.map((r) => h("button", { class: "srow rdrow", type: "button", role: "radio", "aria-checked": String(reason === r), onclick: () => { reason = r; detail.hidden = r !== "기타"; draw(); } }, h("i", { class: "rd" }), h("span", {}, r))));
  draw();
  const s = sheet("신고하기", [h("p", { class: "sheet-p" }, "신고 사유를 선택해 주세요"), list, detail],
    h("div", { class: "sheet-f" }, h("button", { class: "btn primary block", type: "button", onclick: async () => {
      if (!reason) return toast("신고 사유를 선택해 주세요.");
      try { await api("/api/reports", jsonOpt("POST", { target_type: type, target_id: String(id), reason, detail: detail.value })); s.close(); toast("신고가 접수됐어요"); } catch (e) { toast(e.message); }
    } }, "신고하기")));
}

/* ---------------------------------------------------------------- 게시물 상세 (COM_0100) */
function commentRow(d, c, edit, after) {
  return h("li", {}, h("span", { class: "av lg" }, c.nick.slice(0, 1)),
    h("div", { class: "ct" }, h("b", {}, c.nick, h("small", {}, ago(c.created))), h("span", {}, c.body)),
    h("button", { class: "icon-btn cmore", type: "button", "aria-label": "댓글 더보기", onclick: () => sheetMenu("댓글", [c.mine
      ? { ic: "trash", label: "댓글 삭제하기", danger: true, fn: async () => { try { await api(`/api/comments/${c.id}`, { method: "DELETE" }); await refreshSocial(d, edit); after && after(); } catch (e) { toast(e.message); } } }
      : { ic: "flag", label: "댓글 신고하기", danger: true, fn: () => reportSheet("comment", c.id) }]) }, icon("more", 20)));
}
function commentsSheet(d, edit) {
  const list = h("ul", { class: "clist" });
  const input = h("input", { class: "cin", maxlength: "500", placeholder: "댓글을 남겨보세요", "aria-label": "댓글 입력" });
  const send = async () => {
    const v = input.value.trim(); if (!ME) { s.close(); return needLogin(); } if (!v) return;
    try { await api(`/api/images/${d.id}/comments`, jsonOpt("POST", { body: v })); input.value = ""; await refreshSocial(d, edit); draw(); } catch (e) { toast(e.message); }
  };
  input.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); send(); } };
  const s = sheet("댓글", list, h("div", { class: "sheet-f cform" }, input, h("button", { class: "btn primary", type: "button", onclick: send }, "게시")), "tall");
  const draw = () => {
    s.el.querySelector(".m-sheet-h h2").textContent = `댓글 ${d.so.comments.length}`;
    list.replaceChildren(...(d.so.comments.length ? d.so.comments.map((c) => commentRow(d, c, edit, draw)) : [h("p", { class: "hint" }, "아직 댓글이 없어요. 첫 댓글을 남겨 보세요.")]));
  };
  draw();
}
function drawDetailM(d, edit = false) {
  const panel = $("#panel"), so = d.so || { likes: 0, comments: [], owner: null, editable: false }, o = so.owner;
  const on = d.tags.filter((t) => t.active), off = d.tags.filter((t) => !t.active);
  const pct = (t) => (t.prob != null && t.user !== "add" ? Math.round(t.prob * 100) + "%" : "");
  const tagEl = (t) => edit
    ? h("button", { class: "tag " + (t.user === "add" ? "user" : "ai"), type: "button", "aria-label": `${t.label} 태그 삭제`, onclick: () => save(d, { remove: [t.ikey] }, t) }, "#" + t.label, h("span", { class: "pr" }, pct(t)), h("x", {}, "×"))
    : h("button", { class: "tag", type: "button", onclick: () => { S.picked = new Set([t.ikey]); S.applied = [t.ikey]; S.q = ""; qEl.value = ""; drawGroups(); closeDetail(); location.hash = "#/"; reload(); } }, "#" + t.label);
  const keepAct = () => act(d, so.kept ? "DELETE" : "POST", `/api/images/${d.id}/keep`, null, edit);
  const bookAct = () => needLogin() && saveToBook([d.id], { after: () => refreshSocial(d, edit) });
  const menu = () => sheetMenu("더보기", [
    { ic: "save", label: "북에 추가", fn: bookAct },
    { ic: "keep", label: so.kept ? "킵 해제" : "킵에 담기", fn: keepAct },
    ...(so.editable
      ? [{ ic: "edit", label: edit ? "수정 완료" : "수정하기", fn: () => drawDetail(d, !edit) }, { ic: "trash", label: "삭제하기", danger: true, fn: () => removePost(d) }]
      : [{ ic: "share", label: "공유하기", fn: () => sharePost(d) }, { ic: "flag", label: "이 게시물 신고하기", danger: true, fn: () => reportSheet("post", d.id) }])]);
  const comment = h("input", { class: "cin", maxlength: "500", placeholder: ME ? "댓글을 남겨보세요" : "로그인하고 댓글을 남겨보세요", "aria-label": "댓글 입력" });
  const send = () => { const v = comment.value.trim(); if (!ME) return needLogin(); if (v) act(d, "POST", `/api/images/${d.id}/comments`, { body: v }, edit); };
  comment.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); send(); } };
  const circ = (ic, label, fn) => h("button", { class: "circ", type: "button", "aria-label": label, title: label, onclick: fn }, icon(ic, 20));
  const rel = h("div", { class: "sec rel" });
  const drawRel = () => { if (d.rel && d.rel.length) rel.replaceChildren(h("div", { class: "sec-h" }, h("h3", {}, "연관 이미지")), h("div", { class: "grid" }, d.rel.map(card))); };
  panel.replaceChildren(
    h("div", { class: "mbar" },
      h("button", { class: "icon-btn", type: "button", "aria-label": "뒤로", onclick: () => (S.hist.length ? goBack() : closeDetail()) }, icon("back", 24)),
      h("h1", {}, ""), h("div", { class: "mbar-r" }, h("button", { class: "icon-btn", type: "button", "aria-label": "닫기", onclick: closeDetail }, icon("close", 24)))),
    h("div", { class: "pimg" }, h("img", { src: d.full, alt: d.title || "레퍼런스 이미지" }),
      h("div", { class: "imgtop" }, circ("share", "공유하기", () => sharePost(d)), h("span", { class: "vdots" }, circ("more", "더보기", menu))),
      h("div", { class: "imgact" }, circ("palette", "이 이미지의 색상으로 찾기", () => pullPalette(d.id))),
      o ? h("a", { class: "imgwho", href: "#/u/" + o.uid }, avatarEl(o, 20), "@" + o.uid) : null),
    h("div", { class: "pbody" },
      h("div", { class: "who" }, o ? avatarEl(o, 40, "av") : h("span", { class: "av" }, (d.author || "?").slice(0, 1)),
        h("div", {}, o ? h("a", { class: "pname", href: "#/u/" + o.uid }, d.author) : h("b", {}, d.author), h("span", {}, o ? `@${o.uid}` : `조회 ${d.views.toLocaleString()}`)),
        o && !o.me ? h("button", { class: "btn" + (o.following ? "" : " primary"), type: "button", onclick: () => act(d, o.following ? "DELETE" : "POST", `/api/users/${o.uid}/follow`, null, edit) }, o.following ? "팔로잉" : "팔로우") : null),
      h("h2", { class: "ptitle" }, d.title || "제목 없음"),
      h("div", { class: "prow" },
        h("button", { class: "stat" + (so.liked ? " on" : ""), type: "button", "aria-pressed": String(!!so.liked), "aria-label": "하트", onclick: () => act(d, so.liked ? "DELETE" : "POST", `/api/images/${d.id}/like`, null, edit) }, icon("heart", 22), String(so.likes)),
        h("button", { class: "stat", type: "button", "aria-label": "댓글", onclick: () => commentsSheet(d, edit) }, icon("comment", 22), String(so.comments.length))),
      h("div", { class: "sec" },
        h("div", { class: "sec-h" }, h("h3", {}, "태그"), so.editable && edit ? h("button", { class: "btn sm", type: "button", onclick: () => drawDetail(d, false) }, "수정 완료") : null),
        h("div", { class: "tags" }, on.length ? on.map(tagEl) : h("span", { class: "hint" }, "아직 태그가 없어요.")),
        edit ? h("div", { class: "tags", style: "margin-top:10px" }, pickButton(h("div", { class: "pick" }), (t) => save(d, { add: [t.ikey] }, t), () => new Set(d.tags.filter((x) => x.active).map((x) => x.ikey))),
          off.map((t) => h("button", { class: "tag off", type: "button", onclick: () => save(d, { restore: [t.ikey] }, t) }, "#" + t.label))) : null,
        edit ? h("p", { class: "hint" }, "태그를 눌러 지우거나, 흐린 태그를 눌러 되살릴 수 있어요.") : null),
      h("div", { class: "sec" },
        h("div", { class: "sec-h" }, h("h3", {}, `댓글 ${so.comments.length}`)),
        h("div", { class: "cform" }, comment, h("button", { class: "btn primary", type: "button", onclick: send }, "게시")),
        h("ul", { class: "clist" }, so.comments.slice(0, 2).map((c) => commentRow(d, c, edit))),
        so.comments.length > 2 ? h("button", { class: "btn block allc", type: "button", onclick: () => commentsSheet(d, edit) }, `댓글 ${so.comments.length}개 모두 보기`) : null),
      rel));
  if (d.rel) drawRel();
  else api(`/api/images/${d.id}/related`).then((r) => { d.rel = r.items; if (S.open === d.id) drawRel(); }).catch(() => {});
}

/* ---------------------------------------------------------------- 알림 (HOM_0401) */
async function notifPage() {
  if (!needLogin()) return;
  const box = h("div", { class: "npage" });
  page(h("div", { class: "mpage" }, mbar("알림", { back: () => (location.hash = "#/"), right: [h("button", { class: "linkbtn", type: "button", onclick: async () => {
    try { await api("/api/notifications/read", { method: "POST" }); UNREAD = 0; drawMe(); drawNotif(box); } catch (e) { toast(e.message); } } }, "모두 읽음")] }), box));
  drawNotif(box);
}

/* ---------------------------------------------------------------- 서랍 (DRW_) */
async function drawerPageM(sub, id) {
  const root = h("div", { class: "mpage drw" }); page(root);
  try {
    if (sub === "book") return await bookDetailM(root, id);
    if (sub === "recent") {
      const d = await api("/api/me/viewed");
      return root.replaceChildren(mbar("최근 본 게시물", { back: () => (location.hash = "#/drawer/act") }),
        h("div", { class: "pad" }, d.items.length ? pgrid(d.items, {}, "c2") : notice("최근 본 게시물이 없어요", "홈에서 마음에 드는 레퍼런스를 찾아 보세요.")));
    }
    if (sub === "liked") {
      let kind = ""; const body = h("div", {});
      const load = async () => {
        const d = await api("/api/me/reacted" + (kind ? "?kind=" + kind : ""));
        body.replaceChildren(h("div", { class: "kbar" }, [["", "전체"], ["like", "하트"], ["comment", "댓글"]].map(([k, l]) => h("button", { class: "pill" + (kind === k ? " on" : ""), type: "button", onclick: () => { kind = k; load().catch((e) => toast(e.message)); } }, l))),
          d.items.length ? pgrid(d.items, {}, "c2") : notice("아직 반응한 게시물이 없어요", "하트나 댓글을 남기면 여기에 모여요."));
      };
      root.replaceChildren(mbar("반응한 게시물", { back: () => (location.hash = "#/drawer/act") }), h("div", { class: "pad" }, body));
      return await load();
    }
    const act_ = sub === "act", main = h("div", { class: "dmain" });
    const redo = () => bookList(main);
    root.replaceChildren(mbar("서랍", { big: true, right: [h("button", { class: "icon-btn", type: "button", "aria-label": "새 북 만들기", onclick: () => bookDialog(null, () => { location.hash = "#/drawer"; redo(); }) }, icon("plus", 26))] }),
      h("div", { class: "mtabs", role: "tablist" }, h("a", { href: "#/drawer", role: "tab", class: act_ ? "" : "on", "aria-selected": String(!act_) }, "북"), h("a", { href: "#/drawer/act", role: "tab", class: act_ ? "on" : "", "aria-selected": String(act_) }, "내 활동")),
      main);
    if (!act_) return await bookList(main);
    const [v, r] = await Promise.all([api("/api/me/viewed"), api("/api/me/reacted")]);
    const head = (t, s, href) => h("div", { class: "act-h" }, h("div", {}, h("h2", {}, t), h("p", {}, s)), h("a", { href }, "전체보기", icon("chevR", 16)));
    main.replaceChildren(
      head("최근 본 게시물", "최근 일주일 동안 본 게시물이에요", "#/drawer/recent"),
      v.items.length ? h("div", { class: "hscroll" }, v.items.slice(0, 12).map((it) => h("button", { type: "button", "aria-label": it.title || "레퍼런스 이미지", onclick: () => goPost(it.id) }, h("img", { src: it.thumb, alt: "", loading: "lazy" })))) : h("p", { class: "hint" }, "최근 본 게시물이 없어요."),
      head("반응한 게시물", "하트나 댓글을 남긴 게시물이에요", "#/drawer/liked"),
      h("div", { class: "kbar" }, h("span", { class: "pill on" }, `전체 ${r.counts.all}`), h("a", { class: "pill", href: "#/drawer/liked" }, `하트 ${r.counts.like}`), h("a", { class: "pill", href: "#/drawer/liked" }, `댓글 ${r.counts.comment}`)),
      r.items.length ? h("div", { class: "sq3" }, r.items.slice(0, 9).map((it) => h("button", { type: "button", "aria-label": it.title || "레퍼런스 이미지", onclick: () => goPost(it.id) }, h("img", { src: it.thumb, alt: "", loading: "lazy" }), h("i", {}, icon(it.re === "comment" ? "comment" : "heart", 14))))) : h("p", { class: "hint" }, "아직 반응한 게시물이 없어요."));
  } catch (e) { root.replaceChildren(mbar("서랍", { big: true }), notice("불러오지 못했어요", e.message)); }
}
async function bookDetailM(root, id) {
  const b = await api("/api/books/" + id); const redo = () => bookDetailM(root, id).catch((e) => toast(e.message));
  let sel = false; const picked = new Set();
  const removeItems = async () => { await api(`/api/books/${id}/items/remove`, jsonOpt("POST", { ids: [...picked] })); };
  const del = async () => {
    if (!picked.size) return toast("삭제할 이미지를 골라 주세요.");
    if (!(await confirmDialog("선택한 이미지를 삭제할까요?", "삭제한 이미지는 이 북에서 사라져요.", { ok: "삭제", danger: true }))) return;
    try { await removeItems(); toast("북에서 삭제했어요"); redo(); } catch (e) { toast(e.message); }
  };
  const move = async () => {
    if (!picked.size) return toast("이동할 이미지를 골라 주세요.");
    let books; try { books = (await api("/api/books")).items.filter((x) => x.id !== id); } catch (e) { return toast(e.message); }
    if (!books.length) return toast("이동할 다른 북이 없어요. 서랍에서 새 북을 만들어 주세요.");
    const s = sheet("이동하기", [h("p", { class: "sheet-p" }, "내 북"), books.map((x) => h("button", { class: "brow-pick", type: "button", onclick: async () => {
      try { await api(`/api/books/${x.id}/items`, jsonOpt("POST", { ids: [...picked], remove_from_keep: false })); await removeItems(); s.close(); toast(`“${x.name}”(으)로 이동했어요`); redo(); } catch (e) { toast(e.message); }
    } }, x.covers[0] ? h("img", { src: `/img/${x.covers[0]}?s=thumb`, alt: "" }) : h("span", { class: "th" }), h("span", { class: "bt" }, h("b", {}, x.name), h("span", {}, `${x.count}개`))))]);
  };
  const more = () => sheetMenu("더보기", [{ ic: "edit", label: "북 수정", fn: () => bookDialog(b, redo) }, { ic: "trash", label: "북 삭제", danger: true, fn: async () => {
    if (!(await confirmDialog(`‘${b.name}’ 북을 삭제할까요?`, "담긴 게시물 자체는 삭제되지 않아요.", { ok: "삭제", danger: true }))) return;
    try { await api("/api/books/" + id, { method: "DELETE" }); location.hash = "#/drawer"; } catch (e) { toast(e.message); } } }]);
  function draw() {
    root.classList.toggle("selecting", sel);
    root.replaceChildren(mbar("", { back: () => (location.hash = "#/drawer"), right: [b.items.length ? h("button", { class: "linkbtn", type: "button", onclick: () => { sel = !sel; picked.clear(); draw(); } }, sel ? "취소" : "선택") : null] }),
      h("div", { class: "pad" },
        h("div", { class: "bk-h" }, h("div", {}, h("h1", {}, b.name), h("p", {}, `총 ${b.count}장 · ${ago(b.updated)}`), b.description ? h("p", {}, b.description) : null),
          h("span", { class: "vdots" }, h("button", { class: "icon-btn", type: "button", "aria-label": "북 메뉴", onclick: more }, icon("more", 24)))),
        b.items.length ? pgrid(b.items, (it) => ({ on: picked.has(it.id), click: (_, el) => { if (!sel) return goPost(it.id); picked.has(it.id) ? picked.delete(it.id) : picked.add(it.id); el.classList.toggle("on", picked.has(it.id)); root.querySelector(".selbar b").textContent = `${picked.size}개 선택`; } }), "c2")
          : notice("이 북은 비어 있어요", "게시물의 더보기 메뉴에서 ‘북에 추가’를 눌러 담아 보세요.")),
      h("div", { class: "selbar", hidden: !sel }, h("b", {}, `${picked.size}개 선택`), h("span", { class: "sp" }), btn("삭제", "", del), btn("이동", "primary", move)));
  }
  draw();
}

/* ---------------------------------------------------------------- 설정 (MYP_0300 ~ 0310) */
const TERMS = [["제1조 (목적)", "이 약관은 REFFY(이하 “서비스”)가 제공하는 레퍼런스 검색 · 저장 서비스의 이용 조건과 절차, 이용자와 서비스의 권리 · 의무를 정하는 것을 목적으로 합니다."],
  ["제2조 (수집하는 정보)", "서비스는 회원 가입, 게시물 등록, 문의 처리를 위해 아이디, 닉네임, 프로필 이미지 등 최소한의 정보를 수집합니다."],
  ["제3조 (보관 기간)", "회원 탈퇴 시 관련 법령에 따라 보관이 필요한 정보를 제외한 모든 정보를 지체 없이 파기합니다."]];
async function logoutAsk() { if (await confirmDialog("로그아웃할까요?", "", { ok: "로그아웃", cancel: "취소" })) doLogout(); }
async function settingsPage(sub) {
  if (!needLogin()) return;
  const root = h("div", { class: "mpage set" }); page(root);
  const show = (title, ...kids) => root.replaceChildren(mbar(title, { back: () => (location.hash = sub ? "#/settings" : "#/me") }), ...kids.flat(4).filter((k) => k != null && k !== false));
  const row = (label, href, extra) => h("a", { class: "srow2", href }, h("span", {}, label), extra ? h("small", {}, extra) : null, icon("chevR", 20));
  const sw = (label, sub_, on, fn, disabled) => h("label", { class: "swrow" + (disabled ? " off" : "") }, h("span", {}, h("b", {}, label), h("small", {}, sub_)),
    h("input", { type: "checkbox", class: "sw-in", role: "switch", checked: on, disabled, onchange: (e) => fn && fn(e.target.checked) }), h("i", { class: "sw-ui" }));
  const group = (t) => h("h3", { class: "sgroup" }, t);
  try {
    if (!sub) return show("설정", group("알림 · 계정"), row("알림 설정", "#/settings/notif"), row("계정 관리", "#/settings/account"), row("보안", "#/settings/security"), row("차단 유저", "#/settings/blocks"),
      h("div", { class: "sgap" }), group("고객 지원"), row("문의하기", "#/settings/inquiry"), h("div", { class: "srow2" }, h("span", {}, "앱 버전"), h("small", {}, "v1.0.0")), row("개인정보 처리 방침", "#/settings/privacy"), row("서비스 약관", "#/settings/terms"),
      h("div", { class: "sgap" }), h("button", { class: "srow2 plain", type: "button", onclick: logoutAsk }, "로그아웃"), h("a", { class: "srow2 plain dim", href: "#/settings/leave" }, "탈퇴하기"));
    if (sub === "notif") {
      const st = await api("/api/me/settings"); const n = st.notif;
      const put = async (k, v) => { n[k] = v; try { await api("/api/me/settings", jsonOpt("PUT", { notif: n })); } catch (e) { toast(e.message); } };
      return show("알림 설정", group("활동 알림"), sw("팔로워", "새로운 팔로워가 생기면 알려드려요", n.follow, (v) => put("follow", v)), sw("댓글", "내 게시물에 댓글이 달리면", n.comment, (v) => put("comment", v)), sw("하트", "내 게시물에 하트가 눌리면", n.like, (v) => put("like", v)),
        h("div", { class: "sgap" }), group("알림 수신 시간"), sw("방해 금지 시간 사용", "준비 중인 기능이에요", false, null, true));
    }
    if (sub === "account") return show("계정 관리", group("로그인 정보"), h("div", { class: "srow2" }, h("span", {}, "아이디"), h("small", {}, "@" + ME.uid)), h("div", { class: "srow2" }, h("span", {}, "닉네임"), h("small", {}, ME.nick)),
      h("div", { class: "sgap" }), group("연결된 계정"), ["Google", "카카오", "네이버", "X"].map((x) => h("div", { class: "srow2" }, h("span", {}, x), h("small", {}, "준비 중"))));
    if (sub === "security") {
      const f = (id, ph, ac) => h("input", { class: "inp", id, type: "password", placeholder: ph, autocomplete: ac });
      const cur = f("pwCur", "지금 쓰는 비밀번호", "current-password"), pw = f("pwNew", "영문 · 숫자 포함 8자 이상", "new-password"), pw2 = f("pwNew2", "새 비밀번호를 한 번 더 입력", "new-password");
      return show("보안", group("비밀번호"), h("form", { class: "sform", onsubmit: async (e) => { e.preventDefault();
        try { await api("/api/me/password", jsonOpt("PUT", { cur: cur.value, pw: pw.value, pw2: pw2.value })); cur.value = pw.value = pw2.value = ""; toast("비밀번호를 바꿨어요"); } catch (er) { toast(er.message); } } },
        h("label", { for: "pwCur" }, "현재 비밀번호"), cur, h("label", { for: "pwNew" }, "새 비밀번호"), pw, h("label", { for: "pwNew2" }, "새 비밀번호 확인"), pw2, h("button", { class: "btn primary block", type: "submit" }, "비밀번호 변경")),
        h("div", { class: "sgap" }), group("2단계 인증"), sw("2단계 인증 사용", "준비 중인 기능이에요", false, null, true));
    }
    if (sub === "blocks") {
      const d = await api("/api/me/blocks");
      return show("차단 유저", h("p", { class: "scount" }, `차단한 유저 ${d.items.length}명`),
        d.items.length ? d.items.map((x) => h("div", { class: "fl-row" }, avatarEl(x, 44), h("span", { class: "fl-name" }, h("b", {}, x.uid), h("span", {}, x.nick)),
          btn("차단 해제", "", async () => { try { await api(`/api/users/${x.uid}/block`, { method: "DELETE" }); toast("차단을 해제했어요"); settingsPage("blocks"); } catch (e) { toast(e.message); } })))
          : notice("차단한 유저가 없어요", "프로필의 더보기 메뉴에서 차단할 수 있어요."));
    }
    if (sub === "inquiry") {
      const kind = h("select", { class: "inp", id: "iqKind" }, h("option", { value: "" }, "유형을 선택하세요"), ["계정 · 로그인", "게시물 · 태그", "신고 · 차단", "오류 제보", "기타"].map((x) => h("option", {}, x)));
      const body = h("textarea", { class: "inp ta", id: "iqBody", maxlength: "1000", placeholder: "문의 내용을 자세히 적어 주세요 (최대 1,000자)" });
      return show("문의하기", h("form", { class: "sform", onsubmit: async (e) => { e.preventDefault();
        try { await api("/api/inquiries", jsonOpt("POST", { kind: kind.value, body: body.value })); toast("문의를 보냈어요"); location.hash = "#/settings"; } catch (er) { toast(er.message); } } },
        h("label", { for: "iqKind" }, "문의 유형"), kind, h("label", { for: "iqBody" }, "문의 내용"), body, h("button", { class: "btn primary block", type: "submit" }, "문의 보내기")));
    }
    if (sub === "privacy" || sub === "terms") {
      const t = sub === "privacy" ? "개인정보 처리 방침" : "서비스 약관";
      return show(t, h("article", { class: "doc" }, h("h2", {}, t), h("p", { class: "date" }, "시행일 2026. 11. 01."), TERMS.map(([a, b]) => [h("h3", {}, a), h("p", {}, b)])));
    }
    if (sub === "leave") {
      const reason = h("select", { class: "inp", id: "lvWhy" }, h("option", { value: "" }, "이유를 선택하세요"), ["쓰지 않게 됐어요", "원하는 레퍼런스가 없어요", "쓰기 불편해요", "다른 서비스를 써요", "기타"].map((x) => h("option", {}, x)));
      const pw = h("input", { class: "inp", id: "lvPw", type: "password", placeholder: "본인 확인을 위해 비밀번호를 입력해 주세요", autocomplete: "current-password" });
      const ok = h("input", { class: "cbx", type: "checkbox" });
      return show("탈퇴하기", h("form", { class: "sform", onsubmit: async (e) => { e.preventDefault();
        if (!ok.checked) return toast("안내 사항을 확인해 주세요.");
        if (!pw.value) return toast("비밀번호를 입력해 주세요.");
        if (!(await confirmDialog("정말 탈퇴할까요?", "탈퇴하면 모든 정보가 삭제되고 다시 복구할 수 없어요.", { ok: "탈퇴하기", danger: true }))) return;
        try { await api("/api/me/leave", jsonOpt("POST", { pw: pw.value, reason: reason.value })); ME = null; UNREAD = 0; drawMe(); location.hash = "#/"; toast("탈퇴가 완료됐어요"); } catch (er) { toast(er.message); } } },
        h("h2", {}, "탈퇴하기 전에 꼭 확인해 주세요"),
        h("ul", { class: "lv-list" }, ["등록한 게시물 · 댓글 · 하트가 모두 삭제돼요.", "서랍의 북과 킵 스페이스에 담은 레퍼런스가 사라져요.", "삭제된 정보는 다시 복구할 수 없어요."].map((x) => h("li", {}, x))),
        h("label", { for: "lvWhy" }, "떠나시는 이유 (선택)"), reason, h("label", { for: "lvPw" }, "비밀번호"), pw,
        h("label", { class: "lv-ok" }, ok, "안내 사항을 모두 확인했어요"), h("button", { class: "btn danger block", type: "submit" }, "탈퇴하기")));
    }
    location.hash = "#/settings";
  } catch (e) { show("설정", notice("불러오지 못했어요", e.message)); }
}
