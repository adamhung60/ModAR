# ModAR

Project page for **ModAR: Modality-Autoregressive World-Action Models**.

Live site: https://adamhung60.github.io/ModAR/

To preview locally:

```bash
python3 -m http.server 8001
```

Open http://127.0.0.1:8001/

To pick 8 real-world rollout favorites per task:

```bash
python3 tools/real_rollout_picker/serve.py
```

Then encode them for the site with `python3 scripts/prepare_more_rollouts.py`.


overleaf paper is available locally at
/Users/adamhung/Overleaf/Hung-ModAR-ICRA27

code project is on gearhead (ssh gearhead) as Desktop/modality_forcing_wam/