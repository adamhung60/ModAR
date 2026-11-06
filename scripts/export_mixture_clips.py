#!/usr/bin/env python3
"""Export 10 random clips per (source, task) for the training-data UI."""

from __future__ import annotations

import json
import random
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import torch

_REPO = Path("/home/adam-local/Desktop/modality_forcing_wam")
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from util.modality_forcing.codec import decode_rgb_jpeg

DATA_ROOT = Path("/data-fast/adam-local/datasets")
OUT = Path("/tmp/modar_mixture_clips")

TASKS = {
    "stack": {
        "egodex": "stack_unstack_cups",
        "teleop": "stack_cups",
    },
    "fold": {
        "egodex": "basic_fold",
        "teleop": "fold_towel",
    },
    "drawer": {
        "egodex": "insert_remove_drawer",
        "teleop": "place_in_drawer",
    },
}

SOURCES = (
    ("robot", "robot_teleop_126", "teleop"),
    ("id", "id_human_126", "teleop"),
    ("ood", "egodex_v2", "egodex"),
)

N_CLIPS = 10
SCALE = 2
OUT_FPS = 10.0
PINNED = {
    ("ood", "stack"): [
        "demo_000658",
        "demo_000583",
        "demo_000142",
        "demo_000884",
    ],
}


def list_demos(task_root: Path) -> list[Path]:
    demos = sorted(p for p in task_root.glob("demo_*") if p.is_dir())
    if not demos:
        raise FileNotFoundError(f"no demos under {task_root}")
    return demos


def load_frames(demo: Path) -> tuple[list[np.ndarray], float]:
    meta = json.loads((demo / "metadata.json").read_text())
    pack = torch.load(demo / "trajectory.pt", map_location="cpu", weights_only=False)
    frames = [decode_rgb_jpeg(jpeg) for jpeg in pack["images_jpg"]]
    if not frames:
        raise ValueError(f"{demo}: no RGB keyframes")
    source_fps = float(meta.get("source_fps", 30.0))
    keyframe_stride = int(meta.get("keyframe_stride", 4))
    return frames, source_fps / keyframe_stride


def write_clip(frames_rgb: list[np.ndarray], keyframe_hz: float, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    raw = dest.with_suffix(".raw.mp4")
    h, w = frames_rgb[0].shape[:2]
    out_w, out_h = w * SCALE, h * SCALE
    writer = cv2.VideoWriter(
        str(raw),
        cv2.VideoWriter_fourcc(*"mp4v"),
        OUT_FPS,
        (out_w, out_h),
    )
    if not writer.isOpened():
        raise RuntimeError(f"failed to open {raw}")

    duration_s = len(frames_rgb) / keyframe_hz
    n_out = max(int(round(duration_s * OUT_FPS)), 1)
    for i in range(n_out):
        t = i / OUT_FPS
        idx = min(int(t * keyframe_hz), len(frames_rgb) - 1)
        rgb = cv2.resize(
            frames_rgb[idx],
            (out_w, out_h),
            interpolation=cv2.INTER_LINEAR,
        )
        writer.write(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    writer.release()

    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(raw),
            "-an", "-c:v", "libx264", "-crf", "26", "-preset", "fast",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(dest),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    raw.unlink()


def main() -> None:
    rng = random.Random(0)
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    manifest = {
        "n_clips": N_CLIPS,
        "size": [224 * SCALE, 126 * SCALE],
        "fps": OUT_FPS,
        "sources": {},
    }

    for stem, root_name, task_field in SOURCES:
        dataset_rng = random.Random(rng.randint(0, 2**31 - 1))
        manifest["sources"][stem] = {}
        for task_key, task_info in TASKS.items():
            task_dir = DATA_ROOT / root_name / task_info[task_field]
            demos = list_demos(task_dir)
            pinned_names = PINNED.get((stem, task_key), [])
            by_name = {demo.name: demo for demo in demos}
            chosen = [by_name[name] for name in pinned_names]
            leftover = [demo for demo in demos if demo.name not in set(pinned_names)]
            chosen.extend(dataset_rng.sample(leftover, N_CLIPS - len(chosen)))
            clips = []
            dest_dir = OUT / stem / task_key
            for i, demo in enumerate(chosen):
                frames, hz = load_frames(demo)
                dest = dest_dir / f"{i:02d}.mp4"
                write_clip(frames, hz, dest)
                clips.append({
                    "demo": demo.name,
                    "n_frames": len(frames),
                    "seconds": round(len(frames) / hz, 2),
                    "path": f"static/mixture/{stem}/{task_key}/{i:02d}.mp4",
                })
                print(
                    f"{stem}/{task_key}/{i:02d}: {demo.name} "
                    f"{len(frames)}kf {clips[-1]['seconds']}s"
                )
            manifest["sources"][stem][task_key] = clips

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
