import logging
from contextlib import asynccontextmanager

import app.state as state
from app.model import load_model
from fastapi import FastAPI
from app.api.speech import router as speech_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup: runs BEFORE the server accepts any connection ──────────────
    # load_model() blocks here intentionally — we do not want Kubernetes to
    # route traffic until the model is fully loaded and warmed up.
    load_model()
    state.set_ready()   # ← only set AFTER load_model() succeeds
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────────


app = FastAPI(title="Speech Service", lifespan=lifespan)

app.include_router(speech_router)