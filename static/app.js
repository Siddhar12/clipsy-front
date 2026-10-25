// The whole front end: two screens (all videos, one video) driven by the URL
// hash, kept fresh by polling the JSON API while something is in progress.

const $ = (id) => document.getElementById(id);

// Build a DOM node. Text always goes in as text, never as HTML, because
// titles come from file names and from the AI.
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child != null));
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Something went wrong (${response.status}).`);
  return body;
}

function clock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const tail = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${tail}` : `${m}:${tail}`;
}

const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function flash(message) {
  $("flash").textContent = message || "";
  $("flash").hidden = !message;
}

const active = (job) => job && (job.status === "queued" || job.status === "running");

// Keep a list of nodes in step with a list of items, rebuilding a node only
// when its item changed. Polling would otherwise recreate every <video> and
// checkbox each second, restarting playback and dropping focus.
function sync(container, items, signature, build) {
  const old = new Map([...container.children].map((node) => [node.dataset.key, node]));
  const fresh = items.map((item) => {
    const mark = signature(item);
    let node = old.get(item.id);
    if (node && node.dataset.mark === mark) {
      old.delete(item.id);                   // unchanged: keep this very node
    } else {
      node = build(item);
      node.dataset.key = item.id;
      node.dataset.mark = mark;
    }
    return node;
  });
  old.forEach((node) => node.remove());      // replaced or no longer listed
  fresh.forEach((node, index) => {
    if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
  });
}

function fileSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}

// What the drop zone says before a file is chosen, as written in the page.
// On a phone nothing is dropped: the box is tapped.
if (matchMedia("(pointer: coarse)").matches) $("drop-title").textContent = "Tap to choose a video";
const DROP_TITLE = $("drop-title").textContent;
const DROP_HINT = $("drop-hint").textContent;

let config = null;
let timer = null;         // the pending poll, if any
let episodeId = null;     // the video on screen, or null on the home screen
let chosenFile = null;    // the video picked for upload
const selected = new Set();   // moment ids ticked for rendering

function pollIn(ms, task) {
  clearTimeout(timer);
  timer = setTimeout(task, ms);
}

// ---------------- home ----------------

function episodeRow(episode) {
  const job = episode.analysis;
  let badge;
  if (active(job)) badge = el("span", { className: "badge", textContent: `Analysing ${job.percent}%` });
  else if (job && job.status === "failed") badge = el("span", { className: "badge bad", textContent: "Failed" });
  else badge = el("span", { className: "badge good", textContent: count(episode.moment_count, "moment") });
  return el("a", { className: "item", href: `#/video/${episode.id}` },
    el("span"),
    el("div", {},
      el("div", { className: "name", textContent: episode.title }),
      el("div", { className: "sub", textContent: [
        clock(episode.duration), count(episode.clip_count, "clip"),
        episode.golden ? `${episode.golden} set, ${episode.marked_count} marked` : "",
      ].filter(Boolean).join(" · ") })),
    el("div", { className: "side" }, badge));
}

async function showHome() {
  const episodes = await api("/api/episodes");
  if (episodeId !== null) return;            // navigated away while loading
  $("no-episodes").hidden = episodes.length > 0;
  sync($("episodes"), episodes, (e) => JSON.stringify(e), episodeRow);
  if (episodes.some((e) => active(e.analysis))) pollIn(3000, showHome);
}

// Read the length in the browser first, so a file that is far too short or
// too long is turned away before minutes of uploading, not after. A file the
// browser can't open is left for the server to judge.
function videoLength(file) {
  return new Promise((resolve) => {
    const probe = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (seconds) => { URL.revokeObjectURL(url); resolve(seconds); };
    probe.preload = "metadata";
    probe.onloadedmetadata = () => done(Number.isFinite(probe.duration) ? probe.duration : null);
    probe.onerror = () => done(null);
    setTimeout(() => done(null), 5000);
    probe.src = url;
  });
}

async function chooseFile(file) {
  flash("");
  let seconds = null;
  if (file) {
    $("drop").classList.add("reading");
    seconds = await videoLength(file);
    $("drop").classList.remove("reading");
    if (seconds !== null && seconds < config.min_source_seconds) {
      flash(`This video is ${count(Math.round(seconds), "second")} long. Clipsy needs at least ` +
            `${config.min_source_seconds} seconds to find a moment worth clipping.`);
      file = null;
    } else if (seconds !== null && seconds > config.max_source_seconds) {
      flash(`Videos can be at most ${config.max_source_seconds / 3600} hours long.`);
      file = null;
    }
  }
  chosenFile = file || null;
  $("drop-title").textContent = chosenFile ? chosenFile.name : DROP_TITLE;
  $("drop-hint").textContent = chosenFile
    ? [seconds !== null ? clock(seconds) : "", fileSize(chosenFile.size)].filter(Boolean).join(" · ")
    : DROP_HINT;
  $("drop").classList.toggle("chosen", Boolean(chosenFile));
  // Get started is always live: with no video yet it opens the file picker.
  // Picking one replays its pop into colour (home.css, #upload-button.go).
  const go = $("upload-button");
  go.disabled = Boolean(config.problem);
  go.classList.remove("go");
  if (chosenFile) {
    void go.offsetWidth;
    go.classList.add("go");
  }
  // home.js shows the chosen video's own frames in the drop window.
  document.dispatchEvent(new CustomEvent("clipsy:file", { detail: { file: chosenFile, seconds } }));
}

function upload(event) {
  event.preventDefault();
  const file = chosenFile;
  if (!file) {
    $("file").click();                // nothing picked yet: Get started picks one
    return;
  }
  flash("");
  const form = new FormData();
  form.append("file", file);

  // XMLHttpRequest rather than fetch: it reports upload progress.
  const request = new XMLHttpRequest();
  const bar = $("upload-progress");
  const finish = (message) => {
    bar.hidden = true;
    $("upload-button").disabled = false;
    if (message) flash(message);
  };
  request.upload.onprogress = (e) => { if (e.lengthComputable) bar.value = (e.loaded / e.total) * 100; };
  request.onerror = () => finish("The upload was interrupted. Check your connection and try again.");
  request.onload = () => {
    let body = {};
    try { body = JSON.parse(request.responseText); } catch (_) { /* not JSON */ }
    if (request.status !== 201) return finish(body.error || "The upload failed.");
    finish();
    chooseFile(null);
    location.hash = `#/video/${body.id}`;
  };
  bar.value = 0;
  bar.hidden = false;
  $("upload-button").disabled = true;
  request.open("POST", "/api/episodes");
  request.send(form);
}

// ---------------- one video ----------------

function momentRow(moment) {
  const box = el("input", { type: "checkbox", checked: selected.has(moment.id) });
  box.onchange = () => {
    if (box.checked) selected.add(moment.id); else selected.delete(moment.id);
    updateRenderButton();
  };
  // A stitched moment plays its parts in order; its length is theirs added up,
  // not the stretch of video between them.
  const parts = moment.parts || [[moment.start, moment.end]];
  const length = Math.round(partsLength(parts));
  return el("label", { className: "item" },
    box,
    el("div", {},
      el("div", { className: "name", textContent: moment.title }),
      parts.length > 1 ? stitchTag(parts.length) : null,
      el("div", { className: "sub", textContent: moment.reason || moment.excerpt })),
    el("div", { className: "side" },
      el("div", { className: "score", textContent: `${moment.score}/10` }),
      el("div", { textContent: `${parts.map(([start]) => clock(start)).join(" + ")} · ${length}s` }),
      el("div", { textContent: moment.category })));
}

// Shown on every stitched moment and clip, so the creator always knows.
const stitchTag = (count) => el("span", { className: "stitch-tag", textContent: `Stitched · ${count} parts` });

function clipCard(clip) {
  const job = clip.render;
  let screen;
  if (clip.url) {
    screen = el("video", { src: clip.url, controls: true, preload: "metadata", playsInline: true });
  } else if (job && job.status === "failed") {
    screen = el("div", { className: "frame", textContent: `Could not render: ${job.error || "unknown error"}` });
  } else {
    const waiting = !job || job.status === "queued";
    screen = el("div", { className: "frame", textContent: waiting ? "Waiting its turn…" : `Rendering ${job.percent}%` });
  }
  const remove = el("button", { type: "button", className: "quiet", textContent: "Delete" });
  remove.onclick = async () => {
    try { await api(`/api/clips/${clip.id}`, { method: "DELETE" }); await showEpisode(); }
    catch (error) { flash(error.message); }
  };
  return el("div", { className: "clip" },
    screen,
    el("div", { className: "name", textContent: clip.title }),
    clip.parts && clip.parts.length > 1 ? stitchTag(clip.parts.length) : null,
    el("div", { className: "actions" },
      clip.url ? el("a", { href: `${clip.url}?download=1`, textContent: "Download" }) : el("span"),
      remove));
}

function updateRenderButton() {
  $("render-button").disabled = selected.size === 0;
  $("render-button").textContent = selected.size > 1 ? `Make ${selected.size} clips` : "Make clip";
  showLooks();
}

// ---------------- how a clip will look ----------------
// Every framing and caption choice is shown on this very video, drawn by the
// server with the code that renders clips (/look), so what you pick is what
// you get. The pictures come from the first ticked moment, or the first
// moment when none is ticked.
//
// The caption setup (style, colours, size, height, words, letters, emoji) is
// kept in this browser and sent with every clip made. The Caption setup
// panel previews it big: a still first, then a few seconds moving.

const SETUP_KEY = "clipsy-caption-setup";
const SWATCHES = ["#FFFFFF", "#FFE600", "#FFD60A", "#FF8A00", "#FF2E63", "#A77BFF", "#4D7CFF", "#22D3EE", "#43FF9A", "#111111"];
const look = { framing: "fit", episode: null, framingSet: false, drawn: "", setup: null };
const looks = new Map();          // query -> promise of { url, framing }
const looksReady = new Map();     // query -> { url, framing }, once drawn
const studio = { timer: null, want: "" };

const styleOf = (id) => config.caption_styles.find((s) => s.id === id) || config.caption_styles[0];

function defaultSetup(id, keep = {}) {
  const style = styleOf(id);
  return { style: style.id, colors: { ...style.colors }, size: keep.size || 100,
           position: style.position, words: style.words, case: style.case, emoji: style.emoji };
}

function loadSetup() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETUP_KEY) || "null");
    if (saved && styleOf(saved.style).id === saved.style) {
      const base = defaultSetup(saved.style);
      return { ...base, ...saved, colors: { ...base.colors, ...(saved.colors || {}) } };
    }
  } catch { /* nothing saved, or storage blocked */ }
  return defaultSetup(config.default_caption);
}

function saveSetup() {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(look.setup)); } catch { /* still used this visit */ }
}

// The same setup always spells the same query, so its picture is drawn once.
function setupText(setup) {
  const colors = Object.fromEntries(Object.keys(setup.colors).sort().map((k) => [k, setup.colors[k].toUpperCase()]));
  return JSON.stringify({ style: setup.style, colors, size: setup.size, position: setup.position,
                          words: setup.words, case: setup.case, emoji: setup.emoji });
}

function lookMoment() {
  const moments = look.episode ? look.episode.moments : [];
  return moments.find((m) => selected.has(m.id)) || moments[0] || null;
}

function lookStart() {
  const moment = lookMoment();
  return moment ? (moment.parts || [[moment.start, moment.end]])[0][0] : null;
}

function lookQuery(at, { setup = look.setup, ...options } = {}) {
  return new URLSearchParams({
    t: at.toFixed(1), framing: look.framing, setup: setupText(setup),
    captions: $("opt-captions").checked ? "1" : "0", view: "frame", ...options,
  }).toString();
}

function fetchLook(query) {
  const key = `${episodeId}/${query}`;
  if (!looks.has(key)) {
    looks.set(key, fetch(`/api/episodes/${episodeId}/look?${query}`).then(async (response) => {
      if (!response.ok) throw new Error("no preview");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (blob.type.startsWith("image/")) {
        const image = new Image();
        image.src = url;
        await image.decode();             // swapped in whole, never half-drawn
      }
      const result = { url, framing: response.headers.get("X-Framing") };
      looksReady.set(key, result);
      return result;
    }).catch((error) => { looks.delete(key); throw error; }));
  }
  return looks.get(key);
}

async function drawLook(img, query) {
  const shot = img.parentElement;
  const known = looksReady.get(`${episodeId}/${query}`);
  img.dataset.want = query;
  if (known) {
    img.src = known.url;
    shot.classList.remove("loading", "failed");
    shot.classList.add("ready");
    return known;
  }
  shot.classList.remove("failed");
  shot.classList.add("loading");
  try {
    const result = await fetchLook(query);
    if (img.dataset.want !== query) return null;     // a newer choice won
    img.src = result.url;
    shot.classList.remove("loading");
    shot.classList.add("ready");
    return result;
  } catch {
    if (img.dataset.want === query) shot.classList.replace("loading", "failed");
    return null;
  }
}

function showLooks(force = false) {
  const start = lookStart();
  if (start === null || !episodeId) return;
  const at = start + 1;
  const captions = $("opt-captions").checked;
  const drawn = [episodeId, at, look.framing, setupText(look.setup), captions].join("|");
  if (drawn === look.drawn && !force) return;        // polling redraws nothing
  look.drawn = drawn;

  $("look-from").textContent = `Previews at ${clock(start)}`;
  for (const tile of $("framings").children) {
    const value = tile.dataset.value;
    tile.setAttribute("aria-checked", String(value === look.framing));
    drawLook(tile.querySelector("img"), lookQuery(at, { framing: value })).then((result) => {
      // Follow faces holds the centre when nobody's face is in the shot; say so.
      if (value === "smart" && result) {
        $("look-note").hidden = result.framing !== "center";
        $("look-note").textContent = `No face in the shot at ${clock(start)}, so Follow faces keeps the centre there.`;
      }
    });
  }
  $("style-pick").disabled = !captions;
  $("style-current-name").textContent = styleOf(look.setup.style).name;
  if (captions) drawLook($("style-current"), lookQuery(at, { view: "caption" }));
}

// ---------------- the Caption setup panel ----------------

function openStudio() {
  $("caption-studio").hidden = false;
  document.body.classList.add("studio-open");
  $("style-pick").setAttribute("aria-expanded", "true");
  fillStudio();
  drawStudio(true);
  $("studio-done").focus();
}

function closeStudio() {
  if ($("caption-studio").hidden) return;
  $("caption-studio").hidden = true;
  document.body.classList.remove("studio-open");
  $("style-pick").setAttribute("aria-expanded", "false");
  $("studio-motion").pause();
  showLooks(true);
  $("style-pick").focus();
}

// Every control set from the setup; the style tiles drawn with each style's own defaults.
function fillStudio() {
  const setup = look.setup;
  const style = styleOf(setup.style);
  const start = lookStart() ?? 0;
  $("studio-from").textContent = `On this video at ${clock(start)}`;
  $("studio-style-name").textContent = style.name;
  for (const tile of $("studio-styles").querySelectorAll(".studio-style")) {
    tile.setAttribute("aria-pressed", String(tile.dataset.value === setup.style));
    drawLook(tile.querySelector("img"), lookQuery(start + 1, { setup: defaultSetup(tile.dataset.value), view: "caption" }));
  }
  $("studio-colors").replaceChildren(...["text", "active", "outline", "accent"]
    .filter((role) => role in style.colors).map((role) => colorRow(role)));
  $("studio-size").value = setup.size;
  $("studio-size-value").textContent = `${setup.size}%`;
  $("studio-position").value = Math.round(setup.position * 100);
  $("studio-position-value").textContent = heightLabel(setup.position);
  for (const button of $("studio-words").children) {
    button.setAttribute("aria-checked", String(Number(button.dataset.words) === setup.words));
    button.disabled = style.fixed_words;
  }
  for (const button of $("studio-case").children) button.setAttribute("aria-checked", String(button.dataset.case === setup.case));
  $("studio-emoji").checked = setup.emoji;
}

function heightLabel(position) {
  return position < 0.36 ? "Top" : position < 0.62 ? "Middle" : position < 0.8 ? "Lower" : "Bottom";
}

function colorRow(role) {
  const value = look.setup.colors[role];
  const picker = el("input", { type: "color", value: value.toLowerCase(), className: "studio-picker" });
  picker.setAttribute("aria-label", `${config.caption_colors[role]} colour`);
  picker.oninput = () => changeSetup({ colors: { ...look.setup.colors, [role]: picker.value.toUpperCase() } }, false);
  const swatches = el("div", { className: "studio-swatches" }, ...SWATCHES.map((hex) => {
    const dot = el("button", { type: "button", className: "studio-swatch" });
    dot.style.setProperty("--swatch", hex);
    dot.setAttribute("aria-label", `${config.caption_colors[role]} ${hex}`);
    dot.setAttribute("aria-pressed", String(hex === value.toUpperCase()));
    dot.onclick = () => changeSetup({ colors: { ...look.setup.colors, [role]: hex } });
    return dot;
  }));
  return el("div", { className: "studio-color" },
    el("span", { className: "studio-color-name", textContent: config.caption_colors[role] }), picker, swatches);
}

function changeSetup(change, refill = true) {
  look.setup = { ...look.setup, ...change };
  saveSetup();
  if (refill) fillStudio();
  else {
    $("studio-size-value").textContent = `${look.setup.size}%`;
    $("studio-position-value").textContent = heightLabel(look.setup.position);
  }
  drawStudio();
}

// The big preview: a still as soon as it's drawn, then the moving version.
function drawStudio(now = false) {
  clearTimeout(studio.timer);
  const video = $("studio-motion");
  video.classList.remove("on");
  studio.timer = setTimeout(async () => {
    const start = lookStart();
    if (start === null) return;
    const still = lookQuery(start + 1, { view: "frame" });
    const motion = lookQuery(start, { view: "motion" });
    studio.want = motion;
    $("studio-status").textContent = "Drawing…";
    $("studio-status").hidden = false;
    await drawLook($("studio-still"), still);
    if (studio.want !== motion) return;
    $("studio-status").textContent = "Making the moving preview…";
    try {
      const result = await fetchLook(motion);
      if (studio.want !== motion) return;
      video.src = result.url;
      await video.play().catch(() => {});
      video.classList.add("on");
      $("studio-status").hidden = true;
    } catch {
      if (studio.want === motion) $("studio-status").textContent = "No moving preview right now. The still shows the look.";
    }
  }, now ? 0 : 280);
}

function buildStudio() {
  const families = [...new Set(config.caption_styles.map((s) => s.family))];
  $("studio-styles").replaceChildren(...families.map((family) => el("div", { className: "studio-family" },
    el("h4", { textContent: family }),
    el("div", { className: "studio-grid" }, ...config.caption_styles.filter((s) => s.family === family).map((style) => {
      const tile = el("button", { type: "button", className: "studio-style", title: style.best },
        el("span", { className: "look-shot style-shot" }, el("img", { alt: "" })),
        el("span", { className: "studio-style-name", textContent: style.name }));
      tile.dataset.value = style.id;
      tile.onclick = () => changeSetup(defaultSetup(style.id, look.setup));
      return tile;
    })))));
  $("studio-words").replaceChildren(...[1, 2, 3, 4, 5, 6].map((n) => {
    const button = el("button", { type: "button", textContent: String(n) });
    button.dataset.words = n;
    button.setAttribute("role", "radio");
    button.onclick = () => changeSetup({ words: n });
    return button;
  }));
  for (const button of $("studio-case").children) {
    button.setAttribute("role", "radio");
    button.onclick = () => changeSetup({ case: button.dataset.case });
  }
  $("studio-size").oninput = (event) => changeSetup({ size: Number(event.target.value) }, false);
  $("studio-position").oninput = (event) => changeSetup({ position: Number(event.target.value) / 100 }, false);
  $("studio-emoji").onchange = (event) => changeSetup({ emoji: event.target.checked });
  $("studio-reset").onclick = () => changeSetup(defaultSetup(look.setup.style));
  $("studio-done").onclick = closeStudio;
  $("studio-sound").onclick = () => {
    const video = $("studio-motion");
    video.muted = !video.muted;
    $("studio-sound").textContent = video.muted ? "Sound on" : "Sound off";
    $("studio-sound").setAttribute("aria-pressed", String(!video.muted));
  };
  $("caption-studio").addEventListener("click", (event) => { if (event.target === $("caption-studio")) closeStudio(); });
}

function buildLookControls() {
  look.setup = loadSetup();
  const shot = () => el("span", { className: "look-shot" }, el("img", { alt: "" }));
  $("framings").replaceChildren(...config.framing_order.map((value) => {
    const tile = el("button", { type: "button", className: "framing" },
      shot(), el("span", { className: "framing-name", textContent: config.framings[value] }));
    tile.setAttribute("role", "radio");
    tile.dataset.value = value;
    tile.onclick = () => { look.framing = value; showLooks(); };
    return tile;
  }));
  buildStudio();
  $("opt-captions").onchange = () => showLooks();
  $("style-pick").onclick = openStudio;
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeStudio(); });
}

function resetLooks() {
  for (const result of looksReady.values()) URL.revokeObjectURL(result.url);
  looks.clear();
  looksReady.clear();
  Object.assign(look, { episode: null, framingSet: false, drawn: "" });
  for (const img of document.querySelectorAll("#render-bar img, #caption-studio img")) {
    img.removeAttribute("src");
    img.parentElement.classList.remove("ready", "loading", "failed");
  }
  $("studio-motion").removeAttribute("src");
  $("look-note").hidden = true;
  closeStudio();
}

// The analysis steps, each with where it begins on the job's 0-100 scale
// (the report() calls in pipeline.analyze).
// While a video is analysed the page says nothing about how: the real steps
// would hand out the recipe. It keeps people company instead, with a line
// that changes every few seconds and a to-do list that never runs out.
// Each fits on one line, so nothing on the page ever changes height.
const QUIPS = [
  "Skipping the boring parts. There were a few.",
  "Politely ignoring the first five minutes.",
  "Somewhere in here is a viral clip. Probably.",
  "This is the part where we look busy.",
  "Not judging. Okay, judging a little.",
  "Pretending this is hard. It isn't.",
  "Cutting dead air. There was a lot of air.",
  "Your mic was fine. Mostly.",
  "Brewing coffee. Not for us. We're robots.",
  "Pretending we have a deadline.",
  "Asking the video nicely to go viral.",
  "Making you look smarter. You're welcome.",
  "Turning yapping into a business model.",
  "Trimming. Trimming. Still trimming.",
];
const CHORES = [
  "Skipping the 'hey guys' intro", "Ignoring the sponsor read", "Counting every 'basically'",
  "Locating the actual point", "Untangling the umms", "Bribing the algorithm",
  "Judging the thumbnail, silently", "Finding the bit mum would share", "Deleting the throat clearing",
  "Explaining 'vibe' to the robots", "Waiting for the sentence to end", "Rating every laugh out of ten",
  "Asking the intern (there's none)", "Looking for the plot twist", "Measuring the hype",
  "Rewinding the good bit, twice", "Nodding along to the crypto part", "Forgiving the audio quality",
];
const CHORES_SHOWN = 4;           // rows in the list; it never grows or shrinks
const CHORE_ROW = 34;             // px, as .ep-steps li in app.css
const shuffled = (list) => list.map((item) => [Math.random(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
const waiting = { timer: null, quips: [], chores: [], tick: 0 };

function nextOf(key, list, avoid = new Set()) {
  for (let tries = 0; tries <= list.length; tries++) {
    if (!waiting[key].length) waiting[key] = shuffled(list);
    const pick = waiting[key].pop();
    if (!avoid.has(pick)) return pick;
  }
  return list[0];
}

function swapLine(node, text) {
  node.textContent = text;
  node.animate([{ transform: "translateY(35%)", opacity: 0 }, { transform: "none", opacity: 1 }],
               { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
}

// Every 2.4 s the chore in progress is ticked and the list rolls up one row:
// a new chore comes in at the bottom as the oldest leaves at the top. The
// list's box has a fixed height, so the page around it never moves. Every
// other tick the big line changes.
function keepCompany() {
  if (document.hidden) return;                 // nobody watching: nothing piles up
  const list = $("analysis-steps");
  const showing = () => new Set([...list.children].map((item) => item.textContent));
  if (list.children.length !== CHORES_SHOWN) {
    list.replaceChildren();
    for (let i = 0; i < CHORES_SHOWN; i++) {
      list.append(el("li", { className: i < 2 ? "done" : (i === 2 ? "now" : ""),
                             textContent: nextOf("chores", CHORES, showing()) }));
    }
  } else {
    const now = list.querySelector(".now");
    now.classList.replace("now", "done");
    now.nextElementSibling.classList.add("now");
    list.append(el("li", { textContent: nextOf("chores", CHORES, showing()) }));
    list.classList.add("rolling");
    list.style.transform = `translateY(-${CHORE_ROW}px)`;
    setTimeout(() => {                         // a timer, not the animation's end, so it always runs
      list.classList.remove("rolling");
      list.firstElementChild.remove();
      list.style.transform = "";
    }, 460);
  }
  if (waiting.tick++ % 2 === 0) swapLine($("analysis-stage"), nextOf("quips", QUIPS, new Set([$("analysis-stage").textContent])));
}

function stopCompany() {
  clearInterval(waiting.timer);
  waiting.timer = null;
  waiting.tick = 0;
  $("analysis-steps").replaceChildren();
  $("analysis-steps").style.transform = "";
}

// How long this one should take, from its length: a rough, honest promise.
function waitText(seconds) {
  const minutes = Math.max(1, Math.round((seconds / 3600) * 3.5));
  return `About ${minutes} minute${minutes === 1 ? "" : "s"} for this one. Stretch, hydrate, don't refresh.`;
}

function drawProgress(job, duration) {
  const failed = job.status === "failed";
  const queued = job.status === "queued";
  $("analysis").classList.toggle("failed", failed);
  $("analysis-progress").value = job.percent;
  $("analysis-percent").textContent = `${job.percent}%`;
  if (failed) {
    stopCompany();
    $("analysis-stage").textContent = "Couldn't analyse this video";
    $("analysis-message").textContent = job.error || "Something went wrong on our side. Try again.";
    return;
  }
  $("analysis-message").textContent = queued
    ? "Queued behind someone else's masterpiece. Yours is next."
    : waitText(duration || 0);
  if (!waiting.timer) {
    keepCompany();
    waiting.timer = setInterval(keepCompany, 2400);
  }
}

async function showEpisode() {
  const id = episodeId;
  let episode;
  try {
    episode = await api(`/api/episodes/${id}`);
  } catch (error) {
    if (episodeId === id) { flash(error.message); location.hash = "#/"; }
    return;
  }
  if (episodeId !== id) return;              // navigated away while loading

  $("episode-title").textContent = episode.title;
  $("mark-link").href = `#/label/${id}`;

  const job = episode.analysis;
  const analysing = active(job);
  const failed = job && job.status === "failed";
  const ready = job && job.status === "done";
  $("episode-meta").textContent = [
    clock(episode.duration), episode.content_type,
    ready ? count(episode.moments.length, "moment") : "",
    episode.clips.length ? count(episode.clips.length, "clip") : "",
  ].filter(Boolean).join(" · ");
  $("analysis").hidden = !analysing && !failed;
  if (job && (analysing || failed)) drawProgress(job, episode.duration);
  else stopCompany();
  $("retry").hidden = !failed;

  $("moments-panel").hidden = !ready;
  $("no-moments").hidden = episode.moments.length > 0;
  $("render-bar").hidden = episode.moments.length === 0;
  const known = new Set(episode.moments.map((m) => m.id));
  selected.forEach((momentId) => { if (!known.has(momentId)) selected.delete(momentId); });
  sync($("moments"), episode.moments, (m) => JSON.stringify(m), momentRow);
  look.episode = episode;
  if (ready && !look.framingSet) {
    look.framing = episode.default_framing;
    look.framingSet = true;
  }
  updateRenderButton();

  $("clips-panel").hidden = episode.clips.length === 0;
  sync($("clips"), episode.clips, (c) => JSON.stringify(c), clipCard);

  if (analysing || episode.clips.some((c) => active(c.render))) pollIn(1500, showEpisode);
}

async function makeClips() {
  $("render-button").disabled = true;
  flash("");
  try {
    await api(`/api/episodes/${episodeId}/clips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moment_ids: [...selected],
        options: {
          captions: $("opt-captions").checked,
          caption: look.setup,
          framing: look.framing,
          remove_silence: $("opt-silence").checked,
        },
      }),
    });
    selected.clear();
    $("moments").replaceChildren();          // redraw with the ticks cleared
  } catch (error) {
    flash(error.message);
  }
  await showEpisode();
}

async function retryAnalysis() {
  try { await api(`/api/episodes/${episodeId}/analyze`, { method: "POST" }); }
  catch (error) { flash(error.message); }
  await showEpisode();
}

async function deleteEpisode() {
  if (!confirm("Delete this video and all of its clips?")) return;
  try {
    await api(`/api/episodes/${episodeId}`, { method: "DELETE" });
    location.hash = "#/";
  } catch (error) {
    flash(error.message);
  }
}

// ---------------- marking clips (the golden set) ----------------
// You mark the clips you would post. A stitched clip is up to 4 parts, played
// in the order they were added. Marks are saved in seconds, so they stay
// valid however the engine later splits sentences.

let labelEpisodeId = null;
const mark = { units: [], first: null, last: null, parts: [], playing: null, now: -1 };

const partsLength = (parts) => parts.reduce((sum, [start, end]) => sum + (end - start), 0);
const describeParts = (parts) => parts.map(([start, end]) => `${clock(start)}–${clock(end)}`).join("  +  ");

function unitRow(unit) {
  const text = unit.kind === "gap" ? `${Math.round(unit.end - unit.start)}s, no speech` : unit.text;
  const signals = unit.signals.map((s) => el("span", { className: "sig", textContent: s.kind === "audio" ? "loud" : "cut" }));
  const row = el("div", { className: `unit ${unit.kind}` },
    el("span", { className: "t", textContent: clock(unit.start) }),
    el("span", {}, text, ...signals));
  row.dataset.index = unit.id;
  row.onclick = (event) => pickUnit(unit.id, event.shiftKey);
  return row;
}

function pickUnit(index, extend) {
  mark.playing = null;
  if (extend && mark.first !== null) {
    mark.last = index;
  } else {
    mark.first = mark.last = index;
    $("label-video").currentTime = mark.units[index].start;
  }
  drawSelection();
}

function selectedRange() {
  if (mark.first === null) return null;
  const a = Math.min(mark.first, mark.last), b = Math.max(mark.first, mark.last);
  return { start: mark.units[a].start, end: mark.units[b].end, a, b };
}

function drawSelection() {
  const range = selectedRange();
  for (const row of $("transcript").children) {
    const i = Number(row.dataset.index);
    row.classList.toggle("sel", Boolean(range) && i >= range.a && i <= range.b);
  }
  $("selection").textContent = range
    ? `Selected ${clock(range.start)}–${clock(range.end)} (${Math.round(range.end - range.start)}s)`
    : "Nothing selected";
  $("add-part").disabled = !range || mark.parts.length >= 4;
}

function drawDraft() {
  const total = partsLength(mark.parts);
  if (!mark.parts.length) {
    $("draft-parts").replaceChildren("No parts yet.");
  } else {
    const rows = mark.parts.map(([start, end], i) => {
      const remove = el("button", { type: "button", className: "quiet", textContent: "×", title: "Remove this part" });
      remove.onclick = () => { mark.parts.splice(i, 1); drawDraft(); drawSelection(); };
      return el("div", { className: "part" },
        el("span", { textContent: `Part ${i + 1}: ${clock(start)}–${clock(end)} (${Math.round(end - start)}s)` }), remove);
    });
    const kind = mark.parts.length > 1 ? `stitched from ${mark.parts.length} parts` : "one part";
    $("draft-parts").replaceChildren(...rows, el("div", { textContent: `Total ${Math.round(total)}s, ${kind}` }));
  }
  const saveable = mark.parts.length > 0 && total >= config.min_moment_seconds && total <= config.max_clip_seconds;
  $("save-good").disabled = $("save-bad").disabled = !saveable;
  $("play-draft").disabled = $("clear-draft").disabled = !mark.parts.length;
}

function addPart() {
  const range = selectedRange();
  if (!range || mark.parts.length >= 4) return;
  mark.parts.push([range.start, range.end]);
  mark.first = mark.last = null;
  drawSelection();
  drawDraft();
}

// Plays each part in turn, jumping over everything in between, so a stitched
// clip can be heard exactly as a viewer would hear it.
function playParts(parts) {
  const video = $("label-video");
  video.currentTime = parts[0][0];
  video.play();
  mark.playing = { parts, index: 0 };
}

function unitAt(seconds) {
  let lo = 0, hi = mark.units.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (mark.units[mid].end <= seconds) lo = mid + 1;
    else if (mark.units[mid].start > seconds) hi = mid - 1;
    else return mid;
  }
  return -1;
}

function onLabelTime() {
  const video = $("label-video");
  const t = video.currentTime;
  const playing = mark.playing;
  if (playing && t >= playing.parts[playing.index][1] - 0.05) {
    if (playing.index + 1 < playing.parts.length) {
      playing.index += 1;
      video.currentTime = playing.parts[playing.index][0];
    } else {
      mark.playing = null;
      video.pause();
    }
  }
  const now = unitAt(t);
  if (now === mark.now) return;
  const rows = $("transcript").children;
  if (rows[mark.now]) rows[mark.now].classList.remove("now");
  if (rows[now]) {
    rows[now].classList.add("now");
    if (!video.paused) rows[now].scrollIntoView({ block: "nearest" });
  }
  mark.now = now;
}

function labelRow(label) {
  const play = el("button", { type: "button", textContent: "Play" });
  play.onclick = () => playParts(label.parts);
  const remove = el("button", { type: "button", className: "quiet", textContent: "Delete" });
  remove.onclick = async () => {
    try { await api(`/api/labels/${label.id}`, { method: "DELETE" }); await loadLabels(); }
    catch (error) { flash(error.message); }
  };
  const details = [label.parts.length > 1 ? `stitched from ${label.parts.length} parts` : "", label.note];
  return el("div", { className: "item" },
    el("span", { className: `badge ${label.kind === "good" ? "good" : "bad"}`, textContent: label.kind === "good" ? "Post" : "Never" }),
    el("div", {},
      el("div", { className: "name", textContent: describeParts(label.parts) }),
      el("div", { className: "sub", textContent: details.filter(Boolean).join(" · ") })),
    el("div", { className: "side" }, play, " ", remove));
}

async function loadLabels() {
  const id = labelEpisodeId;
  const labels = await api(`/api/episodes/${id}/labels`);
  if (labelEpisodeId !== id) return;
  $("labels").replaceChildren(...labels.map(labelRow));
  $("label-count").textContent = labels.filter((l) => l.kind === "good").length;
  // Sentences inside a clip you'd post are marked in the transcript.
  const covered = labels.filter((l) => l.kind === "good").flatMap((l) => l.parts);
  for (const row of $("transcript").children) {
    const unit = mark.units[Number(row.dataset.index)];
    row.classList.toggle("marked", covered.some(([s, e]) => unit.start < e && unit.end > s));
  }
}

async function saveLabel(kind) {
  try {
    await api(`/api/episodes/${labelEpisodeId}/labels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, parts: mark.parts, note: $("label-note").value }),
    });
    mark.parts = [];
    $("label-note").value = "";
    drawDraft();
    drawSelection();
    await loadLabels();
  } catch (error) {
    flash(error.message);
  }
}

async function setGolden() {
  try {
    await api(`/api/episodes/${labelEpisodeId}/golden`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ set: $("golden").value || null }),
    });
  } catch (error) {
    flash(error.message);
  }
}

async function showLabel() {
  const id = labelEpisodeId;
  let episode, units;
  try {
    [episode, units] = await Promise.all([api(`/api/episodes/${id}`), api(`/api/episodes/${id}/units`)]);
  } catch (error) {
    if (labelEpisodeId === id) flash(error.message);
    return;
  }
  if (labelEpisodeId !== id) return;
  Object.assign(mark, { units, first: null, last: null, parts: [], playing: null, now: -1 });
  $("label-title").textContent = episode.title;
  $("label-back").href = `#/video/${id}`;
  $("golden").value = episode.golden || "";
  $("label-video").src = `/api/episodes/${id}/source`;
  $("transcript").replaceChildren(...units.map(unitRow));
  drawSelection();
  drawDraft();
  await loadLabels();
}

// ---------------- start-up and navigation ----------------

function route() {
  clearTimeout(timer);
  stopCompany();
  flash("");
  const video = location.hash.match(/^#\/video\/([0-9a-f]+)$/);
  const marking = location.hash.match(/^#\/label\/([0-9a-f]+)$/);
  episodeId = video ? video[1] : null;
  labelEpisodeId = marking ? marking[1] : null;
  $("home").hidden = Boolean(video || marking);
  $("episode").hidden = !video;
  $("label").hidden = !marking;
  document.body.dataset.screen = video ? "video" : (marking ? "label" : "home");   // home.css/home.js key off this
  document.querySelector("main").classList.toggle("wide", Boolean(marking));
  if (!marking) {
    mark.playing = null;
    $("label-video").pause();
    $("label-video").removeAttribute("src");
  }
  if (video) {
    selected.clear();
    $("moments").replaceChildren();
    $("clips").replaceChildren();
    resetLooks();
    showEpisode();
  } else if (marking) {
    showLabel();
  } else {
    showHome().catch((error) => flash(error.message));
  }
}

async function start() {
  config = await api("/api/config");
  $("problem").textContent = config.problem || "";
  $("problem").hidden = !config.problem;
  $("upload-button").disabled = Boolean(config.problem);
  buildLookControls();

  $("file").onchange = () => chooseFile($("file").files[0]);
  const drop = $("drop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); chooseFile(e.dataTransfer.files[0]); };
  $("upload").onsubmit = upload;
  $("render-button").onclick = makeClips;
  $("retry").onclick = retryAnalysis;
  $("delete-episode").onclick = deleteEpisode;
  $("add-part").onclick = addPart;
  $("play-draft").onclick = () => playParts(mark.parts);
  $("clear-draft").onclick = () => { mark.parts = []; drawDraft(); drawSelection(); };
  $("save-good").onclick = () => saveLabel("good");
  $("save-bad").onclick = () => saveLabel("bad");
  $("golden").onchange = setGolden;
  $("label-video").ontimeupdate = onLabelTime;
  $("label-video").onpause = () => { mark.playing = null; };

  window.onhashchange = route;
  route();
}

start().catch((error) => flash(error.message));
