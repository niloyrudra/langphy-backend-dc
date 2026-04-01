import logging
import os

import redis
from rq import Queue
from rq.worker import SimpleWorker
from rq.job import Job
from rq.timeouts import JobTimeoutException

from app.model import load_model

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
QUEUE_NAME = "speech"


def _get_redis() -> redis.Redis:
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT)


class NoSigalrmWorker(SimpleWorker):
    """
    SimpleWorker (no fork) with SIGALRM death penalty disabled.

    WHY:
    SimpleWorker correctly runs jobs in-process without forking.
    However perform_job() wraps the job call in `self.death_penalty_class`
    which uses SIGALRM to enforce timeouts. SIGALRM interrupts CTranslate2's
    internal C++ thread synchronisation, causing Whisper to deadlock silently.

    Direct exec of WhisperModel.transcribe() in the pod completes fine —
    confirming CTranslate2 itself works. The SIGALRM signal is the trigger.

    Fix: replace death_penalty_class with a no-op context manager so the
    job runs uninterrupted. We rely on job_timeout=120 in speech.py as a
    soft timeout via RQ's own job registry instead.
    """

    class _NoOpTimeout:
        """Drop-in replacement for death_penalty_class that does nothing."""
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def cancel(self):
            pass

    death_penalty_class = _NoOpTimeout


def boot_worker():
    logger.info("=== Speech worker starting: warming Whisper model before accepting jobs ===")
    load_model()
    logger.info("=== Model warm. Connecting to Redis at %s:%s ===", REDIS_HOST, REDIS_PORT)

    conn = _get_redis()
    queues = [Queue(QUEUE_NAME, connection=conn)]
    worker = NoSigalrmWorker(queues, connection=conn)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    boot_worker()




"""
app/worker.py

RQ worker entry point for the speech-worker pod.

WHY THE WORKER ALSO NEEDS WARM-UP
----------------------------------
The speech-worker pod runs separately from the speech-api pod.  Each pod
is its own Python process and its own model instance.  The same 60-second
cold-start penalty applies here.

We solve it the same way: load_model() runs before the RQ worker loop
begins accepting jobs.  By the time the first job arrives from the queue,
the model is already warm.

HOW TO RUN
----------
  Direct:   python app/worker.py
  Via rq:   rq worker speech          ← used in Dockerfile/K8s (see below)

The Kubernetes deployment uses `rq worker speech` directly (the CMD in
speech-worker-depl.yaml).  For that case, warm-up happens via the
RQ worker `init_func` hook, NOT by running this file as __main__.
Set the RQ_WORKER_INIT env var to trigger the hook path.

Either way, load_model() is idempotent – calling it twice is safe.
"""