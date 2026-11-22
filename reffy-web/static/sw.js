/* REFFY 앱 설치(홈 화면에 추가)용 서비스 워커.
   화면이 늘 최신이도록 아무것도 저장(캐시)하지 않고 그대로 인터넷에서 받아옵니다. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
