import ffmpeg
import os

def normalize_audio(input_path: str) -> str:
    output_path = input_path.replace(".m4a", "_norm.wav")

    try:
        (
            ffmpeg
            .input(input_path)
            .output(
                output_path,
                ac=1,        # mono
                ar=16000,    # 16kHz
                format="wav"
            )
            .run(overwrite_output=True)  # <-- remove quiet=True
        )
    except ffmpeg.Error as e:
        print("FFMPEG ERROR:")
        print(e.stderr.decode() if e.stderr else str(e))
        raise RuntimeError(f"Failed to normalize audio: {e}") from e

    return output_path