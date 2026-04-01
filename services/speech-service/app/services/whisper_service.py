# from faster_whisper import WhisperModel
# from app.model import get_model

"""
app/services/whisper_service.py

WHAT CHANGED FROM YOUR VERSION
────────────────────────────────
Your original instantiated WhisperModel("small", ...) at the bottom of this
file as a module-level singleton:

    whisper_service = WhisperService()   ← triggers full model load on import

This caused two problems:

1. DOUBLE MODEL: app/model.py also manages a WhisperModel singleton and runs
   the warm-up inference. Your worker.py called load_model() from app/model.py
   to warm up — but speech_job.py imported whisper_service from HERE, which
   has its own completely separate, never-warmed WhisperModel instance.
   The warm-up was heating the wrong model. The actual transcription job
   always ran on a cold model.

2. IMPORT-TIME LOAD: Any file that imported whisper_service triggered a full
   600 MB model load as a side effect, including in contexts where you did not
   want it (e.g., during FastAPI startup before lifespan ran).

FIX: WhisperService.transcribe() now calls get_model() from app/model.py.
There is one model instance in the process, loaded and warmed once by
load_model() at startup. whisper_service = WhisperService() is now a
trivial object with no side effects on import.
"""

from app.model import get_model


class WhisperService:
    """
    Thin wrapper around the shared Faster-Whisper model singleton.

    Instantiating this class is free — no model is loaded here.
    The model is loaded once by load_model() in the lifespan (API pod)
    or boot_worker() (worker pod), and retrieved via get_model().
    """

    def transcribe(self, audio_path: str) -> dict:
        """
        Transcribe a WAV file (16 kHz mono) and return text + word-level segments.

        Uses the already-warm model from app/model.py — no cold-start cost.
        """
        model = get_model()  # ← O(1) lookup, never triggers a load

        segments_gen, _ = model.transcribe(
            audio_path,
            language="de",
            word_timestamps=True,
            beam_size=1,    # fast; increase to 5 for higher accuracy
            best_of=1,
            vad_filter=False,    # ← disable — doubles peak RAM, not needed for clean recordings
            # vad_filter=True,
            # vad_parameters={
            #     "min_silence_duration_ms": 300,  # default is 2000ms — way too aggressive
            #     "speech_pad_ms": 400,            # pad detected speech 400ms on each side
            #     "threshold": 0.3,               # default 0.5 — lower = more sensitive
            # },
        )

        result_segments = []
        for segment in segments_gen:
            result_segments.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "words": [
                    {
                        "word":        w.word,
                        "start":       w.start,
                        "end":         w.end,
                        "probability": w.probability,
                    }
                    for w in (segment.words or [])
                ],
            })

        return {
            "text":     " ".join(s["text"] for s in result_segments),
            "segments": result_segments,
        }


# Instantiation is now free — no model load happens here.
whisper_service = WhisperService()