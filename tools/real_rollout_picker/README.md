# Real-world rollout picker

Local page for choosing 8 favorite successful rollouts per real-world task
for the ModAR site's **More real-world rollouts** section.

```bash
python3 tools/real_rollout_picker/serve.py
```

Then open http://127.0.0.1:8777/

After saving a complete selection, encode site clips with:

```bash
python3 scripts/prepare_more_rollouts.py
```

To refresh source videos from gearhead, rsync `*_success.mp4` into
`videos/<task>/`, then:

```bash
python3 tools/real_rollout_picker/prepare_videos.py
```
