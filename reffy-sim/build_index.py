"""MariaDB(또는 CSV)에서 데이터를 읽어 유사도 인덱스를 만듭니다.

사용:  python build_index.py                 # .env 의 MariaDB 에서
       python build_index.py --csv a.csv b.csv  # CSV 에서
데이터가 새로 쌓이면 다시 돌리면 됩니다 (DB 는 읽기만 함).
"""
import argparse
import simlib

ap = argparse.ArgumentParser()
ap.add_argument("--csv", nargs="*", help="DB 대신 CSV 파일에서 읽기")
ap.add_argument("--limit", type=int, help="앞에서 N장만 (테스트용)")
ap.add_argument("--min-df", type=int, default=3, help="이 장수 이상 나온 태그만 사용 (기본 3)")
ap.add_argument("--min-co", type=int, default=3, help="태그 추천: 같이 나온 횟수 최소값 (기본 3)")
a = ap.parse_args()
rows = simlib.read_csv(a.csv) if a.csv else simlib.read_mariadb(a.limit)
simlib.build(rows, min_df=a.min_df, min_co=a.min_co)
