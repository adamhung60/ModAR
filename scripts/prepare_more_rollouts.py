"""Encode the hand-picked ModAR successes for the More real-world rollouts section."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PICKER = ROOT / "tools" / "real_rollout_picker"
SELECTION = PICKER / "selection.json"
OUT = ROOT / "static" / "rollouts"
TASKS = {
    "stack": "stack_cups",
    "fold": "fold_towel",
    "drawer": "place_in_drawer",
}
CROP = "428:216"
SCALES = [
    ("12", "72"),
    ("456", "72"),
    ("904", "72"),
    ("1352", "72"),
]


def encode(src: Path, dest: Path) -> None:
    parts = []
    labels = []
    for i, (x, y) in enumerate(SCALES):
        label = f"p{i}"
        labels.append(f"[{label}]")
        parts.append(f"[0:v]crop={CROP}:{x}:{y},scale=320:164[{label}]")
    filt = ";".join(parts) + ";" + "".join(labels) + "hstack=inputs=4[v]"
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(src),
            "-filter_complex", filt, "-map", "[v]",
            "-an", "-c:v", "libx264", "-crf", "26", "-preset", "fast",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(dest),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    payload = json.loads(SELECTION.read_text())
    if not payload.get("complete"):
        raise SystemExit(f"{SELECTION} is not a complete 8-per-task selection")

    manifest = {
        "method": payload["method"],
        "target_per_task": 8,
        "counts": {},
        "tasks": {},
    }
    for short, task in TASKS.items():
        items = payload["tasks"][task]
        if len(items) != 8:
            raise SystemExit(f"{task}: expected 8 picks, got {len(items)}")
        dest_dir = OUT / short
        dest_dir.mkdir(parents=True, exist_ok=True)
        for old in dest_dir.glob("*.mp4"):
            old.unlink()
        names = []
        for i, item in enumerate(items):
            src = PICKER / "videos" / task / f"{item['stamp']}_success.mp4"
            dest = dest_dir / f"{i:02d}.mp4"
            print(f"{short} {i:02d} {src.name}")
            encode(src, dest)
            names.append(item["remote"].split("/v5-2/", 1)[-1])
        manifest["counts"][short] = len(items)
        manifest["tasks"][short] = names
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("wrote", OUT, manifest["counts"])


if __name__ == "__main__":
    main()
