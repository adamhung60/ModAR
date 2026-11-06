(function () {
  var N_STEPS = 8;
  var ARROW_MS = 280;
  var STEP_MS = 140;
  var STREAMS = ["m1", "mk", "actions"];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexRgb(hex) {
    var h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  function flowT(step) {
    var u = 1 - step / (N_STEPS - 1);
    return Math.pow(u, 1.45);
  }

  function makeNoise(width, height, seed) {
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    var data = ctx.createImageData(width, height);
    var rand = mulberry32(seed);
    var i;
    for (i = 0; i < data.data.length; i += 4) {
      var n = Math.floor(128 + (rand() * 2 - 1) * 92 + (rand() * 2 - 1) * 36);
      if (n < 0) n = 0;
      if (n > 255) n = 255;
      data.data[i] = n;
      data.data[i + 1] = Math.floor(128 + (rand() * 2 - 1) * 88);
      data.data[i + 2] = Math.floor(128 + (rand() * 2 - 1) * 88);
      data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  function blendToken(token, t) {
    var viz = token.viz;
    var w = token.canvas.width;
    var h = token.canvas.height;
    var ctx = token.ctx;
    ctx.drawImage(token.noise, 0, 0);
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = token.fill;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    if (t <= 0) {
      viz.setAttribute("opacity", "0");
      viz.removeAttribute("href");
      viz.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
      return;
    }
    var url = token.canvas.toDataURL("image/png");
    viz.setAttribute("href", url);
    viz.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
    viz.setAttribute("opacity", "1");
  }

  function wait(ms, playId, card) {
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve(card.playId === playId);
      }, ms);
    });
  }

  function arrowLen(line) {
    if (!line.dataset.len) line.dataset.len = String(line.getTotalLength());
    return Number(line.dataset.len);
  }

  function setArrow(line, progress) {
    var len = arrowLen(line);
    var marker = line.dataset.marker;
    if (progress <= 0) {
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
      line.removeAttribute("marker-end");
      return;
    }
    if (progress >= 1) {
      line.style.strokeDasharray = "";
      line.style.strokeDashoffset = "";
      if (marker) line.setAttribute("marker-end", marker);
      return;
    }
    line.style.strokeDasharray = String(len);
    line.style.strokeDashoffset = String(len * (1 - progress));
    if (progress > 0.88 && marker) line.setAttribute("marker-end", marker);
    else line.removeAttribute("marker-end");
  }

  function animateArrow(line, playId, card) {
    return new Promise(function (resolve) {
      var start = performance.now();
      function frame(now) {
        if (card.playId !== playId) {
          resolve();
          return;
        }
        var p = Math.min(1, (now - start) / ARROW_MS);
        setArrow(line, p);
        if (p < 1) window.requestAnimationFrame(frame);
        else resolve();
      }
      window.requestAnimationFrame(frame);
    });
  }

  function animateDenoise(token, playId, card) {
    var step = 0;
    function next() {
      if (card.playId !== playId) return Promise.resolve();
      blendToken(token, flowT(step));
      step += 1;
      if (step >= N_STEPS) {
        blendToken(token, 0);
        return Promise.resolve();
      }
      return wait(STEP_MS, playId, card).then(next);
    }
    blendToken(token, 1);
    return wait(STEP_MS, playId, card).then(next);
  }

  function tokenApi(node, seed) {
    var fill = node.querySelector(".wam-token-fill");
    var viz = node.querySelector(".wam-token-viz");
    var canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 52;
    return {
      node: node,
      fill: fill.getAttribute("fill"),
      viz: viz,
      canvas: canvas,
      ctx: canvas.getContext("2d"),
      noise: makeNoise(96, 52, seed),
    };
  }

  function setupCard(form) {
    var key = form.dataset.form;
    var card = form.querySelector(".wam-form-card");
    var tokens = {};
    form.querySelectorAll(".wam-token").forEach(function (node, index) {
      tokens[node.dataset.token] = tokenApi(node, (key + node.dataset.token).length * 97 + index * 13);
    });
    var downs = Array.prototype.slice.call(form.querySelectorAll(".wam-arr-down"));
    var diags = Array.prototype.slice.call(form.querySelectorAll(".wam-arr-diag"));
    var futures = Array.prototype.slice.call(form.querySelectorAll(".wam-arr-future"));
    downs.concat(diags).forEach(function (line) {
      line.dataset.marker = line.getAttribute("marker-end") || "";
    });

    var state = {
      playId: 0,
      tokens: tokens,
      downs: downs,
      diags: diags,
      futures: futures,
      key: key,
      form: form,
    };

    function resetStatic() {
      STREAMS.forEach(function (name) {
        var token = tokens[name];
        if (!token) return;
        token.node.classList.remove("is-skipped");
        token.viz.setAttribute("opacity", "0");
      });
      downs.concat(diags).forEach(function (line) {
        setArrow(line, 1);
      });
      futures.forEach(function (line) {
        line.removeAttribute("stroke-dasharray");
        line.style.opacity = "";
      });
    }

    function startPlay() {
      state.playId += 1;
      var playId = state.playId;
      form.classList.add("is-playing");
      if (key === "modar") return playModar(state, playId);
      if (key === "unified") return playTogether(state, playId, STREAMS);
      if (key === "disjoint") return playDisjoint(state, playId);
      return playTogether(state, playId, ["actions"]);
    }

    function finish(playId) {
      if (state.playId !== playId) return;
      form.classList.remove("is-playing");
    }

    card.addEventListener("click", function () {
      startPlay();
    });
    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        startPlay();
      }
    });

    resetStatic();
    return { play: startPlay, finish: finish, state: state, resetStatic: resetStatic };
  }

  function playSequential(card, playId, streams) {
    card.downs.forEach(function (line) { setArrow(line, 0); });
    card.diags.forEach(function (line) { setArrow(line, 0); });
    streams.forEach(function (name) { blendToken(card.tokens[name], 1); });

    function step(index) {
      if (card.playId !== playId) return Promise.resolve();
      var name = streams[index];
      var down = card.downs[index];
      var prevDiag = index > 0 ? card.diags[index - 1] : null;
      var chain = Promise.resolve();
      if (prevDiag) chain = chain.then(function () { return animateArrow(prevDiag, playId, card); });
      chain = chain
        .then(function () { return animateArrow(down, playId, card); })
        .then(function () { return animateDenoise(card.tokens[name], playId, card); });
      if (index < streams.length - 1) {
        return chain.then(function () { return step(index + 1); });
      }
      return chain.then(function () {
        if (card.playId === playId) card.form.classList.remove("is-playing");
      });
    }
    return step(0);
  }

  function playModar(card, playId) {
    return playSequential(card, playId, STREAMS);
  }

  function playTogether(card, playId, names) {
    names.forEach(function (name) {
      blendToken(card.tokens[name], 1);
    });
    return Promise.all(names.map(function (name) {
      return animateDenoise(card.tokens[name], playId, card);
    })).then(function () {
      if (card.playId === playId) card.form.classList.remove("is-playing");
    });
  }

  function playDisjoint(card, playId) {
    ["m1", "mk"].forEach(function (name) {
      card.tokens[name].node.classList.add("is-skipped");
      card.tokens[name].viz.setAttribute("opacity", "0");
    });
    card.futures.forEach(function (line) {
      line.setAttribute("stroke-dasharray", "3 2.4");
      line.style.opacity = "0.55";
    });
    blendToken(card.tokens.actions, 1);
    return animateDenoise(card.tokens.actions, playId, card).then(function () {
      if (card.playId === playId) card.form.classList.remove("is-playing");
    });
  }

  function setupArch(reduceMotion) {
    var cardEl = document.getElementById("arch-card");
    if (!cardEl) return;

    var streams = ["tracks", "dino", "depth", "rgb", "actions"];
    var tokens = {};
    cardEl.querySelectorAll(".wam-token").forEach(function (node, index) {
      tokens[node.dataset.token] = tokenApi(node, 401 + index * 17);
    });
    var downs = Array.prototype.slice.call(cardEl.querySelectorAll(".wam-arr-down"));
    var diags = Array.prototype.slice.call(cardEl.querySelectorAll(".wam-arr-diag"));
    downs.concat(diags).forEach(function (line) {
      line.dataset.marker = line.getAttribute("marker-end") || "";
    });

    var state = {
      playId: 0,
      tokens: tokens,
      downs: downs,
      diags: diags,
      form: cardEl,
    };

    function resetStatic() {
      streams.forEach(function (name) {
        tokens[name].viz.setAttribute("opacity", "0");
      });
      downs.concat(diags).forEach(function (line) {
        setArrow(line, 1);
      });
    }

    function startPlay() {
      state.playId += 1;
      cardEl.classList.add("is-playing");
      return playSequential(state, state.playId, streams);
    }

    resetStatic();
    if (reduceMotion) return;

    cardEl.addEventListener("click", function () {
      startPlay();
    });
    cardEl.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        startPlay();
      }
    });

    var started = false;
    var observer = new IntersectionObserver(function (entries) {
      if (started) return;
      for (var i = 0; i < entries.length; i += 1) {
        if (entries[i].isIntersecting) {
          started = true;
          observer.disconnect();
          startPlay();
          return;
        }
      }
    }, { threshold: 0.35 });
    observer.observe(cardEl);
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.querySelector(".wam-forms");
  if (root && !reduceMotion) {
    var cards = Array.prototype.slice.call(root.querySelectorAll(".wam-form")).map(setupCard);
    var started = false;
    var observer = new IntersectionObserver(function (entries) {
      if (started) return;
      for (var i = 0; i < entries.length; i += 1) {
        if (entries[i].isIntersecting) {
          started = true;
          observer.disconnect();
          cards.forEach(function (card) { card.play(); });
          return;
        }
      }
    }, { threshold: 0.4 });
    observer.observe(root);
  }
  setupArch(reduceMotion);
})();
