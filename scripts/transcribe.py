"""Word-timed transcript of a voiceover with faster-whisper (MIT licence), on CPU.

Usage: python scripts/transcribe.py <audio> <out.json> [model, default "base"]
Writes {"language", "duration", "words": [{"word", "startSec", "endSec"}]}.
"""
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel


def load_audio(path: str) -> np.ndarray:
    # Decode with ffmpeg to 16 kHz mono float32. This avoids PyAV version differences in faster-whisper's own decoder.
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def main() -> None:
    audio, out = sys.argv[1], sys.argv[2]
    model_name = sys.argv[3] if len(sys.argv) > 3 else "base"
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(load_audio(audio), word_timestamps=True, vad_filter=True, beam_size=5)
    words = []
    for segment in segments:
        for w in segment.words or []:
            text = w.word.strip()
            if text:
                words.append({"word": text, "startSec": round(w.start, 3), "endSec": round(w.end, 3)})
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"language": info.language, "duration": info.duration, "words": words}, f, ensure_ascii=False)


main()
