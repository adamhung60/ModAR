(function () {
  var REAL_TASKS = ["stack", "fold", "drawer"];
  var SIM_TASKS = ["bowls", "bread", "switch", "pick", "dump", "put"];
  var TASKS = REAL_TASKS.concat(SIM_TASKS);
  var REAL_MODS = ["tracks", "dino", "depth", "rgb"];
  var SIM_MODS = ["tracks", "dino", "depth", "rgb"];
  var COL_TITLE = {
    tracks: "Predicted tracks",
    dino: "Predicted DINO",
    depth: "Predicted depth",
    rgb: "Predicted actions",
  };
  var MOD_LABEL = {
    tracks: "tracks",
    dino: "DINO",
    depth: "depth",
    rgb: "actions",
  };
  var N_FRAMES = {
    stack: 16, fold: 32, drawer: 12,
    dump: 12, pick: 12, bread: 16, put: 60, bowls: 42, switch: 8,
  };
  var PAIR = 2;
  var FRAME_MS = 320;
  var TRACK_FRAME_MS = 480;
  var MOD_GAP_MS = 220;
  var CHUNK_GAP_MS = 420;

  var root = document.getElementById("modar-hero");
  if (!root) return;

  var taskButtons = Array.prototype.slice.call(root.querySelectorAll(".modar-hero-task"));
  var cols = Array.prototype.slice.call(root.querySelectorAll(".modar-hero-col"));
  var stepEl = root.querySelector(".modar-hero-step");
  var frames = Array.prototype.slice.call(root.querySelectorAll(".modar-hero-frame"));
  var toggleBtn = root.querySelector(".modar-hero-toggle");
  var scrubber = root.querySelector(".modar-hero-scrubber");
  var fsBtn = root.querySelector(".more-rollouts-fs");

  var taskId = "stack";
  var shown = emptyShown();
  var timeline = { events: [], duration: 1 };
  var timeMs = 0;
  var playing = true;
  var seeking = false;
  var resumeAfterSeek = false;
  var rafId = 0;
  var lastStamp = 0;

  function isSim(task) {
    return SIM_TASKS.indexOf(task) >= 0;
  }

  function modsFor(task) {
    return isSim(task) ? SIM_MODS : REAL_MODS;
  }

  function emptyShown() {
    return { tracks: 0, dino: 0, depth: 0, rgb: 0 };
  }

  function frameSrc(task, mod, i) {
    var n = String(i).padStart(2, "0");
    return "./static/hero/frames/" + task + "/" + mod + "/" + n + ".jpg";
  }

  function preload() {
    TASKS.forEach(function (task) {
      modsFor(task).forEach(function (mod) {
        for (var i = 0; i < N_FRAMES[task]; i++) {
          var img = new Image();
          img.src = frameSrc(task, mod, i);
        }
      });
    });
  }

  function imgFor(mod) {
    return frames.find(function (el) {
      return el.dataset.task === taskId && el.dataset.mod === mod;
    });
  }

  function setLayout() {
    var sim = isSim(taskId);
    var mods = modsFor(taskId);
    root.classList.toggle("is-sim", sim);
    root.classList.toggle("is-real", !sim);
    cols.forEach(function (col) {
      var mod = col.dataset.mod;
      var idx = mods.indexOf(mod);
      col.classList.toggle("is-hidden-mod", idx < 0);
      var title = col.querySelector(".modar-hero-col-title");
      if (title && idx >= 0) {
        title.textContent = idx + 1 + "\u2002" + COL_TITLE[mod];
      }
    });
  }

  function setTaskVisible() {
    setLayout();
    frames.forEach(function (el) {
      el.classList.toggle("is-visible", el.dataset.task === taskId);
    });
    taskButtons.forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.task === taskId);
    });
  }

  function setPhase(modId) {
    var mods = modsFor(taskId);
    cols.forEach(function (col) {
      var active = col.dataset.mod === modId;
      col.classList.toggle("is-active", active);
      col.classList.toggle("is-done", mods.indexOf(col.dataset.mod) < mods.indexOf(modId));
    });
    if (!stepEl) return;
    if (modId === "rgb") {
      stepEl.innerHTML = "Generating <b>actions</b>";
    } else {
      stepEl.innerHTML = "Generating future <b>" + MOD_LABEL[modId] + "</b> prediction";
    }
  }

  function show(mod, i) {
    shown[mod] = i;
    var el = imgFor(mod);
    if (el) el.src = frameSrc(taskId, mod, i);
  }

  function buildTimeline(task) {
    var events = [];
    var t = 0;
    var nFrames = N_FRAMES[task];
    var mods = modsFor(task);
    events.push({ t: 0, type: "reset" });
    for (var c = 0; c < nFrames; c += PAIR) {
      var start = c;
      var end = Math.min(c + PAIR - 1, nFrames - 1);
      mods.forEach(function (mod, mi) {
        events.push({ t: t, type: "phase", mod: mod });
        for (var i = start; i <= end; i++) {
          events.push({ t: t, type: "show", mod: mod, frame: i });
          t += mod === "tracks" ? TRACK_FRAME_MS : FRAME_MS;
        }
        if (mi < mods.length - 1) t += MOD_GAP_MS;
      });
      if (end < nFrames - 1) t += CHUNK_GAP_MS;
    }
    return { events: events, duration: Math.max(t, 1) };
  }

  function applyTime(ms) {
    var mods = modsFor(taskId);
    var phase = "tracks";
    var next = emptyShown();
    timeline.events.forEach(function (event) {
      if (event.t > ms) return;
      if (event.type === "reset") {
        phase = "tracks";
        next = emptyShown();
      } else if (event.type === "phase") {
        phase = event.mod;
      } else if (event.type === "show") {
        next[event.mod] = event.frame;
      }
    });
    setPhase(phase);
    mods.forEach(function (mod) {
      if (shown[mod] !== next[mod]) show(mod, next[mod]);
    });
    if (scrubber) {
      var max = Number(scrubber.max);
      if (!seeking) {
        scrubber.value = String(Math.round((ms / timeline.duration) * max));
      }
      var pct = (Number(scrubber.value) / max) * 100;
      scrubber.style.background =
        "linear-gradient(90deg, #1a1a1a " + pct + "%, #d8d8d8 " + pct + "%)";
    }
  }

  function setPlaying(next) {
    playing = next;
    if (toggleBtn) {
      toggleBtn.classList.toggle("is-paused", !playing);
      toggleBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
    if (playing) {
      lastStamp = 0;
      if (!rafId) rafId = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    rafId = 0;
    if (!playing || seeking) return;
    if (!lastStamp) lastStamp = now;
    timeMs = Math.min(timeMs + (now - lastStamp), timeline.duration);
    lastStamp = now;
    applyTime(timeMs);
    if (timeMs >= timeline.duration) {
      var group = REAL_TASKS.indexOf(taskId) >= 0 ? REAL_TASKS : SIM_TASKS;
      var idx = group.indexOf(taskId);
      startTask(group[(idx + 1) % group.length]);
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function startTask(nextTask) {
    taskId = nextTask;
    timeline = buildTimeline(taskId);
    timeMs = 0;
    lastStamp = 0;
    shown = { tracks: -1, dino: -1, depth: -1, rgb: -1 };
    setTaskVisible();
    applyTime(0);
    if (playing && !rafId) rafId = requestAnimationFrame(tick);
  }

  function seekTo(ratio) {
    timeMs = Math.max(0, Math.min(1, ratio)) * timeline.duration;
    lastStamp = 0;
    applyTime(timeMs);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      if (!playing && timeMs >= timeline.duration) timeMs = 0;
      setPlaying(!playing);
    });
  }

  if (scrubber) {
    var keySeekTimer = 0;
    var pointerSeeking = false;
    var beginSeek = function () {
      if (seeking) return;
      seeking = true;
      resumeAfterSeek = playing;
      setPlaying(false);
    };
    var endSeek = function () {
      window.clearTimeout(keySeekTimer);
      if (!seeking) return;
      seeking = false;
      pointerSeeking = false;
      if (resumeAfterSeek && timeMs < timeline.duration) setPlaying(true);
    };
    scrubber.addEventListener("pointerdown", function (event) {
      pointerSeeking = true;
      if (scrubber.setPointerCapture) {
        scrubber.setPointerCapture(event.pointerId);
      }
      beginSeek();
    });
    scrubber.addEventListener("pointerup", endSeek);
    scrubber.addEventListener("pointercancel", endSeek);
    scrubber.addEventListener("input", function () {
      if (!seeking) beginSeek();
      seekTo(Number(scrubber.value) / Number(scrubber.max));
      if (!pointerSeeking) {
        window.clearTimeout(keySeekTimer);
        keySeekTimer = window.setTimeout(endSeek, 280);
      }
    });
  }

  function isFullscreen() {
    return document.fullscreenElement === root || document.webkitFullscreenElement === root;
  }

  function setFullscreenUi() {
    if (!fsBtn) return;
    var on = isFullscreen();
    fsBtn.classList.toggle("is-full", on);
    fsBtn.setAttribute("aria-label", on ? "Exit fullscreen" : "Enter fullscreen");
  }

  function toggleFullscreen() {
    if (isFullscreen()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }
    if (root.requestFullscreen) root.requestFullscreen();
    else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
  }

  if (fsBtn) fsBtn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", setFullscreenUi);
  document.addEventListener("webkitfullscreenchange", setFullscreenUi);

  taskButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      startTask(button.dataset.task);
    });
  });

  preload();
  startTask("stack");
})();
