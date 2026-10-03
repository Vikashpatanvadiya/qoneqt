"""Downloads a video link with yt-dlp (up to 1080p MP4) and prints JSON: {title, durationSec, file, uploader}.

Usage: python scripts/fetch_video.py <url> <out_dir> <max_seconds>
Only for videos the user owns or has permission to use (the Create page asks them to confirm).
"""
import json
import sys

import yt_dlp

url, out_dir, max_sec = sys.argv[1], sys.argv[2], int(sys.argv[3])


def too_long(info, *, incomplete):
    d = info.get("duration")
    if d and d > max_sec:
        return f"The video is {int(d // 60)} min long; the limit is {max_sec // 60} min"
    return None


opts = {
    "format": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b",
    "merge_output_format": "mp4",
    "outtmpl": f"{out_dir}/source.%(ext)s",
    "match_filter": too_long,
    "noplaylist": True,
    "quiet": True,
    "no_warnings": True,
    "restrictfilenames": True,
}
try:
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if info is None:
            raise RuntimeError("No video found at this link")
        path = ydl.prepare_filename(info).rsplit(".", 1)[0] + ".mp4"
    print(json.dumps({"title": info.get("title"), "durationSec": info.get("duration"), "file": path, "uploader": info.get("uploader")}))
except Exception as err:  # noqa: BLE001 - the message is shown to the user
    msg = str(err)
    if "Sign in to confirm" in msg or "bot" in msg.lower() or "403" in msg:
        msg = "YouTube refused the download from our server. Download the video yourself and upload the file instead."
    elif "limit is" in msg or "skipping" in msg.lower():
        msg = msg.split("ERROR:")[-1].strip()
    print(json.dumps({"error": msg[:300]}))
    sys.exit(2)
