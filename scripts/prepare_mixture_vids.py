"""Refresh the training-data clips from gearhead.

On gearhead:
  /home/adam-local/miniconda3/envs/ss_3d/bin/python scripts/data/export_mixture_clips.py

Then on this machine:
  python3 scripts/prepare_mixture_vids.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "mixture"
REMOTE = "gearhead:/tmp/modar_mixture_clips/"


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    subprocess.run(["rsync", "-az", REMOTE, str(OUT) + "/"], check=True)
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    print("wrote", OUT, "n_clips", manifest.get("n_clips"))


if __name__ == "__main__":
    main()
