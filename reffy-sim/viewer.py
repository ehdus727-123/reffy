"""눈으로 확인하는 화면 — 결과가 '진짜 비슷한지'는 사람이 봐야 합니다.

사용:  python viewer.py   →  http://localhost:8300
각 결과 아래 ○ / × 를 누르면 data/ratings.csv 에 기록되고, 방식별 정답률이 위에 보입니다.
"""
import csv
import os
import random
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

import simlib

E = simlib.Engine()
app = FastAPI()
RATE = simlib.OUT_DIR / "ratings.csv"
IMG = os.getenv("IMAGE_PATH", "")


@app.get("/img/{pid}")
def img(pid: int):
    try:
        i = E._idx(pid)
    except KeyError:
        raise HTTPException(404)
    r = E.info(i)
    if IMG:
        p = Path(IMG.format(yyyymm=f"{r['year']:04d}{r['month']:02d}", id=pid, ext=r["ext"]))
        if p.exists():
            return FileResponse(p)
    if r["url"]:
        return RedirectResponse(r["url"])
    raise HTTPException(404)


def pack(lst, key):
    out = []
    for t in lst:
        d = {"id": t[0]}
        d.update(dict(zip(key, t[1:])))
        d["tags"] = E.raw[E.pos[t[0]]]
        out.append(d)
    return out


@app.get("/api/random")
def rnd():
    for _ in range(200):
        i = random.randrange(len(E.ids))
        if E.nt[i] >= 3:
            return {"id": int(E.ids[i])}
    return {"id": int(E.ids[0])}


@app.get("/api/image/{pid}")
def image(pid: int, w_tag: float = 0.7, mode: str = "weighted", k: int = 12):
    try:
        i = E._idx(pid)
    except KeyError as e:
        raise HTTPException(404, str(e))
    q = E.info(i)
    return {
        "q": q,
        "rows": [
            {"key": "phash", "title": "pHash · 해밍 거리 (중복·변형)", "items": pack(E.phash_neighbors(pid, max_dist=12, k=k), ["d"])},
            {"key": "cosine", "title": "태그 · 코사인", "items": pack(E.similar_images(pid, method="cosine", k=k), ["s", "n"])},
            {"key": "jaccard", "title": "태그 · 자카드", "items": pack(E.similar_images(pid, method="jaccard", k=k), ["s", "n"])},
            {"key": "tfidf", "title": "태그 · TF-IDF 코사인 (흔한 태그 가중치 ↓)", "items": pack(E.similar_images(pid, method="tfidf", k=k), ["s", "n"])},
            {"key": f"combined-{mode}", "title": f"합친 결과 · 태그 {w_tag:.1f} + pHash {1-w_tag:.1f} ({'가중합' if mode=='weighted' else 'pHash 후보 → 태그 재정렬'})",
             "items": pack(E.combined(pid, method="tfidf", w_tag=w_tag, w_ph=1 - w_tag, mode=mode, k=k), ["s", "ts", "d"])},
        ],
        "recommend": E.recommend(q["tags"].split(), 12),
    }


@app.get("/api/tags")
def tags(q: str):
    ts = q.split()
    return {"similar": {t: E.similar_tags(t, 15) for t in ts}, "expand": E.expand(ts),
            "recommend": E.recommend(ts, 12), "hits": E.search(ts, 40),
            "unknown": [t for t in ts if t not in E.col]}


@app.post("/api/rate")
def rate(body: dict):
    new = not RATE.exists()
    with open(RATE, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["time", "query", "result", "method", "ok"])
        w.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), body["q"], body["r"], body["m"], int(bool(body["ok"]))])
    return stats()


@app.get("/api/stats")
def stats():
    agg = {}
    if RATE.exists():
        last = {}
        with open(RATE, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                last[(r["query"], r["result"], r["method"])] = r["ok"] == "1"  # 마지막 판정만
        for (_, _, m), ok in last.items():
            a = agg.setdefault(m, [0, 0]); a[0] += ok; a[1] += 1
    return {m: {"ok": a[0], "n": a[1], "rate": round(a[0] / a[1], 3)} for m, a in sorted(agg.items())}


@app.get("/api/info")
def info():
    return {"built": E.built, "images": len(E.ids), "tags": len(E.vocab), "with_phash": int(E.has_ph.sum())}


@app.get("/", response_class=HTMLResponse)
def page():
    return HTML


HTML = r"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>REFFY 유사도 확인</title>
<style>
:root{--ink:#18171a;--ink2:#6f6d72;--line:#e4e3e5;--bg:#fff;--ph:#f4f3f5;--ok:#1f8a4c;--no:#c43a49}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 Pretendard,system-ui,sans-serif;color:var(--ink);background:var(--bg)}
header{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:12px 24px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
header h1{font-size:18px;margin:0 12px 0 0}input,select,button{font:inherit;height:36px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:#fff}
button{cursor:pointer}button.pri{background:var(--ink);color:#fff;border-color:var(--ink)}#info{color:var(--ink2);margin-left:auto;font-size:12px}
main{padding:20px 24px 80px;max-width:1600px}
.q{display:grid;grid-template-columns:220px 1fr;gap:20px;margin-bottom:24px}.q img{width:220px;max-height:320px;object-fit:contain;background:var(--ph);border-radius:8px}
.q h2{margin:0 0 6px;font-size:16px}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.chip{padding:2px 8px;border-radius:12px;background:var(--ph);font-size:12px;cursor:pointer}
.chip.add{background:#eef4ff}.muted{color:var(--ink2);font-size:12px}
section{margin:0 0 28px}section h3{font-size:14px;margin:0 0 10px;display:flex;gap:10px;align-items:baseline}
.row{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:12px}
.it{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}.it img{width:100%;aspect-ratio:1;object-fit:cover;background:var(--ph);display:block;cursor:pointer}
.it .m{padding:6px 8px;font-size:11px;color:var(--ink2);display:flex;justify-content:space-between;align-items:center;gap:4px}
.it .v button{height:24px;width:28px;padding:0;font-size:13px;border-radius:6px}.it .v .on.y{background:var(--ok);color:#fff;border-color:var(--ok)}.it .v .on.n{background:var(--no);color:#fff;border-color:var(--no)}
.it.ok{outline:2px solid var(--ok)}.it.bad{opacity:.45}
#stats{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-bottom:16px}#stats b{font-size:13px}
.tagres table{border-collapse:collapse;font-size:13px}.tagres td{padding:2px 10px 2px 0}
@media (max-width:640px){.q{grid-template-columns:1fr}header{padding:10px 16px}main{padding:16px}}
</style></head><body>
<header><h1>REFFY 유사도 확인</h1>
<input id="pid" placeholder="이미지 ID" size="10"><button class="pri" onclick="go(pid.value)">보기</button><button onclick="rand()">무작위</button>
<label class="muted">태그 비중 <select id="w"><option>0.9</option><option>0.8</option><option selected>0.7</option><option>0.5</option><option>0.3</option></select></label>
<select id="mode"><option value="weighted">가중합</option><option value="two-step">pHash 후보→태그</option></select>
<input id="tq" placeholder="태그로 찾기 (예: 1girl lying)" size="24"><button onclick="tagq(tq.value)">태그</button>
<span id="info"></span></header>
<main><div id="stats"></div><div id="out"></div></main>
<script>
const $=s=>document.querySelector(s),esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let Q=null,marks={};
async function j(u,o){const r=await fetch(u,o);if(!r.ok)throw new Error((await r.json()).detail||r.status);return r.json()}
function drawStats(s){const n={phash:"pHash",cosine:"코사인",jaccard:"자카드",tfidf:"TF-IDF"};
 $("#stats").innerHTML=Object.keys(s).length?"<b>방식별 '비슷함' 비율</b>"+Object.entries(s).map(([m,v])=>`<span>${n[m]||m}: ${(v.rate*100).toFixed(0)}% (${v.ok}/${v.n})</span>`).join(""):'<span class="muted">결과 아래 ○(비슷함) / ×(아님)를 누르면 방식별 정답률이 쌓여요.</span>'}
async function go(id){if(!id)return;location.hash=id;try{const d=await j(`/api/image/${id}?w_tag=${$("#w").value}&mode=${$("#mode").value}`);Q=d.q.id;draw(d)}catch(e){$("#out").innerHTML=`<p>${esc(e.message)}</p>`}}
async function rand(){go((await j("/api/random")).id)}
function chips(s,cls=""){return `<div class="chips">${String(s).split(/\s+/).filter(Boolean).map(t=>`<span class="chip ${cls}" onclick="tagq('${esc(t)}')">${esc(t)}</span>`).join("")}</div>`}
function item(r,key){const lab=key=="phash"?`해밍 ${r.d}`:key.startsWith("combined")?`${r.s} · 태그 ${r.ts} · 해밍 ${r.d}`:`${r.s} · 겹침 ${r.n}`;
 const k=`${Q}|${r.id}|${key}`,v=marks[k];
 return `<div class="it ${v===1?"ok":v===0?"bad":""}" title="${esc(r.tags)}"><img loading="lazy" src="/img/${r.id}" onclick="go(${r.id})" onerror="this.style.opacity=.2">
 <div class="m"><span>#${r.id}<br>${lab}</span><span class="v"><button class="${v===1?"on y":""}" onclick="rate(${r.id},'${key}',1,this)">○</button> <button class="${v===0?"on n":""}" onclick="rate(${r.id},'${key}',0,this)">×</button></span></div></div>`}
function draw(d){const q=d.q;
 $("#out").innerHTML=`<div class="q"><img src="/img/${q.id}"><div><h2>#${q.id} <span class="muted">${q.w}×${q.h} · pHash ${q.phash||"없음"}</span></h2>
 <div class="muted">작품: ${esc(q.copyrights)||"-"} · 캐릭터: ${esc(q.characters)||"-"}</div>
 <div class="muted" style="margin-top:8px">General 태그</div>${chips(q.tags)}
 <div class="muted" style="margin-top:8px">같이 자주 나오는 태그 (추천)</div>${chips(d.recommend.map(x=>x[0]).join(" "),"add")}</div></div>`+
 d.rows.map(r=>`<section><h3>${esc(r.title)} <span class="muted">${r.items.length}개</span></h3>${r.items.length?`<div class="row">${r.items.map(x=>item(x,r.key)).join("")}</div>`:'<p class="muted">결과 없음</p>'}</section>`).join("");scrollTo(0,0)}
async function rate(rid,key,ok,btn){const m=key.startsWith("combined")?key:key;marks[`${Q}|${rid}|${key}`]=ok;drawStats(await j("/api/rate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({q:Q,r:rid,m,ok})}));
 const it=btn.closest(".it");it.classList.toggle("ok",ok===1);it.classList.toggle("bad",ok===0);it.querySelectorAll(".v button").forEach((b,i)=>b.className=(i===0&&ok===1)?"on y":(i===1&&ok===0)?"on n":"")}
async function tagq(s){s=s.trim();if(!s)return;$("#tq").value=s;const d=await j("/api/tags?q="+encodeURIComponent(s));
 $("#out").innerHTML=`<section class="tagres"><h3>비슷한 태그 (같이 나온 비율)</h3>${d.unknown.length?`<p class="muted">사전에 없는 태그: ${esc(d.unknown.join(", "))}</p>`:""}
 ${Object.entries(d.similar).map(([t,l])=>`<p><b>${esc(t)}</b></p><table>${l.map(x=>`<tr><td><span class="chip" onclick="tagq('${esc(x[0])}')">${esc(x[0])}</span></td><td>${x[1]}</td><td class="muted">같이 ${x[2]}장</td></tr>`).join("")}</table>`).join("")}
 <h3 style="margin-top:16px">검색 넓히기</h3>${chips(d.expand.map(x=>x[0]).join(" "),"add")}<h3>추천 태그</h3>${chips(d.recommend.map(x=>x[0]).join(" "),"add")}</section>
 <section><h3>태그를 모두 가진 이미지 <span class="muted">${d.hits.length}개(최대 40)</span></h3><div class="row">${d.hits.map(id=>`<div class="it"><img loading="lazy" src="/img/${id}" onclick="go(${id})"><div class="m">#${id}</div></div>`).join("")}</div></section>`}
(async()=>{const i=await j("/api/info");$("#info").textContent=`인덱스 ${i.built} · ${i.images.toLocaleString()}장 · 태그 ${i.tags.toLocaleString()}종 · pHash ${i.with_phash.toLocaleString()}장`;
 drawStats(await j("/api/stats"));location.hash.slice(1)?go(location.hash.slice(1)):rand()})();
$("#pid").onkeydown=e=>e.key=="Enter"&&go(e.target.value);$("#tq").onkeydown=e=>e.key=="Enter"&&tagq(e.target.value);
</script></body></html>"""

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8300"))
    print(f"확인 화면: http://localhost:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port)
