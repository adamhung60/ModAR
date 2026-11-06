(function () {
  var N_CLIPS = 10;

  var root = document.getElementById("data-mix");
  if (!root) return;

  var taskButtons = Array.prototype.slice.call(root.querySelectorAll("[data-mix-task]"));
  var cards = Array.prototype.slice.call(root.querySelectorAll("[data-mix-source]"));

  var taskId = "stack";
  var clipIndex = { robot: 0, id: 0, ood: 0 };

  function clipSrc(source, task, i) {
    return (
      "./static/mixture/" + source + "/" + task + "/" +
      String(i).padStart(2, "0") + ".mp4"
    );
  }

  function cardFor(source) {
    return cards.find(function (card) {
      return card.dataset.mixSource === source;
    });
  }

  function playClip(source, i) {
    var card = cardFor(source);
    var video = card.querySelector("video");
    var indexEl = card.querySelector("[data-mix-index]");
    clipIndex[source] = i;
    video.src = clipSrc(source, taskId, i);
    if (indexEl) indexEl.textContent = String(i + 1);
    var play = video.play();
    if (play) play.then(function () {}, function () {});
    var peek = document.createElement("video");
    peek.muted = true;
    peek.preload = "auto";
    peek.src = clipSrc(source, taskId, (i + 1) % N_CLIPS);
  }

  function nextClip(source) {
    playClip(source, (clipIndex[source] + 1) % N_CLIPS);
  }

  function setTask(next) {
    taskId = next;
    taskButtons.forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.mixTask === taskId);
    });
    ["robot", "id", "ood"].forEach(function (source) {
      playClip(source, 0);
    });
  }

  taskButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setTask(button.dataset.mixTask);
    });
  });

  cards.forEach(function (card) {
    var source = card.dataset.mixSource;
    var video = card.querySelector("video");
    video.addEventListener("ended", function () {
      nextClip(source);
    });
  });

  setTask("stack");
})();
