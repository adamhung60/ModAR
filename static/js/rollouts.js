(function () {
  var COUNTS = { stack: 8, fold: 8, drawer: 8 };

  var root = document.getElementById("more-rollouts");
  if (!root) return;

  var body = root.querySelector(".more-rollouts-body");
  var master = root.querySelector(".more-rollouts-video");
  var canvases = Array.prototype.slice.call(root.querySelectorAll(".more-rollouts-frame"));
  var taskButtons = Array.prototype.slice.call(root.querySelectorAll("[data-rollout-task]"));
  var indexEl = root.querySelector("[data-rollout-index]");
  var totalEl = root.querySelector("[data-rollout-total]");
  var toggleBtn = root.querySelector(".more-rollouts-toggle");
  var scrubber = root.querySelector(".more-rollouts-scrubber");
  var fsBtn = root.querySelector(".more-rollouts-fs");

  var taskId = "stack";
  var index = 0;
  var loaded = "";
  var objectUrl = "";
  var loadGen = 0;
  var seeking = false;
  var resumeAfterSeek = false;
  var pointerSeeking = false;
  var keySeekTimer = 0;
  var paintOn = false;

  function nFor(task) {
    return COUNTS[task] || 1;
  }

  function srcFor(task, i) {
    return "./static/rollouts/" + task + "/" + String(i).padStart(2, "0") + ".mp4";
  }

  function setIndexLabel() {
    if (indexEl) indexEl.textContent = String(index + 1);
    if (totalEl) totalEl.textContent = String(nFor(taskId));
  }

  function setTaskButtons() {
    taskButtons.forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.rolloutTask === taskId);
    });
  }

  function setToggle(paused) {
    if (!toggleBtn) return;
    toggleBtn.classList.toggle("is-paused", paused);
    toggleBtn.setAttribute("aria-label", paused ? "Play" : "Pause");
  }

  function paint() {
    if (!master || !master.videoWidth) return;
    var vw = master.videoWidth;
    var vh = master.videoHeight;
    var cw = vw / 4;
    canvases.forEach(function (canvas, i) {
      if (canvas.width !== cw || canvas.height !== vh) {
        canvas.width = cw;
        canvas.height = vh;
      }
      var ctx = canvas.getContext("2d");
      ctx.drawImage(master, i * cw, 0, cw, vh, 0, 0, cw, vh);
    });
  }

  function startPaint() {
    if (paintOn || !master) return;
    paintOn = true;
    var tick = function () {
      paint();
      if (!master.paused && !master.ended && root.open) {
        if (master.requestVideoFrameCallback) {
          master.requestVideoFrameCallback(tick);
        } else {
          window.requestAnimationFrame(tick);
        }
      } else {
        paintOn = false;
        paint();
      }
    };
    if (master.requestVideoFrameCallback) master.requestVideoFrameCallback(tick);
    else window.requestAnimationFrame(tick);
  }

  function playClip() {
    if (!master) return;
    master.play();
    setToggle(false);
    startPaint();
  }

  function pauseClip() {
    if (!master) return;
    master.pause();
    setToggle(true);
    paint();
  }

  function updateScrubber() {
    if (!scrubber || !master || seeking || !master.duration) return;
    var max = Number(scrubber.max);
    scrubber.value = String(Math.round((master.currentTime / master.duration) * max));
    var pct = (Number(scrubber.value) / max) * 100;
    scrubber.style.background =
      "linear-gradient(90deg, #1a1a1a " + pct + "%, #d8d8d8 " + pct + "%)";
  }

  function seekTo(ratio) {
    if (!master || !master.duration) return;
    master.currentTime = Math.max(0, Math.min(1, ratio)) * master.duration;
    paint();
    if (scrubber) {
      var pct = ratio * 100;
      scrubber.style.background =
        "linear-gradient(90deg, #1a1a1a " + pct + "%, #d8d8d8 " + pct + "%)";
    }
  }

  function show(task, i) {
    taskId = task;
    var n = nFor(taskId);
    index = ((i % n) + n) % n;
    var src = srcFor(taskId, index);
    if (src !== loaded) {
      loaded = src;
      var gen = ++loadGen;
      fetch(src).then(function (res) { return res.blob(); }).then(function (blob) {
        if (gen !== loadGen) return;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob);
        master.src = objectUrl;
        master.currentTime = 0;
        if (root.open) playClip();
      });
    } else if (root.open) {
      playClip();
    }
    setTaskButtons();
    setIndexLabel();
    var peek = document.createElement("video");
    peek.preload = "auto";
    peek.muted = true;
    peek.src = srcFor(taskId, (index + 1) % n);
  }

  function isFullscreen() {
    return document.fullscreenElement === body || document.webkitFullscreenElement === body;
  }

  function setFullscreenUi() {
    if (fsBtn) {
      var on = isFullscreen();
      fsBtn.classList.toggle("is-full", on);
      fsBtn.setAttribute("aria-label", on ? "Exit fullscreen" : "Enter fullscreen");
    }
  }

  function toggleFullscreen() {
    if (!body) return;
    if (isFullscreen()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }
    if (body.requestFullscreen) body.requestFullscreen();
    else if (body.webkitRequestFullscreen) body.webkitRequestFullscreen();
  }

  root.addEventListener("toggle", function () {
    if (root.open) {
      if (!loaded) show(taskId, index);
      else playClip();
    } else {
      pauseClip();
      if (isFullscreen()) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    }
  });

  root.querySelectorAll(".more-rollouts-nav").forEach(function (button) {
    button.addEventListener("click", function () {
      show(taskId, index + Number(button.dataset.dir));
    });
  });

  taskButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      show(button.dataset.rolloutTask, 0);
    });
  });

  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      if (!master || master.paused) playClip();
      else pauseClip();
    });
  }

  if (scrubber) {
    var beginSeek = function () {
      if (seeking) return;
      seeking = true;
      resumeAfterSeek = master && !master.paused;
      pauseClip();
    };
    var endSeek = function () {
      window.clearTimeout(keySeekTimer);
      if (!seeking) return;
      seeking = false;
      pointerSeeking = false;
      paint();
      if (resumeAfterSeek) playClip();
    };
    scrubber.addEventListener("pointerdown", function (event) {
      pointerSeeking = true;
      if (scrubber.setPointerCapture) scrubber.setPointerCapture(event.pointerId);
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

  if (fsBtn) fsBtn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", setFullscreenUi);
  document.addEventListener("webkitfullscreenchange", setFullscreenUi);

  if (master) {
    master.addEventListener("timeupdate", updateScrubber);
    master.addEventListener("seeked", paint);
    master.addEventListener("loadeddata", function () {
      paint();
      updateScrubber();
      if (root.open && !master.paused) startPaint();
    });
    master.addEventListener("play", function () {
      setToggle(false);
      startPaint();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (!root.open) return;
    if (event.target === scrubber) return;
    if (event.key === "ArrowLeft") show(taskId, index - 1);
    if (event.key === "ArrowRight") show(taskId, index + 1);
    if (event.key === "f" || event.key === "F") toggleFullscreen();
  });

  fetch("./static/rollouts/manifest.json")
    .then(function (res) { return res.json(); })
    .then(function (manifest) {
      if (manifest && manifest.counts) COUNTS = manifest.counts;
      setIndexLabel();
    });
})();
