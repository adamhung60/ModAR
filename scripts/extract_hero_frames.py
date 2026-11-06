"""Extract hero frames from v5-2 orange-arrow rollout videos.

Each plan is a fixed RGB background. Tracks reveal the first future
segment (arrowheads on that segment), then the second, leaving the first
in place and moving the heads — the same order as RolloutVisualizer.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "static" / "hero" / "src"
OUT = ROOT / "static" / "hero" / "frames"

VIDEOS = {
    "stack": SRC_DIR / "stack_20260827_130728.mp4",
    "fold": SRC_DIR / "fold_20260827_132400.mp4",
    "drawer": SRC_DIR / "drawer_20260827_134400.mp4",
}

HEADER = 42
BANNER = 24
PAD = 4
COL_X = [(8, 447), (448, 895), (896, 1343), (1344, 1784)]
MODS = ["tracks", "dino", "depth", "rgb"]
# One executed action per video frame; 8-step observation stride.
SEG2_OFFSET = 8
MIN_GROUP = 9
BG_MAD = 3.5


def orange_mask(bgr: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    return (r > 140) & (r > g + 20) & (r > b + 30) & (g > 60) & (g > b)


def clean_bg(bgr: np.ndarray) -> np.ndarray:
    mask = cv2.dilate(
        orange_mask(bgr).astype(np.uint8),
        np.ones((7, 7), np.uint8),
        iterations=1,
    )
    filled = bgr.copy()
    filled[mask > 0] = 0
    return cv2.inpaint(filled, mask, 3, cv2.INPAINT_TELEA)


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


def group_plans(tracks: list[np.ndarray]) -> list[list[int]]:
    groups: list[list[int]] = []
    prev_bg = None
    for i, crop in enumerate(tracks):
        if float(crop.mean()) < 28 or int(orange_mask(crop).sum()) < 30:
            continue
        bg = cv2.resize(clean_bg(crop), (110, 55), interpolation=cv2.INTER_AREA)
        if prev_bg is None:
            new_group = True
        else:
            mad = float(
                np.mean(np.abs(bg.astype(np.float32) - prev_bg.astype(np.float32)))
            )
            new_group = mad > BG_MAD
        if new_group:
            groups.append([])
        groups[-1].append(i)
        prev_bg = bg
    return groups


def pair_for_group(ids: list[int], tracks: list[np.ndarray]) -> tuple[int, int] | None:
    if len(ids) < MIN_GROUP:
        if len(ids) >= 2:
            a, b = ids[0], ids[-1]
        else:
            return None
    else:
        a, b = ids[0], ids[min(SEG2_OFFSET, len(ids) - 1)]
    m1 = orange_mask(tracks[a])
    m2 = orange_mask(tracks[b])
    changed = int(np.logical_xor(m1, m2).sum())
    if changed < 40:
        return None
    return a, b


def extract_task(task: str, path: Path) -> list[tuple[int, int]]:
    frames = read_video(path)
    tracks = [crop_panel(row, *COL_X[0]) for row in frames]
    pairs = []
    for ids in group_plans(tracks):
        pair = pair_for_group(ids, tracks)
        if pair is None:
            continue
        pairs.append(pair)
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
    for task, path in VIDEOS.items():
        if not path.exists():
            raise FileNotFoundError(
                f"missing {path}; copy the v5-2 success mp4s into {SRC_DIR}"
            )
        pairs = extract_task(task, path)
        counts[task] = 2 * len(pairs)
        print(f"{task}: {len(pairs)} plans -> {counts[task]} frames  {pairs}")

    manifest = OUT / "manifest.json"
    manifest.write_text(json.dumps(counts, indent=2) + "\n")
    print(f"wrote {OUT} {counts}")


if __name__ == "__main__":
    main()
