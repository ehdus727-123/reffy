/* REFFY 언어 전환 (HOM_0503 KOR / ENG)
   화면에 보이는 한국어 문구를 사전에 있는 것만 영어로 바꿔 줍니다. 사전에 없는 문구(게시물 제목·태그 등)는 그대로 둡니다. */
(function () {
  const KEY = "reffy.lang";
  const get = () => { try { return localStorage.getItem(KEY) || "ko"; } catch { return "ko"; } };
  const D = {
    "홈": "Home", "킵 스페이스": "Keep space", "서랍": "Drawer", "알림": "Notifications",
    "찾고 싶은 레퍼런스, 유저를 검색해보세요.": "Search references and users", "찾고 싶은 레퍼런스, 유저를 검색해보세요": "Search references and users",
    "마이페이지": "My page", "설정": "Settings", "언어": "Language", "로그아웃": "Log out",
    "게시물": "Posts", "팔로워": "Followers", "팔로잉": "Following", "팔로우": "Follow", "맞팔로우": "Follow back",
    "프로필 편집": "Edit profile", "프로필 수정": "Edit profile", "+ 새 게시물 업로드": "+ Upload new post", "새 게시물 업로드": "Upload new post",
    "링크": "Links", "전체": "All", "공개 게시물": "Public", "비공개 게시물": "Private", "공개": "Public", "비공개": "Private", "북": "Books",
    "아직 올린 게시물이 없어요": "No posts yet", "공개 게시물이 없어요": "No public posts", "비공개 게시물이 없어요": "No private posts",
    "필터": "Filter", "키워드": "Keyword", "3D 포즈": "3D pose", "무드": "Mood", "초기화": "Reset", "필터 적용하기": "Apply filters",
    "종류": "Type", "사진": "Photo", "일러스트": "Illustration", "정렬": "Sort",
    "최근 순": "Recent", "인기 순": "Popular", "관련도 순": "Relevance", "이름 순": "Name", "최근 수정 순": "Recently edited",
    "검색 결과가 없어요": "No results", "아직 레퍼런스가 없어요": "No references yet", "피드 둘러보기": "Browse feed",
    "다른 키워드로 검색하거나 필터를 바꿔 보세요": "Try another keyword or change filters", "첫 레퍼런스를 올려 보세요": "Upload your first reference",
    "추천 키워드": "Suggested keywords", "추천 레퍼런스": "Suggested references", "인기 태그": "Popular tags", "최근 검색어": "Recent searches",
    "태그": "Tags", "댓글": "Comments", "연관 이미지": "Related images", "더보기": "More", "사용 소재": "Materials",
    "댓글을 남겨 보세요": "Leave a comment", "댓글을 남겨보세요": "Leave a comment", "등록": "Post", "공유하기": "Share", "신고하기": "Report",
    "북에 저장": "Save to book", "북에 추가": "Add to book", "삭제": "Delete", "삭제하기": "Delete", "수정하기": "Edit", "취소": "Cancel",
    "확인": "OK", "네": "Yes", "아니요": "No", "아니오": "No", "닫기": "Close", "저장": "Save", "저장하기": "Save", "적용하기": "Apply", "적용": "Apply",
    "선택": "Select", "이동": "Move", "이동하기": "Move", "다음": "Next", "이전": "Previous", "추가": "Add", "만들기": "Create", "게시하기": "Post",
    "업로드": "Upload", "게시물 등록": "New post", "제목": "Title", "공개 설정": "Visibility", "다시 시도": "Try again", "불러오는 중…": "Loading…",
    "불러오지 못했어요": "Couldn't load", "내 북": "My books", "새 북 만들기": "New book", "+ 새 북 만들기": "+ New book", "반응한 게시물": "Reacted posts",
    "최근 본 게시물": "Recently viewed", "이번 주": "This week", "오늘": "Today", "방금": "Just now", "모두 읽음": "Mark all read", "새 알림이 없어요": "No new notifications",
    "내 설정": "Settings", "알림 설정": "Notifications", "계정 관리": "Account", "차단 유저": "Blocked users", "문의하기": "Contact us",
    "개인정보 처리 방침": "Privacy policy", "서비스 약관": "Terms of service", "탈퇴하기": "Delete account",
    "받고 싶은 알림을 선택하세요.": "Choose the notifications you want.", "활동 알림": "Activity", "대댓글": "Replies", "하트": "Hearts",
    "누군가 나를 팔로우하면 알려드려요.": "When someone follows you.", "내 게시물에 댓글이 달리면 알려드려요.": "When someone comments on your post.",
    "내 댓글에 답글이 달리면 알려드려요.": "When someone replies to your comment.", "내 게시물에 하트가 눌리면 알려드려요.": "When someone hearts your post.",
    "알림 수신 시간": "Delivery time", "방해 금지 시간": "Do not disturb", "설정한 시간에는 알림을 보내지 않아요.": "No notifications during this time.",
    "로그인에 연결된 계정 정보를 확인하세요.": "Check the accounts linked to your login.", "기본 정보": "Basic info", "아이디": "ID", "이메일": "Email", "가입일": "Joined",
    "연결된 계정": "Linked accounts", "연결되지 않음": "Not linked", "연결하기": "Link", "연결 해제": "Unlink", "등록된 이메일이 없어요": "No email registered",
    "카카오": "Kakao", "네이버": "Naver", "연결된 계정이 하나뿐이면 연결을 해제할 수 없어요.": "You can't unlink your only linked account.",
    "차단한 유저는 내 게시물과 프로필을 볼 수 없어요.": "Blocked users can't see your posts or profile.", "차단 해제": "Unblock", "해제하기": "Unblock",
    "차단한 유저가 없어요": "No blocked users", "프로필의 더보기 메뉴에서 차단할 수 있어요.": "You can block someone from their profile menu.",
    "답변은 입력한 이메일로 영업일 기준 3일 이내에 보내드려요.": "We'll reply to your email within 3 business days.", "문의 유형": "Topic",
    "계정": "Account", "신고": "Report", "서비스 오류": "Bug", "기타": "Other", "답변 받을 이메일": "Reply email", "내용": "Message",
    "사진 첨부": "Attach photos", "선택 · 최대 3장": "Optional · up to 3", "문의 보내기": "Send", "제목을 입력해 주세요": "Enter a title",
    "답변 받을 이메일을 입력해 주세요": "Enter your email", "문의 내용을 자세히 적어주세요. (최대 1,000자)": "Describe your question in detail. (up to 1,000 characters)",
    "시행일 2026.11.01": "Effective 2026.11.01", "이전 버전 보기": "Previous versions",
    "탈퇴하기 전에 아래 내용을 꼭 확인해 주세요.": "Please read the following before you leave.", "탈퇴하면 이렇게 돼요": "What happens when you leave",
    "· 팔로워·팔로잉 관계와 알림 내역이 사라져요.": "· Your followers, following and notifications are removed.", "· 삭제된 정보는 다시 복구할 수 없어요.": "· Deleted data can't be restored.",
    "떠나시는 이유를 알려주세요": "Tell us why you're leaving", "자주 사용하지 않아요": "I don't use it often", "원하는 레퍼런스를 찾기 어려워요": "It's hard to find references",
    "다른 서비스를 이용해요": "I use another service", "개인정보가 걱정돼요": "I'm worried about privacy", "위 안내 사항을 모두 확인했어요.": "I've read everything above.",
    "정말 탈퇴할까요?": "Delete your account?", "탈퇴하면 계정과 게시물이 바로 삭제되며 다시 복구할 수 없어요.": "Your account and posts will be deleted right away and can't be restored.",
    "로그아웃할까요?": "Log out?", "다시 로그인하면 이어서 이용할 수 있어요.": "You can pick up where you left off when you log in again.",
    "헤더 이미지": "Header image", "헤더 변경": "Change header", "프로필 이미지": "Profile image", "닉네임": "Nickname", "소개": "Bio", "앨범에서 선택": "Choose from album",
    "기본 이미지로 변경": "Use default image", "사진 변경": "Change photo", "수정 완료": "Done",
    "첫 레퍼런스를 올리면 AI가 태그를 붙여 줘요.": "Upload your first reference and AI will tag it.", "+ 업로드": "+ Upload",
    "레퍼런스": "References", "레퍼런스 북": "Reference books", "담은 레퍼런스가 없어요": "No saved references",
  };
  const RX = [
    [/^차단한 유저 (\d+)$/, "Blocked users $1"], [/^(.+)님의 차단을 해제할까요\?$/, "Unblock $1?"],
    [/^· 내 게시물 (\d+)개, 북, 킵 스페이스에 담은 레퍼런스가 모두 삭제돼요\.$/, "· All $1 posts, books and keep space references are deleted."],
    [/^(.+) · (\d{4}\.\d{2}\.\d{2}) 차단$/, "$1 · blocked $2"], [/^북 (\d+)$/, "Books $1"], [/^게시물 (\d+)$/, "Posts $1"], [/^댓글 (\d+)개 모두 보기$/, "View all $1 comments"],
    [/^오전 (\d+):(\d+)$/, "$1:$2 AM"], [/^오후 (\d+):(\d+)$/, "$1:$2 PM"],
  ];
  const tr = (s) => { const t = s.trim(); if (!t || !/[가-힣]/.test(t)) return null; if (D[t]) return s.replace(t, D[t]); for (const [r, o] of RX) if (r.test(t)) return s.replace(t, t.replace(r, o)); return null; };
  const ATTR = ["placeholder", "aria-label", "title"];
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { const v = tr(root.nodeValue); if (v != null) root.nodeValue = v; return; }
    if (root.nodeType !== 1 || root.closest?.("[data-i18n-skip], script, style, textarea")) return;
    if (root.dataset.en) { root.textContent = root.dataset.en; return; }
    root.querySelectorAll("[data-en]").forEach((x) => { x.textContent = x.dataset.en; });
    for (const a of ATTR) if (root.hasAttribute(a)) { const v = tr(root.getAttribute(a)); if (v != null) root.setAttribute(a, v); }
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = it.nextNode())) {
      if (n.nodeType === 3) { if (n.parentElement?.closest("[data-i18n-skip], [data-en], script, style, textarea")) continue; const v = tr(n.nodeValue); if (v != null) n.nodeValue = v; }
      else for (const a of ATTR) if (n.hasAttribute(a)) { const v = tr(n.getAttribute(a)); if (v != null) n.setAttribute(a, v); }
    }
  }
  let obs = null;
  function on() {
    document.documentElement.lang = "en";
    walk(document.body);
    if (obs) return;
    obs = new MutationObserver((ms) => { for (const m of ms) { if (m.type === "characterData") walk(m.target); else m.addedNodes.forEach(walk); if (m.type === "attributes") walk(m.target); } });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
  }
  window.REFFY_LANG = {
    get,
    set(l) { try { localStorage.setItem(KEY, l); } catch { /* 저장 안 되면 이번 화면만 */ } if (l === "en") on(); else location.reload(); },
  };
  if (get() === "en") on();
})();
