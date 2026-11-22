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
    it.ic ? icon(it.ic, 24) : null, h("span", { class: it.on != null ? "lbl-fit" : "" }, it.label), it.on ? icon("check", 20) : null)), null, "smenu");
  return s;
}
const jsonOpt = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/* ---------------------------------------------------------------- 홈: 필터 버튼 · 검색 상태 */
function mobileBar(hasQ) {
  const any = hasQ || S.applied.length || S.colors.length || (S.kinds || []).length;
  document.body.classList.toggle("searching", !!any);
  $("#mBack").hidden = !hasQ && !document.documentElement.classList.contains("m-search");
  if (!isM()) return;
  const n = S.applied.length + S.colors.length + (S.kinds || []).length, fb = $("#filterBtn");
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
  $("#tabPose").textContent = "3D 포즈";
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
  const detail = h("textarea", { class: "inp ta", maxlength: "200", placeholder: "신고 사유를 입력해 주세요 (최대 200자)", "aria-label": "신고 사유" });
  const list = h("div", { role: "radiogroup", "aria-label": "신고 사유" });
  const draw = () => list.replaceChildren(...REPORT_REASONS.map((r) => h("button", { class: "srow rdrow", type: "button", role: "radio", "aria-checked": String(reason === r), onclick: () => { reason = r; draw(); } }, h("i", { class: "rd" }), h("span", {}, r))));
  draw();
  const s = sheet("신고하기", [list, detail],
    h("div", { class: "sheet-f" }, h("button", { class: "btn primary block rp-go", type: "button", onclick: async () => {
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
  /* Figma 2504:53804 저장하기 시트(킵에 담기 · 북에 저장) / 2810:11851 더보기(신고하기 · 내 게시물은 수정 · 삭제) */
  const saveMenu = () => sheetMenu("저장하기", [
    { ic: "keep", label: so.kept ? "킵 해제" : "킵에 담기", fn: keepAct },
    { ic: "drawer", label: "북에 저장", fn: bookAct }]);
  const menu = () => sheetMenu("더보기", so.editable
    ? [{ ic: "edit", label: "수정하기", fn: () => editPost(d) }, { ic: "trash", label: "삭제하기", danger: true, fn: () => removePost(d) }]
    : [{ ic: "flag", label: "신고하기", danger: true, fn: () => reportSheet("post", d.id) }]);
  const comment = h("input", { class: "cin", maxlength: "500", placeholder: ME ? "댓글을 남겨보세요" : "로그인하고 댓글을 남겨보세요", "aria-label": "댓글 입력" });
  const send = () => { const v = comment.value.trim(); if (!ME) return needLogin(); if (v) act(d, "POST", `/api/images/${d.id}/comments`, { body: v }, edit); };
  comment.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); send(); } };
  const circ = (ic, label, fn) => h("button", { class: "circ", type: "button", "aria-label": label, title: label, onclick: fn }, icon(ic, 20));
  const rel = h("div", { class: "sec rel" });
  const drawRel = () => { if (d.rel && d.rel.length) rel.replaceChildren(h("div", { class: "sec-h" }, h("h3", {}, "연관 이미지")), h("div", { class: "grid" }, d.rel.map(card))); };
  panel.replaceChildren(
    h("div", { class: "mbar" },
      h("button", { class: "icon-btn", type: "button", "aria-label": "뒤로", onclick: () => (S.hist.length ? goBack() : closeDetail()) }, icon("back", 24)),
      h("h1", {}, ""), h("div", { class: "mbar-r" })),
    h("div", { class: "pimg" }, h("img", { src: d.full, alt: d.title || "레퍼런스 이미지", class: "zoomable", onclick: () => openLightbox(d.full, d.title) }),
      h("div", { class: "imgact" }, circ("person", "이 이미지의 구도로 3D 포즈 찾기", () => pullPose()), circ("palette", "이 이미지의 색상으로 찾기", () => pullPalette(d.id)),
        h("button", { class: "circ add", type: "button", "aria-label": "저장하기", title: "저장하기", onclick: () => needLogin() && saveMenu() }, icon("plus", 24)))),
    h("div", { class: "pbody" },
      h("div", { class: "who" }, o ? avatarEl(o, 40, "av") : h("span", { class: "av" }, (d.author || "?").slice(0, 1)),
        h("div", {}, o ? h("a", { class: "pname", href: "#/u/" + o.uid }, d.author) : h("b", {}, d.author), h("span", {}, o ? `@${o.uid}` : `조회 ${d.views.toLocaleString()}`)),
        o && !o.me ? h("button", { class: "btn" + (o.following ? "" : " primary"), type: "button", onclick: () => act(d, o.following ? "DELETE" : "POST", `/api/users/${o.uid}/follow`, null, edit) }, o.following ? "팔로잉" : "팔로우") : null),
      h("h2", { class: "ptitle" }, d.title || "제목 없음", d.private ? h("span", { class: "prv-b" }, "비공개") : null),
      h("div", { class: "prow" },
        h("button", { class: "stat" + (so.liked ? " on" : ""), type: "button", "aria-pressed": String(!!so.liked), "aria-label": "하트", "data-like": "1", onclick: () => act(d, so.liked ? "DELETE" : "POST", `/api/images/${d.id}/like`, null, edit) }, icon("heart", 22), String(so.likes)),
        h("button", { class: "stat", type: "button", "aria-label": "댓글", onclick: () => commentsSheet(d, edit) }, icon("comment", 22), String(so.comments.length)),
        h("span", { class: "sp" }),
        h("button", { class: "icon-btn", type: "button", "aria-label": "공유하기", onclick: () => sharePost(d) }, icon("share", 24)),
        h("button", { class: "icon-btn", type: "button", "aria-label": "더보기", onclick: menu }, icon("more", 24))),
      h("div", { class: "sec" },
        h("div", { class: "sec-h" }, h("h3", {}, "태그"), so.editable ? h("button", { class: "btn sm", type: "button", onclick: () => drawDetail(d, !edit) }, edit ? "수정 완료" : "태그 수정") : null),
        edit ? kindTag(d, true, () => drawDetailM(d, true)) : null,
        h("div", { class: "tags" }, edit ? null : kindTag(d, false), on.length ? on.map(tagEl) : (edit ? h("span", { class: "hint" }, "아직 태그가 없어요.") : null)),
        edit ? h("div", { class: "tags", style: "margin-top:10px" }, pickButton(h("div", { class: "pick" }), (t) => save(d, { add: [t.ikey] }, t), () => new Set(d.tags.filter((x) => x.active).map((x) => x.ikey))),
          off.map((t) => h("button", { class: "tag off", type: "button", onclick: () => save(d, { restore: [t.ikey] }, t) }, "#" + t.label))) : null,
        edit ? h("p", { class: "hint" }, "태그를 눌러 지우거나, 흐린 태그를 눌러 되살릴 수 있어요.") : null),
      materialsSec(d),
      h("div", { class: "sec" },
        h("div", { class: "sec-h" }, h("h3", {}, `댓글 ${so.comments.length}`)),
        h("div", { class: "cform" }, ME ? avatarEl(ME, 24, "cav") : h("span", { class: "cav" }), comment, h("button", { class: "btn primary", type: "button", onclick: send }, "게시")),
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
        h("div", { class: "pad" }, d.items.length ? pgrid(d.items, { noMore: true }, "c2") : notice("최근 본 게시물이 없어요", "홈에서 마음에 드는 레퍼런스를 찾아 보세요.")));
    }
    if (sub === "liked") {
      let kind = ""; const body = h("div", {});
      const load = async () => {
        const d = await api("/api/me/reacted" + (kind ? "?kind=" + kind : ""));
        const remove = async (it) => {
          if (!(await confirmDialog("반응한 게시물에서 삭제할까요?", "내 하트와 이 게시물에 작성한 댓글이 삭제돼요.", { ok: "삭제하기", cancel: "취소", danger: true }))) return;
          try { await api("/api/me/reacted/" + it.id, { method: "DELETE" }); toast("반응한 게시물에서 삭제했어요"); await load(); } catch (e) { toast(e.message); }
        };
        const cards = d.items.map((it) => { const c = pcard(it, { click: () => goPost(it.id) }); const kebab = h("button", { class: "more-btn", type: "button", "aria-label": "더보기", onclick: (e) => { e.stopPropagation(); menuCard(e.currentTarget, [{ label: "삭제하기", danger: true, fn: () => remove(it) }]); } }, moreIc()); c.append(kebab); return c; });
        body.replaceChildren(h("div", { class: "kbar" }, [["", "전체"], ["like", "하트"], ["comment", "댓글"]].map(([k, l]) => h("button", { class: "pill" + (kind === k ? " on" : ""), type: "button", onclick: () => { kind = k; load().catch((e) => toast(e.message)); } }, l))),
          d.items.length ? h("div", { class: "grid c2" }, cards) : notice("아직 반응한 게시물이 없어요", "하트나 댓글을 남기면 여기에 모여요."));
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
  if (!isM()) return settingsPC(sub);
  const root = h("div", { class: "mpage set" }); page(root);
  const show = (title, ...kids) => root.replaceChildren(mbar(title, { back: () => (location.hash = sub ? "#/settings" : "#/me") }), ...kids.flat(4).filter((k) => k != null && k !== false));
  const row = (label, href, extra) => h("a", { class: "srow2", href }, h("span", {}, label), extra ? h("small", {}, extra) : null, icon("chevR", 20));
  const sw = (label, sub_, on, fn, disabled) => h("label", { class: "swrow" + (disabled ? " off" : "") }, h("span", {}, h("b", {}, label), h("small", {}, sub_)),
    h("input", { type: "checkbox", class: "sw-in", role: "switch", checked: on, disabled, onchange: (e) => fn && fn(e.target.checked) }), h("i", { class: "sw-ui" }));
  const group = (t) => h("h3", { class: "sgroup" }, t);
  try {
    if (!sub) return show("설정", group("알림 · 계정"), row("알림 설정", "#/settings/notif"), ...(NO_LOGIN ? [] : [row("계정 관리", "#/settings/account"), row("보안", "#/settings/security")]), row("차단 유저", "#/settings/blocks"),
      h("div", { class: "sgap" }), group("고객 지원"), row("문의하기", "#/settings/inquiry"), h("div", { class: "srow2" }, h("span", {}, "앱 버전"), h("small", {}, "v1.0.0")), row("개인정보 처리 방침", "#/settings/privacy"), row("서비스 약관", "#/settings/terms"),
      ...(NO_LOGIN ? [] : [h("div", { class: "sgap" }), h("button", { class: "srow2 plain", type: "button", onclick: logoutAsk }, "로그아웃"), h("a", { class: "srow2 plain dim", href: "#/settings/leave" }, "탈퇴하기")]));
    if (sub === "notif") {
      const st = await api("/api/me/settings"); const n = st.notif; let dnd = st.dnd || "", last = dnd || "21:00-09:00";
      const put = async (k, v) => { if (k) n[k] = v; try { await api("/api/me/settings", jsonOpt("PUT", { notif: n, dnd })); } catch (e) { toast(e.message); } };
      /* 방해 금지 (Figma 2781:87867): 스위치 + '수신 시간' 줄(시간 범위 · 눌러서 바꾸기). 꺼져 있으면 시간 줄은 흐리게 */
      const rangeTx = () => last.split("-").map(hm12).join(" ~ ");
      const timeRow = h("button", { class: "srow2" + (dnd ? "" : " off"), type: "button", onclick: () => {
        const times = []; for (let m = 0; m < 1440; m += 30) times.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
        const [a, b] = last.split("-");
        const sel = (v, label) => h("select", { class: "inp", "aria-label": label }, times.map((t) => h("option", { value: t, selected: t === v }, hm12(t))));
        const f = sel(a, "방해 금지 시작 시간"), t = sel(b, "방해 금지 끝 시간");
        const s = sheet("수신 시간", h("div", { class: "dnd-pick" }, f, h("span", {}, "~"), t), h("div", { class: "sheet-f" }, h("button", { class: "btn primary block", type: "button", onclick: () => {
          last = `${f.value}-${t.value}`; if (dnd) dnd = last; timeRow.querySelector("small").textContent = rangeTx(); s.close(); put();
        } }, "저장")));
      } }, h("span", {}, "수신 시간"), h("small", {}, rangeTx()), icon("chevR", 20));
      return show("알림 설정", group("활동 알림"), sw("팔로워", "새로운 팔로워가 생기면 알려드려요", n.follow, (v) => put("follow", v)), sw("댓글", "내 게시물에 댓글이 달리면", n.comment, (v) => put("comment", v)), sw("대댓글", "내 댓글에 답글이 달리면", n.reply !== false, (v) => put("reply", v)), sw("하트", "내 게시물에 하트가 눌리면", n.like, (v) => put("like", v)),
        h("div", { class: "sgap" }), group("알림 수신 시간"), sw("방해 금지 시간 사용", "설정한 시간에는 알림을 보내지 않아요", !!dnd, (v) => { dnd = v ? last : ""; timeRow.classList.toggle("off", !v); put(); }), timeRow);
    }
    if (NO_LOGIN && ["account", "security", "leave"].includes(sub)) { location.hash = "#/settings"; return; }
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
    if (sub === "inquiry") {   // Figma 2781:88034: 문의 유형(선택 상자) · 문의 내용(글자 수) · 답변 받을 이메일 · 사진 첨부(선택) · 아래 보내기
      const kind = h("select", { class: "inp", id: "iqKind" }, h("option", { value: "" }, "유형을 선택하세요"), ["계정 · 로그인", "게시물 · 태그", "신고 · 차단", "오류 제보", "기타"].map((x) => h("option", {}, x)));
      const cnt = h("small", { class: "iq-cnt" }, "0 / 1,000");
      const body = h("textarea", { class: "inp ta", id: "iqBody", maxlength: "1000", placeholder: "문의 내용을 자세히 적어 주세요 (최대 1,000자)", oninput: () => { cnt.textContent = `${body.value.length.toLocaleString()} / 1,000`; } });
      const email = h("input", { class: "inp", id: "iqMail", type: "email", placeholder: "reffy@email.com", autocomplete: "email", maxlength: "120" });
      const photos = [];
      const file = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: () => { for (const f of file.files) { if (photos.length >= 3) { toast("사진은 최대 3장까지 첨부할 수 있어요."); break; } if (f.size > 10 * 1024 * 1024) { toast("사진은 한 장에 10MB 이하로 올려 주세요."); continue; } photos.push({ f, url: URL.createObjectURL(f) }); } file.value = ""; drawPh(); } });
      const ph = h("div", { class: "iq-photos" });
      const drawPh = () => ph.replaceChildren(...photos.map((p, i) => h("span", { class: "iq-ph" }, h("img", { src: p.url, alt: `첨부 사진 ${i + 1}` }), h("button", { type: "button", "aria-label": "사진 빼기", onclick: () => { photos.splice(i, 1); drawPh(); } }, icon("close", 14)))),
        photos.length < 3 ? h("button", { class: "iq-add", type: "button", "aria-label": "사진 첨부", onclick: () => file.click() }, icon("plus", 24)) : null, file);
      drawPh();
      return show("문의하기", h("form", { class: "sform iq", onsubmit: async (e) => { e.preventDefault();
        if (!kind.value) return toast("문의 유형을 선택해 주세요.");
        const fd = new FormData(); fd.append("kind", kind.value); fd.append("email", email.value.trim()); fd.append("body", body.value.trim()); photos.forEach((p) => fd.append("photos", p.f));
        try { await api("/api/inquiries", { method: "POST", body: fd }); toast("문의를 보냈어요"); location.hash = "#/settings"; } catch (er) { toast(er.message); } } },
        h("label", { for: "iqKind" }, "문의 유형"), h("span", { class: "iq-sel" }, kind, icon("chevronDown", 20)), h("label", { for: "iqBody" }, "문의 내용"), h("span", { class: "iq-ta" }, body, cnt),
        h("label", { for: "iqMail" }, "답변 받을 이메일"), email, h("span", { class: "iq-lb" }, "사진 첨부 (선택)"), ph,
        h("div", { class: "iq-foot" }, h("button", { class: "btn primary block", type: "submit" }, "보내기"))));
    }
    if (sub === "privacy" || sub === "terms") {
      const t = sub === "privacy" ? "개인정보 처리 방침" : "서비스 약관";
      return show(t, h("article", { class: "doc" }, h("h2", {}, t), h("p", { class: "date" }, "시행일 2026. 11. 01."), SET_DOCS[sub][1].map(([a, b]) => [h("h3", {}, a), h("p", {}, b)])));
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

/* ---------------------------------------------------------------- 킵 스페이스 크게 보기 (KEP_0100) · 순서 변경 */
function keepViewer(items, start, onDone) {
  const picked = new Set(); let idx = start || 0;
  const ov = h("div", { class: "kview", role: "dialog", "aria-modal": "true", "aria-label": "레퍼런스 크게 보기" });
  const close = () => { ov.remove(); onDone && onDone(); };
  const track = h("div", { class: "kv-track" });
  const title = h("h1", {}, "");
  const strip = h("button", { class: "kv-strip", type: "button", "aria-label": "담은 레퍼런스 순서 변경", onclick: () => reorderSheet(items, () => drawTrack(true)) });
  const selBtn = h("button", { class: "kv-sel", type: "button", "aria-label": "선택" }, icon("check", 24));
  const drawTitle = () => { title.textContent = `${picked.size}개 선택됨`; const cur = items[idx]; selBtn.classList.toggle("on", !!cur && picked.has(cur.id)); selBtn.setAttribute("aria-pressed", String(!!cur && picked.has(cur.id)));
    const sel = items.filter((x) => picked.has(x.id));
    const n = sel.length ? sel.length : items.length;
    strip.replaceChildren(h("span", { class: "th" }, (sel.length ? sel : items).slice(0, 5).map((x) => h("img", { src: x.thumb, alt: "" }))), ...(n > 5 ? [h("b", {}, `+${n - 5}`)] : [])); };
  const drawTrack = (keep) => {
    track.replaceChildren(...items.map((it) => h("div", { class: "kv-card" + (picked.has(it.id) ? " on" : ""), "data-id": it.id }, h("img", { src: it.thumb, alt: it.title || "레퍼런스 이미지" }))));
    if (!items.length) return close();
    idx = Math.min(idx, items.length - 1);
    requestAnimationFrame(() => track.children[idx]?.scrollIntoView({ inline: "center", block: "nearest", behavior: keep ? "auto" : "instant" }));
    drawTitle();
  };
  track.addEventListener("scroll", () => { const w = track.clientWidth; const n = Math.round(track.scrollLeft / (w * 0.72)); if (n !== idx && n >= 0 && n < items.length) { idx = n; drawTitle(); } }, { passive: true });
  selBtn.onclick = () => { const it = items[idx]; if (!it) return; picked.has(it.id) ? picked.delete(it.id) : picked.add(it.id); track.children[idx]?.classList.toggle("on", picked.has(it.id)); drawTitle(); };
  const del = async () => {
    const ids = picked.size ? [...picked] : items[idx] ? [items[idx].id] : [];
    if (!ids.length) return;
    if (!(await confirmDialog(ids.length > 1 ? `${ids.length}개의 레퍼런스를 삭제할까요?` : "이 레퍼런스를 삭제할까요?", "킵 스페이스에서 삭제돼요. 게시물 자체는 지워지지 않아요.", { ok: "삭제", danger: true }))) return;
    try { await api("/api/me/keeps/remove", jsonOpt("POST", { ids })); ids.forEach((i) => picked.delete(i)); for (let k = items.length - 1; k >= 0; k--) if (ids.includes(items[k].id)) items.splice(k, 1); toast("킵 스페이스에서 삭제했어요"); drawTrack(true); } catch (e) { toast(e.message); }
  };
  ov.append(h("div", { class: "mbar" }, h("button", { class: "icon-btn", type: "button", "aria-label": "뒤로", onclick: close }, icon("back", 24)), title, h("div", { class: "mbar-r" })),
    track,
    h("div", { class: "kv-act" }, h("span", {}, h("button", { class: "kv-del", type: "button", "aria-label": "삭제", onclick: del }, icon("trash", 24)), h("small", {}, "삭제")),
      h("span", {}, selBtn, h("small", {}, "선택"))),
    h("div", { class: "kv-foot" }, strip, h("button", { class: "btn primary", type: "button", onclick: () => {
      const ids = picked.size ? [...picked] : items[idx] ? [items[idx].id] : [];
      if (ids.length) saveToBook(ids, { after: () => { picked.clear(); drawTitle(); } });
    } }, "북에 저장")));
  document.body.append(ov);
  drawTrack(false);
}
function reorderSheet(items, after) {
  const grid = h("div", { class: "ro-grid" });
  let drag = null;
  const draw = () => grid.replaceChildren(...items.map((it, i) => h("div", { class: "ro-it", draggable: "true", "data-i": i,
    ondragstart: (e) => { drag = i; e.currentTarget.classList.add("drag"); }, ondragend: (e) => e.currentTarget.classList.remove("drag"),
    ondragover: (e) => e.preventDefault(), ondrop: (e) => { e.preventDefault(); move(drag, i); } }, h("img", { src: it.thumb, alt: it.title || "" }))));
  const move = (a, b) => { if (a == null || a === b) return; const [x] = items.splice(a, 1); items.splice(b, 0, x); draw(); save_(); };
  // 터치: 길게 누른 뒤 끌어서 놓기
  let tStart = null, tTimer = null;
  grid.addEventListener("touchstart", (e) => { const el = e.target.closest(".ro-it"); if (!el) return; tStart = +el.dataset.i; tTimer = setTimeout(() => { drag = tStart; el.classList.add("drag"); }, 300); }, { passive: true });
  grid.addEventListener("touchmove", (e) => { if (drag == null) { clearTimeout(tTimer); return; } e.preventDefault(); }, { passive: false });
  grid.addEventListener("touchend", (e) => { clearTimeout(tTimer); if (drag == null) return; const t = e.changedTouches[0]; const el = document.elementFromPoint(t.clientX, t.clientY)?.closest(".ro-it"); grid.querySelectorAll(".drag").forEach((x) => x.classList.remove("drag")); const d = drag; drag = null; if (el) move(d, +el.dataset.i); });
  const save_ = async () => { try { await api("/api/me/keeps/order", jsonOpt("PUT", { ids: items.map((x) => x.id) })); } catch (e) { toast(e.message); } };
  draw();
  const s = sheet(`담은 레퍼런스 ${items.length}`, [h("p", { class: "sheet-p" }, "길게 눌러 드래그하면 순서를 바꿀 수 있어요"), grid], null, "tall");
  const origClose = s.close; s.close = () => { origClose(); after && after(); };
  s.el.querySelector(".m-sheet-h .icon-btn").onclick = s.close;
}
