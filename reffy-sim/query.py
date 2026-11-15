"""명령창에서 바로 확인하기.

  python query.py image 1000000            # 이 이미지와 비슷한 이미지 (태그 3가지 방식 + 합친 결과)
  python query.py phash 1000000            # pHash 로 거의 같은 이미지
  python query.py dup                      # DB 전체 중복 의심 쌍
  python query.py tag long_hair            # 비슷한 태그
  python query.py expand 1girl lying       # 검색 넓히기 + 추천 태그
  python query.py top                      # 많이 나온 태그
"""
import sys
import simlib

if len(sys.argv) < 2:
    print(__doc__); sys.exit()
E = simlib.Engine()
cmd, args = sys.argv[1], sys.argv[2:]
print(f"[인덱스 {E.built} · 이미지 {len(E.ids):,}장 · 태그 {len(E.vocab):,}종]\n")
if cmd == "image":
    pid = int(args[0]); print("기준:", E.info(E._idx(pid))["tags"], "\n")
    for m in ("cosine", "jaccard", "tfidf"):
        print(f"── 태그 {m}  (ID, 점수, 겹친 태그 수)")
        for r in E.similar_images(pid, method=m, k=10): print("  ", r)
    print("── 합친 결과 (ID, 최종, 태그점수, 해밍)")
    for r in E.combined(pid, k=10): print("  ", r)
elif cmd == "phash":
    for r in E.phash_neighbors(int(args[0]), max_dist=int(args[1]) if len(args) > 1 else 10): print("  ID, 해밍:", r)
elif cmd == "dup":
    for r in E.duplicates(max_dist=int(args[0]) if args else 4): print("  ", r)
elif cmd == "tag":
    for r in E.similar_tags(args[0], 20): print("   태그, 유사도, 같이 나온 수:", r)
elif cmd == "expand":
    print("검색 넓히기:", E.expand(args)); print("추천 태그:", E.recommend(args))
    print("모두 가진 이미지:", E.search(args, 20))
elif cmd == "top":
    for t, c in E.top_tags(50): print(f"  {c:>7,}  {t}")
else:
    print(__doc__)
