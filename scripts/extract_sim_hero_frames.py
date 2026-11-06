"""Extract 3-mod hero frames from current orange-arrow RoboTwin videos.

Side-by-side layout from viz_rollout_streams.py (size=320, 224x168 spatial):
header 30px + four 320x240 panels (banner is the top 24px of each panel):
tracks | DINO | depth | live RGB.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "static" / "hero" / "src"
OUT = ROOT / "static" / "hero" / "frames"
MANIFEST = OUT / "manifest.json"

VIDEOS = {
    "dump": SRC_DIR / "dump_bin_bigbin.mp4",
    "pick": SRC_DIR / "pick_diverse_bottles.mp4",
    "bread": SRC_DIR / "place_bread_skillet.mp4",
    "put": SRC_DIR / "put_bottles_dustbin.mp4",
    "bowls": SRC_DIR / "stack_bowls_three.mp4",
    "switch": SRC_DIR / "turn_switch.mp4",
}

HEADER = 30
BANNER = 24
PAD = 4
COL_W = 320
MODS = ["tracks", "dino", "depth", "rgb"]
COL_X = [(i * COL_W, (i + 1) * COL_W) for i in range(len(MODS))]
MIN_ORANGE_CHANGE = 80
HOLD_LO = 6
HOLD_HI = 12


def orange_mask(bgr: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    return (r > 140) & (r > g + 20) & (r > b + 30) & (g > 60) & (g > b)


def crop_panel(row: np.ndarray, x0: int, x1: int) -> np.ndarray:
    y0 = HEADER + BANNER + PAD
    y1 = row.shape[0] - PAD
    return row[y0:y1, x0 + PAD : x1 - PAD]


def read_video(path: Path) -> list[np.ndarray]:
    cap = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        frames.append(bgr)
    cap.release()
    if not frames:
        raise RuntimeError(f"no frames in {path}")
    return frames


def keyframe_starts(tracks: list[np.ndarray]) -> list[int]:
    """First frame of each accumulating track segment."""
    keys: list[int] = []
    prev = None
    for i, crop in enumerate(tracks):
        if int(orange_mask(crop).sum()) < 30:
            continue
        cur = orange_mask(crop)
        if prev is None or int(np.logical_xor(prev, cur).sum()) >= MIN_ORANGE_CHANGE:
            keys.append(i)
            prev = cur
    return keys


def pair_keyframes(keys: list[int]) -> list[tuple[int, int]]:
    """Pair the two keyframes of each 2-future plan (hold is typically 8)."""
    pairs = []
    i = 0
    while i + 1 < len(keys):
        gap = keys[i + 1] - keys[i]
        if HOLD_LO <= gap <= HOLD_HI:
            pairs.append((keys[i], keys[i + 1]))
            i += 2
        else:
            i += 1
    return pairs


def extract_task(task: str, path: Path) -> list[tuple[int, int]]:
    frames = read_video(path)
    h, w = frames[0].shape[:2]
    print(f"{task}: {path.name} {w}x{h} n={len(frames)}")
    tracks = [crop_panel(row, *COL_X[0]) for row in frames]
    pairs = pair_keyframes(keyframe_starts(tracks))
    if pairs:
        last_i = len(frames) - 1
        while last_i > 0 and float(frames[last_i].mean()) < 28:
            last_i -= 1
        if last_i > pairs[-1][1] + 4:
            pairs.append((pairs[-1][1], last_i))

    dests = {mod: OUT / task / mod for mod in MODS}
    for dest in dests.values():
        dest.mkdir(parents=True, exist_ok=True)
        for old in dest.glob("*.jpg"):
            old.unlink()

    for p, (a, b) in enumerate(pairs):
        for k, idx in enumerate((a, b)):
            out_i = p * 2 + k
            row = frames[idx]
            for mod, (x0, x1) in zip(MODS, COL_X):
                cv2.imwrite(
                    str(dests[mod] / f"{out_i:02d}.jpg"),
                    crop_panel(row, x0, x1),
                    [int(cv2.IMWRITE_JPEG_QUALITY), 88],
                )
    return pairs


def main() -> None:
    counts = {}
    if MANIFEST.exists():
        counts = json.loads(MANIFEST.read_text())
    for task, path in VIDEOS.items():
        if not path.exists():
            raise FileNotFoundError(f"missing {path}")
        pairs = extract_task(task, path)
        counts[task] = 2 * len(pairs)
        print(f"  {len(pairs)} plans -> {counts[task]} frames  {pairs}")

    MANIFEST.write_text(json.dumps(counts, indent=2) + "\n")
    print(f"wrote {OUT} sim={ {t: counts[t] for t in VIDEOS} }")


if __name__ == "__main__":
    main()
