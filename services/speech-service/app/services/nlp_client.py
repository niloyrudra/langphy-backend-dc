import os
import httpx

NLP_SERVICE_URL = os.getenv(
    "NLP_SERVICE_URL",
    "http://nlp:8000" # "http://nlp-srv:8000"
)

# default analysis fallback if NLP fails
DEFAULT_ANALYSIS = {
    "pronunciation": None,
    "fluency": None,
    "accuracy": None,
    "errors": []
}

async def evaluate_text(expected: str, spoken: str):
    expected_clean = expected.strip()
    spoken_clean = spoken.strip()
    timeout = httpx.Timeout(10.0, connect=5.0, read=10.0, write=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(
                f"{NLP_SERVICE_URL}/api/nlp/analyze/evaluate-speaking",
                json={
                    "expected_text": expected_clean,
                    "spoken_text": spoken_clean
                },
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            # return analysis if exists, else fallback
            # return data.get("analysis") or DEFAULT_ANALYSIS
            return data

        except httpx.HTTPStatusError as e:
            # NLP returned 4xx/5xx
            return {
                **DEFAULT_ANALYSIS,
                "errors": [f"NLP service HTTP error {e.response.status_code}"]
            }

        except httpx.RequestError as e:
            # network / connection errors
            return {
                **DEFAULT_ANALYSIS,
                "errors": [f"NLP service request failed: {str(e)}"]
            }

        except Exception as e:
            # fallback safe object
            return {
                "spoken_text": spoken_clean,
                "similarity": None,
                "pronunciation_score": None,
                "feedback": "",
                "issues": [],
                "error": str(e)
            }
            # any other unexpected errors
            # return {
            #     **DEFAULT_ANALYSIS,
            #     "errors": [f"Unexpected error in NLP evaluation: {str(e)}"]
            # }



def evaluate_text_sync(expected: str, spoken: str) -> dict:
    """
    Synchronous version for use inside RQ worker jobs.
    Avoids asyncio.new_event_loop() conflicts in worker threads.
    """
    expected_clean = expected.strip()
    spoken_clean = spoken.strip()

    try:
        with httpx.Client(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
            response = client.post(
                f"{NLP_SERVICE_URL}/api/nlp/analyze/evaluate-speaking",
                json={
                    "expected_text": expected_clean,
                    "spoken_text": spoken_clean,
                },
            )
            response.raise_for_status()
            return response.json()

    except httpx.HTTPStatusError as e:
        return {
            **DEFAULT_ANALYSIS,
            "errors": [f"NLP service HTTP error {e.response.status_code}"],
        }
    except httpx.RequestError as e:
        return {
            **DEFAULT_ANALYSIS,
            "errors": [f"NLP service request failed: {str(e)}"],
        }
    except Exception as e:
        return {
            **DEFAULT_ANALYSIS,
            "errors": [f"Unexpected error: {str(e)}"],
        }