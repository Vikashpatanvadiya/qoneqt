"""edge-tts wrapper: writes an mp3 and a JSON file of word timings.

Usage: python scripts/tts.py <voice> <out.mp3> <out.json> [rate, e.g. +8%]   (text on stdin)
"""
import asyncio
import json
import sys

import edge_tts


async def main() -> None:
    voice, out_audio, out_json = sys.argv[1], sys.argv[2], sys.argv[3]
    rate = sys.argv[4] if len(sys.argv) > 4 else "+0%"
    text = sys.stdin.read().strip()
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    except TypeError:  # older edge-tts emits word boundaries by default
        communicate = edge_tts.Communicate(text, voice, rate=rate)

    words = []
    with open(out_audio, "wb") as audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 1e7  # offsets are in 100ns units
                words.append({"word": chunk["text"], "startSec": start, "endSec": start + chunk["duration"] / 1e7})

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False)


asyncio.run(main())
