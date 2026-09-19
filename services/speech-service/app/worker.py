import logging
import os
import signal
import sys
import threading
import time

import redis
from rq import Queue
from rq.worker import SimpleWorker
from rq.job import Job
from rq.timeouts import JobTimeoutException

from app.model import load_model
from app.config import get_settings
from app.services.logging import setup_logging, LoggingMixin

# Configure structured logging
settings = get_settings()
setup_logging(
    service_name="speech-worker",
    level=settings.LOG_LEVEL,
    format_type=settings.LOG_FORMAT,
)
logger = logging.getLogger(__name__)

REDIS_HOST = settings.REDIS_HOST
REDIS_PORT = settings.REDIS_PORT
REDIS_PASSWORD = settings.REDIS_PASSWORD
QUEUE_NAME = "speech"

# Global state for graceful shutdown
_shutdown_event = threading.Event()
_worker_instance = None
_current_job: Job = None


def _get_redis() -> redis.Redis:
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=False,
    )


class GracefulWorker(SimpleWorker):
    """
    SimpleWorker with graceful shutdown support.
    
    Handles SIGTERM/SIGINT by finishing current job before exiting.
    """
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._shutdown_requested = False
    
    def work(self, *args, **kwargs):
        """Override work to add shutdown signal handling."""
        # Set up signal handlers
        self._setup_signals()
        
        logger.info("Worker started, waiting for jobs...")
        try:
            super().work(*args, **kwargs)
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
        except SystemExit:
            logger.info("System exit requested")
        finally:
            logger.info("Worker stopped")
    
    def _setup_signals(self):
        """Set up signal handlers for graceful shutdown."""
        def signal_handler(signum, frame):
            sig_name = signal.Signals(signum).name
            logger.info("Received %s, initiating graceful shutdown...", sig_name)
            self._shutdown_requested = True
            _shutdown_event.set()
            # Don't call sys.exit here - let the work loop handle it
        
        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)
    
    def execute_job(self, job, queue):
        """Override to track current job and check shutdown flag."""
        global _current_job
        _current_job = job
        _shutdown_event.clear()
        
        try:
            # Check if shutdown was requested before starting
            if self._shutdown_requested:
                logger.info("Shutdown requested, requeueing job %s", job.id)
                job.requeue()
                return False
            
            logger.info("Starting job %s (%s)", job.id, job.func_name)
            start_time = time.time()
            
            result = super().execute_job(job, queue)
            
            duration = time.time() - start_time
            logger.info("Job %s completed in %.2fs", job.id, duration)
            return result
            
        except Exception as e:
            duration = time.time() - start_time
            logger.exception("Job %s failed after %.2fs: %s", job.id, duration, e)
            raise
        finally:
            _current_job = None
    
    def should_stop(self) -> bool:
        """Check if worker should stop (for periodic checks during long jobs)."""
        return self._shutdown_requested or _shutdown_event.is_set()


class NoSigalrmWorker(GracefulWorker):
    """
    Worker with SIGALRM disabled AND graceful shutdown support.
    
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
    """Main worker entry point with graceful shutdown."""
    logger.info("=== Speech worker starting: warming Whisper model before accepting jobs ===")
    load_model()
    logger.info("=== Model warm. Connecting to Redis at %s:%s ===", REDIS_HOST, REDIS_PORT)
    
    conn = _get_redis()
    queues = [Queue(QUEUE_NAME, connection=conn)]
    
    global _worker_instance
    _worker_instance = NoSigalrmWorker(queues, connection=conn)
    
    # Log worker info
    logger.info("Worker PID: %d, Queues: %s", os.getpid(), [q.name for q in queues])
    
    # Start working
    _worker_instance.work(with_scheduler=False)


def shutdown_worker(timeout: float = 30.0) -> bool:
    """
    Request graceful shutdown of the worker.
    
    Args:
        timeout: Maximum time to wait for current job to complete
    
    Returns:
        True if shutdown completed gracefully, False if timed out
    """
    global _worker_instance
    
    if _worker_instance is None:
        logger.warning("No worker instance to shut down")
        return True
    
    logger.info("Requesting graceful shutdown (timeout=%.1fs)...", timeout)
    _worker_instance._shutdown_requested = True
    _shutdown_event.set()
    
    # Wait for current job to complete
    start = time.time()
    while _current_job is not None:
        if time.time() - start > timeout:
            logger.warning("Graceful shutdown timeout after %.1fs, forcing exit", timeout)
            return False
        time.sleep(0.5)
    
    logger.info("Graceful shutdown completed")
    return True


if __name__ == "__main__":
    try:
        boot_worker()
    except Exception as e:
        logger.exception("Worker crashed: %s", e)
        sys.exit(1)