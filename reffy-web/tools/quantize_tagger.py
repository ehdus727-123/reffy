"""WD14 태거 모델을 int8 로 줄이기 (클라우드 무료 서버 512MB 메모리에 맞추려고).

    python tools/quantize_tagger.py

models/<모델이름>/model.int8.onnx 를 만들고, 원본 model.onnx 는 지운다(디스크 · 메모리 절약).
실패해도 사이트는 AI 태그 없이 정상 동작하므로 오류로 끝내지 않는다.
"""
import gc
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("TAGGER", "auto")

try:
    from app import config
    from app.tagger import T

    folder = config.MODEL_DIR / T.model_id
    out = folder / "model.int8.onnx"
    if out.exists():
        print("[AI] int8 모델이 이미 있어요:", out); sys.exit(0)
    src = T._fetch("model.onnx", folder)
    T._fetch("selected_tags.csv", folder)
    print("[AI] int8 로 줄이는 중...", flush=True)
    from onnxruntime.quantization import QuantType, quantize_dynamic
    quantize_dynamic(str(src), str(out), weight_type=QuantType.QUInt8)
    gc.collect()
    src.unlink(missing_ok=True)
    print(f"[AI] 완료: {out} ({out.stat().st_size / 1024 / 1024:.0f}MB)", flush=True)
except Exception as e:  # noqa: BLE001
    print("[AI] int8 모델을 만들지 못했어요 (AI 태그 없이 동작):", type(e).__name__, e, flush=True)
