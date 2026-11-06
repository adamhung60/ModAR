#!/usr/bin/env python3
"""Transcode success rollouts to H.264, extract posters, write manifest.json."""
from __future__ import annotations

import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC_ROOT = ROOT / "videos"
WEB_ROOT = ROOT / "web"
POSTER_ROOT = ROOT / "posters"
TASKS = ("stack_cups", "fold_towel", "place_in_drawer")
METHOD = "Cascaded_3-mod_human_robot_data"
REMOTE_ROOT = (
    "/home/adam-local/Desktop/modality_forcing_wam/rollouts/v5-2"
)
NEW_PREFIX = "20260910"
WORKERS = 6


def probe(path: Path) -> dict:
    raw = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,codec_name,avg_frame_rate",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        text=True,
    )
    payload = json.loads(raw)
    stream = payload["streams"][0]
    duration = float(payload["format"]["duration"])
    rate = stream.get("avg_frame_rate") or "0/1"
    num, den = rate.split("/")
    fps = float(num) / float(den) if float(den) else 0.0
    return {
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "codec": stream["codec_name"],
        "duration": duration,
        "fps": fps,
    }


def transcode(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "23",
            "-preset",
            "veryfast",
            "-movflags",
            "+faststart",
            str(dst),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def poster(src: Path, dst: Path, duration: float) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    midpoint = max(0.0, duration * 0.45)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{midpoint:.3f}",
            "-i",
            str(src),
            "-frames:v",
            "1",
            "-q:v",
            "4",
            str(dst),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def process_one(task: str, src: Path) -> dict:
    stamp = src.name.replace("_success.mp4", "")
    web = WEB_ROOT / task / src.name
    thumb = POSTER_ROOT / task / f"{stamp}.jpg"
    info = probe(src)
    if not web.exists() or web.stat().st_mtime < src.stat().st_mtime:
        transcode(src, web)
    if not thumb.exists() or thumb.stat().st_mtime < src.stat().st_mtime:
        poster(web if web.exists() else src, thumb, info["duration"])
    return {
        "id": f"{task}/{stamp}",
        "task": task,
        "stamp": stamp,
        "label": f"{stamp[0:4]}-{stamp[4:6]}-{stamp[6:8]} {stamp[9:11]}:{stamp[11:13]}:{stamp[13:15]}",
        "new": stamp.startswith(NEW_PREFIX),
        "duration": round(info["duration"], 2),
        "width": info["width"],
        "height": info["height"],
        "src": f"web/{task}/{src.name}",
        "poster": f"posters/{task}/{stamp}.jpg",
        "remote": f"{REMOTE_ROOT}/{task}/{METHOD}/{src.name}",
    }


def main() -> None:
    jobs: list[tuple[str, Path]] = []
    for task in TASKS:
        task_dir = SRC_ROOT / task
        jobs.extend((task, path) for path in sorted(task_dir.glob("*_success.mp4")))
    print(f"preparing {len(jobs)} success videos with {WORKERS} workers")
    items: list[dict] = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(process_one, task, path) for task, path in jobs]
        for i, future in enumerate(as_completed(futures), start=1):
            item = future.result()
            items.append(item)
            print(f"[{i}/{len(jobs)}] {item['id']}")
    items.sort(key=lambda row: (TASKS.index(row["task"]), row["stamp"]))
    manifest = {
        "method": METHOD,
        "target_per_task": 8,
        "tasks": [
            {
                "id": task,
                "label": {
                    "stack_cups": "Stack cups",
                    "fold_towel": "Fold towel",
                    "place_in_drawer": "Place in drawer",
                }[task],
                "count": sum(1 for row in items if row["task"] == task),
            }
            for task in TASKS
        ],
        "videos": items,
    }
    out = ROOT / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {out} ({len(items)} videos)")


if __name__ == "__main__":
    main()
