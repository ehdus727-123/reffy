import os
import uvicorn

from app import config  # noqa: F401  (.env 를 먼저 읽어 HOST · PORT 가 적용되게 한다)

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8100")))
