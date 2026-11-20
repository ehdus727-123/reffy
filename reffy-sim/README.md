# reffy-sim · 유사도 엔진

WD14 없이 **Safebooru 태그 + pHash**만으로 비슷한 이미지·비슷한 태그를 찾는 프로그램이에요.
MariaDB `safebooru.posts`를 **읽기만** 하고, 크롤러와 `daily_load.bat`은 지금처럼 그대로 돌리면 돼요.

| 단계 | 하는 일 | 쓰는 칸 |
|---|---|---|
| 2. pHash | 해밍 거리로 중복·변형 이미지 판별 | `PerceptualHash` |
| 3. 이미지 유사도 | 이미지마다 General 태그 벡터 → 코사인 / 자카드 / TF-IDF 코사인 | `General` |
| 4. 합치기 | 가중합(전략 A) 또는 pHash 후보 → 태그 재정렬(전략 B), 데이터가 많아지면 Faiss | 둘 다 |
| 5. 태그 유사도 | 태그끼리 같이 나온 비율 → 비슷한 태그 추천, 검색 넓히기 | `General` |

## 처음 한 번 (PowerShell, 한 줄씩)

```powershell
cd C:\Users\TG\Desktop\reffy\reffy-sim
..\.venv\Scripts\python.exe -m pip install -r requirements.txt
```
MariaDB 접속 정보는 `daily_load.bat`이 쓰는 `C:\safebooru_load\sb.cnf`를 그대로 읽어요. 따로 적을 필요 없어요.
(다른 곳의 DB를 쓰려면 `.env`에 `DB_CNF=` 경로를 적거나, `DB_HOST` · `DB_USER` · `DB_PASSWORD`를 적으면 돼요. `.env`는 GitHub에 올라가지 않아요.)
로컬 이미지로 보고 싶으면 `IMAGE_PATH`에 크롤러 이미지 경로를 적어요. 비워 두면 safebooru 원본 주소로 보여 줘요.

## 쓰는 법

```powershell
..\.venv\Scripts\python.exe build_index.py     # 1) 인덱스 만들기 (데이터가 늘면 다시 실행)
..\.venv\Scripts\python.exe viewer.py          # 2) 확인 화면 → http://localhost:8300
```

명령창에서 바로 보기:
```powershell
..\.venv\Scripts\python.exe query.py image 1000000     # 비슷한 이미지 (방식별)
..\.venv\Scripts\python.exe query.py phash 1000000     # 거의 같은 이미지
..\.venv\Scripts\python.exe query.py dup               # 중복 의심 쌍
..\.venv\Scripts\python.exe query.py tag long_hair     # 비슷한 태그
..\.venv\Scripts\python.exe query.py expand 1girl lying  # 검색 넓히기 + 추천
..\.venv\Scripts\python.exe query.py top               # 많이 나온 태그
```

## 확인 화면에서 할 일

결과가 **진짜 비슷한지는 사람이 봐야 해요.** 결과 아래 ○(비슷함) / ×(아님)를 누르면
`data/ratings.csv`에 쌓이고, 위쪽에 **방식별 '비슷함' 비율**이 나와요.
팀원이 같이 눌러 보면 코사인·자카드·TF-IDF·합친 결과 중 무엇이 나은지 숫자로 비교할 수 있어요.

## 설정값

- `--min-df 3` : 3장 미만에 나온 태그는 버려요 (잡음 제거). 데이터가 많아지면 올려도 돼요.
- `--min-co 3` : 태그 추천에서 같이 나온 횟수가 3번 미만이면 버려요.
- 합친 결과의 **태그 비중**은 화면 위쪽에서 바꿀 수 있어요 (기본 태그 0.7 + pHash 0.3).
- pHash 점수 = `1 − 해밍/32` (무관한 이미지는 보통 해밍 32 근처라 0점).

## 주의

- 유저가 새로 올린 이미지의 pHash를 DB와 비교하려면, 크롤러가 쓴 것과 **같은 pHash 계산 방식**으로 구해야 해요.
- 데이터가 수십만 장이 되면 `faiss-cpu`를 설치하고 `Engine.faiss_phash()`를 쓰면 빨라져요.
