"""Finds faces in a time range of a video with YuNet (OpenCV, MIT licence).

Usage: python scripts/faces.py <video> <start_sec> <end_sec> <samples_per_sec>
Prints JSON: {width, height, samples: [{t, faces: [[cx, cy, w, h, score], ...]}]} with t relative to start_sec
and face boxes normalised to 0..1 (cx, cy are the box centre).
"""
import json
import os
import sys

import cv2

video, start, end, rate = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
model = os.path.join(os.path.dirname(__file__), "..", "pipeline", "models", "face_detection_yunet_2023mar.onnx")

cap = cv2.VideoCapture(video)
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
scale = 640 / max(W, 1)
w, h = 640, max(1, int(round(H * scale)))
detector = cv2.FaceDetectorYN.create(model, "", (w, h), score_threshold=0.75)

samples = []
t = start
step = 1.0 / rate
while t < end:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, frame = cap.read()
    if not ok:
        break
    small = cv2.resize(frame, (w, h))
    _, found = detector.detect(small)
    faces = []
    if found is not None:
        for f in found:
            x, y, fw, fh, score = float(f[0]), float(f[1]), float(f[2]), float(f[3]), float(f[14])
            faces.append([round((x + fw / 2) / w, 4), round((y + fh / 2) / h, 4), round(fw / w, 4), round(fh / h, 4), round(score, 3)])
    samples.append({"t": round(t - start, 3), "faces": faces})
    t += step

print(json.dumps({"width": W, "height": H, "samples": samples}))
