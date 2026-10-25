// The home screen's moving parts: the two walls of example clips, the word
// that changes in the headline, the timeline inside the drop window, the glass
// language menu, the light/dark switch, and the light that follows the
// pointer. app.js still owns uploading and every screen; this file only reads
// the page it draws.
//
// Reduced motion: the clips keep playing and the walls keep moving, because
// they are what the page shows. What stops is movement of the page itself:
// tilt, parallax, the pointer light and the theme wipe.

const $ = (id) => document.getElementById(id);
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mouse = matchMedia("(pointer: fine)").matches;
const onHome = () => document.body.dataset.screen === "home";

// Same numbers on every visit, so the page looks designed rather than random.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- the walls of example clips ----------------
// AI-made creators (from the first Clipsy's landing page), captioned the way
// Clipsy's presets burn captions in, so the walls show what comes out.

const MEDIA = $("reels").dataset.media;

const CLIPS = {
  podcast: { image: "podcast-host", style: "classic", title: "The first clip is the business", length: "0:42", score: "9.4",
    lines: [["Nobody", "tells", "you"], ["the", "first", "clip"], ["is", "the", "whole", "business"]] },
  founder: { image: "founder-interview", style: "boxed", title: "Twice out of money", length: "0:51", score: "9.6", stitch: "6:10 + 44:19",
    lines: [["We", "almost", "ran", "out"], ["of", "money", "twice"], ["then", "this", "happened"]] },
  educator: { image: "educator", style: "minimal", title: "Draw it once", length: "0:38", score: "8.9",
    lines: [["Draw", "it", "once"], ["and", "you'll", "never"], ["forget", "it"]] },
  cooking: { image: "cooking-creator", style: "sunburst", title: "Salt it like the sea", length: "0:29", score: "9.1",
    lines: [["Salt", "the", "water"], ["like", "the", "sea"], ["trust", "me"]] },
  fitness: { image: "fitness-coach", style: "mint", title: "Where the work is", length: "0:44", score: "8.7",
    lines: [["Slow", "it", "down"], ["that's", "where"], ["the", "work", "is"]] },
  gaming: { image: "gaming-creator", style: "neon", title: "One shot left", length: "0:26", score: "9.5",
    lines: [["Wait", "for", "it"], ["one", "shot", "left"], ["no", "way"]] },
  comedy: { image: "comedy-story", style: "yellow", title: "Mom calls at 3 AM", length: "0:47", score: "9.3", stitch: "2:15 + 51:40",
    lines: [["So", "my", "mom"], ["calls", "me"], ["at", "3", "AM"]] },
  product: { image: "product-demo", style: "ink", title: "One button, perfect shot", length: "0:33", score: "8.8",
    lines: [["Thirty", "seconds"], ["one", "button"], ["perfect", "shot"]] },
  quit: { image: "talking-head", style: "impact", title: "I quit my job for this", length: "0:55", score: "9.2", stitch: "4:02 + 41:30",
    lines: [["I", "quit", "my", "job"], ["for", "this"], ["here's", "why"]] },
  tech: { image: "tech-review", style: "electric", title: "Smaller than your thumb", length: "0:31", score: "8.6",
    lines: [["It's", "smaller"], ["than", "your", "thumb"], ["lasts", "a", "week"]] },
  talk1: { video: "talk-1", style: "pop", title: "This changed everything", length: "0:39", score: "9.7",
    lines: [["Okay", "listen"], ["this", "changed"], ["everything", "for", "me"]] },
  talk2: { video: "talk-2", style: "classic", title: "I didn't expect it to work", length: "0:36", score: "9.4",
    lines: [["Honestly?"], ["I", "didn't", "expect"], ["it", "to", "work"]] },
};

// Four columns a side, numbered from the window's left edge to its right. The
// page opens with all four, then the one nearest the middle on each side bows
// out and the other three spread evenly (retireInner). Every column keeps its
// direction throughout, so each side ends up running up, down, up.
// Neighbouring columns never share a clip.
const PER_SIDE = 4;
const MIN_COLUMN = 80;                                // narrower than this and a side shows fewer
const GAP = 14;                                       // the least space between columns
const STILLS = ["podcast", "cooking", "comedy", "fitness", "founder", "gaming", "tech", "educator", "quit", "product"];
const SPEEDS = [31, 23, 27, 34, 25, 29, 22, 32];     // pixels a second

// Talking videos cost far more to show than pictures, so only the second
// column from the middle on each side has one (it stays after the opening),
// and it plays without stopping. Each column takes five of the pictures,
// rotated so no two columns show them in the same order.
const VIDEO_RANK = 1;

const COLUMNS = SPEEDS.map((speed, k) => {
  const left = k < PER_SIDE;
  const place = left ? k : k - PER_SIDE;             // left to right within its side
  const rank = left ? PER_SIDE - 1 - place : place;   // 0 is the column nearest the middle
  const clips = [0, 1, 2, 3, 4].map((i) => STILLS[(k * 5 + (i + k) % 5) % STILLS.length]);
  if (rank === VIDEO_RANK) clips.splice(2, 1, left ? "talk1" : "talk2");
  return {
    side: left ? "left" : "right",
    rank,
    up: left ? place % 2 === 0 : place % 2 === 1,
    speed, clips, start: (k * 1.3) % 10,
  };
});

const STAR = '<svg viewBox="0 0 16 16"><path d="M8 0c.5 4.2 3.8 7.5 8 8-4.2.5-7.5 3.8-8 8-.5-4.2-3.8-7.5-8-8 4.2-.5 7.5-3.8 8-8z"/></svg>';
const PLAY = '<svg viewBox="0 0 16 16"><path d="M5 3.5v9l7.5-4.5z"/></svg>';
const LINK = '<svg viewBox="0 0 16 16"><path d="M6.6 9.4l2.8-2.8M5.3 7.2 4 8.5a2.4 2.4 0 0 0 3.4 3.4l1.3-1.3M10.7 8.8 12 7.5a2.4 2.4 0 0 0-3.4-3.4L7.3 5.4"/></svg>';

// Built from the constants above only, never from user data, so HTML is safe here.
function reelHtml(key, random, start) {
  const clip = CLIPS[key];
  const len = (7 + random() * 5).toFixed(1);
  const media = clip.video
    ? `<video src="${MEDIA}${clip.video}.mp4" poster="${MEDIA}${clip.video}.webp" muted loop playsinline preload="none"
         disablepictureinpicture data-start="${start}"></video>`
    : `<img src="${MEDIA}${clip.image}.webp" alt="" decoding="async">`;
  return `<div class="reel" data-clip="${key}" style="--len:${len}s;--off:-${(random() * len).toFixed(1)}s">
    <div class="reel-media">${media}</div>
    <div class="reel-top"><span class="chip">${PLAY}${clip.length}</span><span class="chip score">${STAR}${clip.score}</span></div>
    ${clip.stitch ? `<span class="reel-stitch">${LINK}${clip.stitch}</span>` : ""}
    <p class="reel-cap" data-style="${clip.style}"></p>
    <div class="reel-foot"><span class="reel-title">${clip.title}</span><span class="reel-bar"><i></i></span></div>
  </div>`;
}

const walls = [];
const speaking = new Map();    // reel on screen -> where its caption is up to

function buildWalls() {
  const random = seeded(7);
  const sides = { left: document.querySelector(".reel-side.left"), right: document.querySelector(".reel-side.right") };
  for (const column of COLUMNS) {
    // Twice, so the loop is seamless; the second copy's video starts 5 s later.
    const copy = (start) => column.clips.map((key) => reelHtml(key, random, start)).join("");
    const col = document.createElement("div");
    col.className = "reel-col";
    col.innerHTML = `<div class="reel-track">${copy(column.start)}${copy(column.start + 5)}</div>`;
    sides[column.side].append(col);
    walls.push({ ...column, sideEl: sides[column.side], col, track: col.firstElementChild,
                 anim: null, rate: 1, hovered: false, leaving: false });
  }

  // Only clips on screen speak, animate and play.
  const live = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      target.classList.toggle("live", isIntersecting);
      const video = target.querySelector("video");
      if (isIntersecting) {
        startSpeaking(target, random);
        if (video) playVideos();
      } else {
        speaking.delete(target);
        if (video) {
          video.pause();
          if (video === nowPlaying) { nowPlaying = null; playVideos(); }
        }
      }
    }
  }, { rootMargin: "40px 0px" });
  document.querySelectorAll(".reel").forEach((reel) => live.observe(reel));
  setInterval(speakTick, 100);   // captions change together, ten times a second at most

  for (const wall of walls) {
    wall.anim = wall.track.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(-50%)" }],
      { duration: loopMs(wall), iterations: Infinity, direction: wall.up ? "normal" : "reverse" });
    wall.anim.currentTime = random() * loopMs(wall);
    if (!onHome()) wall.anim.pause();
    // Hovering a column brings it to rest, so a clip can be looked at.
    wall.col.onpointerenter = () => { wall.hovered = true; settleWall(wall); };
    wall.col.onpointerleave = () => { wall.hovered = false; settleWall(wall); };
  }
  fitWalls();
  let resizing = 0;
  addEventListener("resize", () => {
    clearTimeout(resizing);
    resizing = setTimeout(fitWalls, 150);
  });
}

// One copy of the column's clips, at the column's speed in pixels a second.
const loopMs = (wall) => Math.max(20000, (wall.track.offsetHeight / 2 / wall.speed) * 1000);

// Size the columns so four fit a side (fewer on a narrow window); the space
// left over is shared out evenly by the CSS (space-evenly).
let introDone = false;

function fitWalls() {
  const wide = innerWidth >= 900;
  for (const side of sides) {
    const style = getComputedStyle(side);
    const room = side.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const fits = wide ? Math.max(1, Math.min(PER_SIDE, Math.floor((room - GAP) / (MIN_COLUMN + GAP)))) : 1;
    if (wide) side.style.setProperty("--col-w", `${((room - GAP * (fits + 1)) / fits).toFixed(1)}px`);
    else side.style.removeProperty("--col-w");
    for (const wall of walls) {
      if (wall.sideEl !== side || wall.leaving) continue;
      const retired = introDone && fits === PER_SIDE && wall.rank === 0;
      wall.col.hidden = wall.rank >= fits || retired;
      if (wall.col.hidden) {
        wall.anim.pause();
        pauseVideos([wall]);
      } else {
        retime(wall);
        if (onHome()) wall.anim.play();
      }
    }
  }
  playVideos();
}

// A column's speed is in pixels, so its loop takes longer when its clips grow.
// Keep its place in the loop, so a resize never makes it jump.
function retime(wall) {
  const ms = loopMs(wall);
  const { duration } = wall.anim.effect.getTiming();
  if (Math.abs(duration - ms) < 1) return;
  const progress = ((wall.anim.currentTime || 0) % duration) / duration;
  wall.anim.effect.updateTiming({ duration: ms });
  wall.anim.currentTime = progress * ms;
}

// At launch the columns come in one at a time, from the middle outward, each
// sliding in from beyond the top or bottom edge in the direction it flows and
// showing through the walls' edge fade. Moving them (not fading them) keeps
// the whole entrance on the graphics chip's cheap path. Then retireInner.
const ARRIVE_MS = 1800;
const ARRIVE_STAGGER = 260;

function bringInColumns() {
  const away = innerHeight + 80;
  for (const wall of walls) {
    if (wall.col.hidden) continue;
    const delay = 200 + wall.rank * ARRIVE_STAGGER;
    wall.col.animate(
      [{ transform: `translateY(${wall.up ? away : -away}px)` }, { transform: "none" }],
      { duration: ARRIVE_MS, delay, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "backwards" });
    // Shown only as its slide begins, so the columns are drawn a pair at a time.
    setTimeout(() => wall.col.classList.add("arrived"), delay);
  }
  setTimeout(() => document.body.classList.add("walls-in"), arrivedMs());
}
const arrivedMs = () => 200 + (PER_SIDE - 1) * ARRIVE_STAGGER + ARRIVE_MS;

// Decode the pictures in the columns showing before they come in, so each
// arrives whole instead of popping in mid-slide. Never waits more than 0.8 s.
function picturesReady() {
  const pictures = walls.filter((wall) => !wall.col.hidden).flatMap((wall) => [...wall.col.querySelectorAll("img")]);
  const decoded = Promise.all(pictures.map((img) => img.decode().catch(() => {})));
  return Promise.race([decoded, new Promise((done) => setTimeout(done, 800))]);
}

// The opening: four columns a side, then the one nearest the middle flows
// away and the other three glide apart until they are evenly spaced.
function retireInner() {
  if (introDone) return;
  introDone = true;
  const spring = getComputedStyle(document.documentElement).getPropertyValue("--spring-soft").trim() || "ease";
  for (const side of sides) {
    const showing = walls.filter((wall) => wall.sideEl === side && !wall.col.hidden);
    const leaving = showing.find((wall) => wall.rank === 0);
    if (showing.length < PER_SIDE || !leaving) continue;
    const before = new Map(showing.map((wall) => [wall, wall.col.offsetLeft]));
    // Lift it out of the row where it stands, so the others can re-space now.
    leaving.leaving = true;
    // Behind its neighbours, so they can pass over it while it goes.
    Object.assign(leaving.col.style, { position: "absolute", left: `${before.get(leaving)}px`, top: "0", bottom: "0", zIndex: "-1" });
    for (const wall of showing) {
      if (wall === leaving) continue;
      const moved = before.get(wall) - wall.col.offsetLeft;
      wall.col.animate([{ transform: `translateX(${moved}px)` }, { transform: "none" }],
        { duration: 1800, delay: 250, easing: spring, fill: "backwards" });
    }
    // It flows away off the top or bottom, the way it was already moving,
    // gathering speed as it goes.
    const away = innerHeight + 80;
    leaving.col.animate(
      [{ transform: "none" }, { transform: `translateY(${leaving.up ? -away : away}px)` }],
      { duration: 1300, easing: "cubic-bezier(.5, 0, .75, 0)", fill: "forwards" },
    ).finished.then(() => {
      leaving.leaving = false;
      leaving.col.hidden = true;
      leaving.col.style.cssText = "";
      leaving.col.getAnimations().forEach((anim) => anim.cancel());
      leaving.anim.pause();
    });
  }
}

// Eased by the frame loop normally; with reduced motion it simply stops.
function settleWall(wall) {
  if (calm) wall.anim.updatePlaybackRate(wall.hovered ? 0 : 1);
  else wake();
}

// Videos load nothing until the opening has played (settled). Then one video
// plays at a time: whichever talking clip is on screen, handing over to the
// other side's when it scrolls away. Measured on integrated graphics, no video
// keeps a 144 Hz screen at full rate, one nearly so, and two halve it.
let settled = false;
let nowPlaying = null;

function playVideos() {
  if (!settled || veiled || !onHome() || nowPlaying) return;
  const next = walls.filter((wall) => !wall.col.hidden)
    .map((wall) => wall.col.querySelector(".reel.live video"))
    .find(Boolean);
  if (!next) return;
  nowPlaying = next;
  playVideo(next);
}

function pauseVideos(list) {
  for (const wall of list) {
    wall.col.querySelectorAll("video").forEach((video) => {
      video.pause();
      if (video === nowPlaying) nowPlaying = null;
    });
  }
}

function playVideo(video) {
  video.muted = true;
  if (!video.dataset.started) {
    video.dataset.started = "1";
    video.preload = "auto";
    const seek = () => { video.currentTime = Number(video.dataset.start) % (video.duration || 10); };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
  }
  video.play().catch(() => {});   // a refused autoplay leaves the poster, which is fine
}

// ---------------- captions, a word at a time ----------------
// Each clip on screen speaks its lines like karaoke captions; now and then a
// new line cuts in tighter on the picture, the way an editor punches in.

function startSpeaking(reel, random) {
  if (speaking.has(reel)) return;
  const clip = CLIPS[reel.dataset.clip];
  speaking.set(reel, {
    lines: clip.lines,
    line: Math.floor(random() * clip.lines.length),
    word: -1,
    next: performance.now() + random() * 700,
    cap: reel.querySelector(".reel-cap"),
    media: reel.querySelector(".reel-media"),
    still: !clip.video,
    random,
  });
}

// Captions hold off until the walls are in (talking), then begin over 1.5 s.
let talking = false;

function startTalking() {
  talking = true;
  const now = performance.now();
  for (const state of speaking.values()) state.next = now + state.random() * 1500;
}

function speakTick() {
  // Paused while the page glides, so every frame of the scroll is free for it.
  if (!talking || veiled || scroller.running || !onHome() || document.hidden) return;
  const now = performance.now();
  for (const state of speaking.values()) {
    if (now >= state.next) speakNext(state, now);
  }
}

function speakNext(state, now) {
  const words = state.lines[state.line];
  if (state.word === -1) {
    const line = document.createElement("b");
    words.forEach((word, i) => {
      if (i) line.append(" ");
      line.append(Object.assign(document.createElement("span"), { textContent: word }));
    });
    state.cap.replaceChildren(line);
    if (state.random() < (state.still ? 0.45 : 0.25)) state.media.classList.toggle("punch");
  }
  const spans = state.cap.querySelectorAll("span");
  state.word += 1;
  spans.forEach((span, i) => span.classList.toggle("on", i === state.word));
  if (state.word < words.length) {
    state.next = now + 250 + words[state.word].length * 22;
  } else {
    state.line = (state.line + 1) % state.lines.length;
    state.word = -1;
    state.next = now + 140;
  }
}

// ---------------- the word that changes in the headline ----------------

// The box's width follows the word, so " out." glides along beside it. Widths
// can only be measured while the home screen is showing.
let measureRotator = () => {};

function startRotator() {
  const box = $("rotator");
  const words = [...box.children];
  let widths = [];
  let index = 0;
  measureRotator = () => {
    if (!onHome()) return;
    widths = words.map((word) => word.offsetWidth);
    box.style.width = `${widths[index]}px`;
    box.classList.add("ready");
  };
  addEventListener("resize", measureRotator);
  setInterval(() => {
    if (!widths.length || !onHome() || document.hidden) return;
    const leaving = words[index];
    index = (index + 1) % words.length;
    const coming = words[index];
    leaving.classList.replace("is-on", "is-out");
    // Send the next word back below the line without animating the trip.
    coming.style.transition = "none";
    coming.classList.remove("is-out");
    void coming.offsetWidth;
    coming.style.transition = "";
    coming.classList.add("is-on");
    box.style.width = `${widths[index]}px`;
  }, 2600);
}

// ---------------- the timeline in the drop window ----------------
// What Clipsy does, told as a loop on an editor's filmstrip of a two-person
// podcast, a step at a time with its name underneath: read every word (the
// playhead turns the frames from grey to colour), find the moments, cut them
// out, stitch a setup to its payoff, reframe to 9:16, and caption the finished
// short, which rises out of the strip and plays. Only opacity, transform and
// clip-path move, so it costs the graphics chip next to nothing. While a file
// uploads, the filmstrip is the progress bar instead.

const SCAN_MS = 15000;
const DONE = 0.92;            // the story ends here; the rest of the loop fades it out
const GONE = 0.96;
// Where each named step starts and ends, as shares of the loop.
const STEPS = [[0, 0.2], [0.2, 0.3], [0.3, 0.43], [0.43, 0.56], [0.56, 0.68], [0.68, DONE]];
let scanAnims = [];

const FILM_FRAMES = 9;       // tiles on the strip, wide enough to make out a shot
const DEMO_FRAMES = 12;      // static/home-media/film-0.webp ... film-11.webp, spread over them

function buildScan() {
  const frames = Array.from({ length: FILM_FRAMES }, (_, i) => {
    const demo = Math.round(i * (DEMO_FRAMES - 1) / (FILM_FRAMES - 1));
    return `<i style="background-image:url(${MEDIA}film-${demo}.webp)"></i>`;
  }).join("");
  document.querySelector(".film-dim").innerHTML = frames;
  document.querySelector(".film-lit").innerHTML = frames;
}

function startScan() {
  const one = (selector) => document.querySelector(selector);
  const all = (selector) => [...document.querySelectorAll(selector)];
  const loop = { duration: SCAN_MS, iterations: Infinity };
  const shown = "inset(0 0% 0 0)", hidden = "inset(0 100% 0 0)";
  // Shown from `from` to `to` (shares of the loop), fading quickly in and out.
  const during = (el, from, to, off = { opacity: 0 }, on = { opacity: 1 }) => el.animate([
    { ...off, offset: 0 }, { ...off, offset: from }, { ...on, offset: Math.min(to, from + 0.015) },
    { ...on, offset: to }, { ...off, offset: Math.min(1, to + 0.02) }, { ...off, offset: 1 }], loop);
  // Pops in at `at` and stays until the story ends.
  const pop = (el, at, from, peak, rest = { opacity: 1, transform: "none" }) => el.animate([
    { ...from, offset: 0 }, { ...from, offset: at }, { ...peak, offset: at + 0.012 }, { ...rest, offset: at + 0.03 },
    { ...rest, offset: DONE }, { ...rest, opacity: 0, offset: GONE }, { ...from, offset: 1 }], loop);
  // Steps back while the finished short plays.
  const recede = (el) => el.animate([
    { opacity: 1, offset: 0 }, { opacity: 1, offset: 0.62 }, { opacity: 0.22, offset: 0.66 },
    { opacity: 0.22, offset: GONE }, { opacity: 1, offset: 1 }], loop);

  scanAnims = [
    // 1. reading every word: the playhead sweeps and the frames take colour
    one(".film-lit").animate([
      { clipPath: hidden, opacity: 1, offset: 0 }, { clipPath: hidden, opacity: 1, offset: 0.01 },
      { clipPath: shown, opacity: 1, offset: 0.19 }, { clipPath: shown, opacity: 1, offset: DONE },
      { clipPath: shown, opacity: 0, offset: GONE }, { clipPath: hidden, opacity: 0, offset: 1 }], loop),
    one(".scan-head").animate([
      { transform: "translateX(0%)", opacity: 0, offset: 0 }, { transform: "translateX(0%)", opacity: 1, offset: 0.015 },
      { transform: "translateX(100%)", opacity: 1, offset: 0.19 }, { transform: "translateX(100%)", opacity: 0, offset: 0.21 },
      { transform: "translateX(100%)", opacity: 0, offset: 1 }], loop),
    // 2. finding the moments
    ...all(".scan-moment").map((moment, i) => pop(moment, 0.21 + i * 0.025,
      { opacity: 0, transform: "scaleY(.3)" }, { opacity: 1, transform: "scaleY(1.18)" })),
    // 3. cutting them out: cuts at each edge, everything else darkens
    pop(one(".scan-shade"), 0.31, { opacity: 0 }, { opacity: 1 }),
    ...all(".scan-cut").map((cut, i) => pop(cut, 0.31 + i * 0.012,
      { opacity: 0, transform: "scaleY(0)" }, { opacity: 1, transform: "scaleY(1.3)" }, { opacity: 0.85, transform: "none" })),
    // 4. stitching the setup to its payoff
    one(".scan-arc svg").animate([
      { clipPath: hidden, opacity: 1, offset: 0 }, { clipPath: hidden, opacity: 1, offset: 0.44 },
      { clipPath: shown, opacity: 1, offset: 0.5 }, { clipPath: shown, opacity: 1, offset: DONE },
      { clipPath: shown, opacity: 0, offset: GONE }, { clipPath: hidden, opacity: 0, offset: 1 }], loop),
    pop(one(".scan-tag"), 0.49, { opacity: 0, transform: "translateY(5px) scale(.9)" }, { opacity: 1, transform: "scale(1.06)" }),
    // 5. reframing to 9:16 on the speaker
    ...all(".scan-crop").map((crop) => pop(crop, 0.57, { opacity: 0, transform: "scale(1.5)" }, { opacity: 1, transform: "scale(.94)" })),
    ...[".scan-film", ".scan-arc", ".scan-ruler"].map((selector) => recede(one(selector))),
    // 6. captioning: the short rises out of the strip and plays, setup then payoff
    pop(one(".scan-clip"), 0.63, { opacity: 0, transform: "translateY(16px) scale(.8)" }, { opacity: 1, transform: "translateY(-2px) scale(1.03)" }),
    during(one(".clip-setup"), 0.63, 0.79),
    during(one(".clip-payoff"), 0.79, DONE),
    ...all(".clip-line").map((line, i) => during(line, [0.68, 0.79][i], [0.79, DONE][i])),
    ...all(".clip-line span").map((word, i) => {
      const [from, to] = [[0.68, 0.735], [0.735, 0.79], [0.79, 0.84], [0.84, DONE]][i];
      return during(word, from, to, { color: "#ffffff" }, { color: "#ffd60a" });
    }),
    one(".clip-bar i").animate([
      { transform: "scaleX(0)", offset: 0 }, { transform: "scaleX(0)", offset: 0.68 },
      { transform: "scaleX(1)", offset: DONE }, { transform: "scaleX(1)", offset: 1 }], loop),
    // the name of each step, underneath
    ...all(".scan-step").map((step, i) => during(step, STEPS[i][0], STEPS[i][1],
      { opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" })),
  ];
}

function stopScan() {
  scanAnims.forEach((anim) => anim.cancel());
  scanAnims = [];
}

// ---------------- the chosen video's own frames ----------------
// Once a video is picked, the filmstrip and the short that rises out of it
// show that video, read here in the browser before anything uploads, so it's
// plain which video is about to go. Frames arrive one by one as they're
// decoded. A format the browser can't play keeps the demo frames.

const SCAN_DEFAULTS = { tag: "", length: "" };
let ownFrames = [];          // object URLs of drawn frames, freed on the next pick
let framesWanted = 0;        // a newer pick makes an older one stop

const shortClock = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};

function demoFrames() {
  buildScan();
  for (const frame of document.querySelectorAll(".scan-clip .clip-frame")) frame.style.backgroundImage = "";
  $("scan-tag-text").textContent = SCAN_DEFAULTS.tag;
  $("scan-length").textContent = SCAN_DEFAULTS.length;
}

function once(target, name, ms) {
  return new Promise((resolve, reject) => {
    const done = (ok) => () => {
      clearTimeout(timer);
      target.removeEventListener(name, pass);
      target.removeEventListener("error", fail);
      (ok ? resolve : reject)();
    };
    const pass = done(true), fail = done(false);
    const timer = setTimeout(fail, ms);
    target.addEventListener(name, pass);
    target.addEventListener("error", fail);
  });
}

// One frame of the playing position, cropped to `aspect` (width / height) from the middle.
function grabFrame(video, aspect, height) {
  const canvas = document.createElement("canvas");
  canvas.height = height;
  canvas.width = Math.round(height * aspect);
  const vw = video.videoWidth, vh = video.videoHeight;
  const sw = Math.min(vw, vh * aspect), sh = Math.min(vh, vw / aspect);
  canvas.getContext("2d").drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}

async function showOwnFrames(file, wanted) {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  const url = URL.createObjectURL(file);
  video.src = url;
  try {
    await once(video, "loadeddata", 8000);
    const length = video.duration;
    if (!Number.isFinite(length) || !video.videoWidth) throw new Error("no picture");
    // The strip, left to right, then the short's two shots: the setup and the
    // payoff, where the strip's stitch marks sit.
    const shots = [
      ...Array.from({ length: FILM_FRAMES }, (_, i) => ({ at: length * (i + 0.5) / FILM_FRAMES, film: i })),
      { at: length * 0.08, card: ".clip-setup" }, { at: length * 0.79, card: ".clip-payoff" },
    ];
    for (const shot of shots) {
      if (wanted !== framesWanted) return;
      video.currentTime = shot.at;
      await once(video, "seeked", 5000);
      const blob = await grabFrame(video, shot.card ? 9 / 16 : 16 / 9, shot.card ? 360 : 144);
      if (!blob || wanted !== framesWanted) return;
      const src = URL.createObjectURL(blob);
      ownFrames.push(src);
      if (shot.card) {
        document.querySelector(`.scan-clip ${shot.card}`).style.backgroundImage = `url(${src})`;
      } else {
        for (const strip of document.querySelectorAll(".film-dim, .film-lit")) {
          const tile = strip.children[shot.film];
          tile.style.backgroundImage = `url(${src})`;
          tile.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 320, easing: "ease-out" });
        }
      }
    }
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

function watchChosenFile() {
  SCAN_DEFAULTS.tag = $("scan-tag-text").textContent;
  SCAN_DEFAULTS.length = $("scan-length").textContent;
  document.addEventListener("clipsy:file", ({ detail }) => {
    const wanted = ++framesWanted;
    ownFrames.forEach((src) => URL.revokeObjectURL(src));
    ownFrames = [];
    demoFrames();
    if (!detail.file) return;
    // The demo's own times would read like a result for this video; say what it shows instead.
    $("scan-tag-text").textContent = "Stitched · setup + payoff";
    if (detail.seconds) $("scan-length").textContent = shortClock(detail.seconds);
    showOwnFrames(detail.file, wanted).catch(() => { if (wanted === framesWanted) demoFrames(); });
  });
}

// app.js shows and fills <progress> while uploading; mirror it on the filmstrip.
function watchUpload() {
  const progress = $("upload-progress");
  const card = $("upload");
  new MutationObserver(() => {
    const sending = !progress.hidden;
    card.classList.toggle("sending", sending);
    if (sending) {
      const percent = (progress.value / progress.max) * 100;
      card.style.setProperty("--sent", `${percent}%`);
      $("scan-sent").textContent = `Uploading ${Math.round(percent)}%`;
      if (scanAnims.length) stopScan();
    } else {
      card.style.removeProperty("--sent");
      $("scan-sent").textContent = "";
      if (!scanAnims.length) startScan();
    }
  }).observe(progress, { attributes: true, attributeFilter: ["hidden", "value"] });
}

// ---------------- the glass dropdown ----------------
// Replaces a <select> on screen but keeps it as the source of truth: app.js
// fills it, reads its value, and never knows the difference.

const GLOBE = '<svg class="gsel-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.3 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.3-3.4-8.5s1-6.1 3.4-8.5z"/></svg>';
const CHEVRON = '<svg class="gsel-chev" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg>';
const CHECK = '<svg class="gsel-check" viewBox="0 0 24 24"><path d="M5.5 12.5l4 4 9-9.5"/></svg>';

function glassSelect(select) {
  const labelId = select.getAttribute("aria-labelledby");
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "gsel";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-labelledby", `${labelId} ${select.id}-value`);
  trigger.innerHTML = `${GLOBE}<span class="gsel-value" id="${select.id}-value"></span>${CHEVRON}`;
  const valueBox = trigger.querySelector(".gsel-value");

  const menu = document.createElement("div");
  menu.className = "gsel-menu";
  menu.id = `${select.id}-menu`;
  menu.tabIndex = -1;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-labelledby", labelId);
  trigger.setAttribute("aria-controls", menu.id);
  const highlight = document.createElement("span");
  highlight.className = "gsel-hl";

  select.hidden = true;
  select.after(trigger);
  document.body.append(menu);

  let items = [];
  let active = -1;
  let open = false;

  function build() {
    items = [...select.options].map((option, i) => {
      const item = document.createElement("div");
      item.className = "gsel-opt";
      item.id = `${menu.id}-${i}`;
      item.style.setProperty("--i", i);
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.innerHTML = CHECK;
      item.append(option.textContent);
      if (option.value !== "auto") {
        const code = document.createElement("span");
        code.className = "gsel-code";
        code.textContent = option.value;
        item.append(code);
      }
      item.onpointermove = () => { if (active !== i) setActive(i, false); };
      item.onclick = () => choose(i);
      return item;
    });
    menu.replaceChildren(highlight, ...items);
    showValue(false);
  }

  // The new value rolls up into place as the old one rolls out.
  function showValue(animate) {
    const text = select.selectedOptions[0] ? select.selectedOptions[0].textContent : "";
    const old = valueBox.lastElementChild;
    if (old && old.textContent === text) return;
    const next = document.createElement("span");
    next.textContent = text;
    if (!animate || !old) { valueBox.replaceChildren(next); return; }
    next.className = "coming";
    valueBox.append(next);
    void next.offsetWidth;
    next.className = "";
    old.classList.add("leaving");
    setTimeout(() => old.remove(), 550);
  }

  function setActive(i, scroll = true) {
    active = i;
    const item = items[i];
    menu.setAttribute("aria-activedescendant", item.id);
    highlight.style.opacity = "1";
    highlight.style.transform = `translateY(${item.offsetTop}px)`;
    highlight.style.height = `${item.offsetHeight}px`;
    if (scroll) item.scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    const changed = select.selectedIndex !== i;
    select.selectedIndex = i;
    items.forEach((item, k) => item.setAttribute("aria-selected", String(k === i)));
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
    showValue(true);
    close();
  }

  // Below the button, or above it when there is no room below.
  function place() {
    const box = trigger.getBoundingClientRect();
    const height = menu.offsetHeight;
    const up = box.bottom + 10 + height > innerHeight - 12 && box.top - 10 - height > 12;
    menu.classList.toggle("up", up);
    menu.style.left = `${Math.max(12, Math.min(box.left, innerWidth - menu.offsetWidth - 12))}px`;
    menu.style.top = `${up ? box.top - 10 - height : box.bottom + 10}px`;
  }

  function show() {
    if (open || !items.length) return;
    open = true;
    place();
    highlight.style.transition = "none";
    setActive(Math.max(0, select.selectedIndex));
    void highlight.offsetWidth;
    highlight.style.transition = "";
    menu.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    menu.focus({ preventScroll: true });
    document.addEventListener("pointerdown", outside, true);
    addEventListener("scroll", place, { passive: true });
    addEventListener("resize", hide);
  }

  function close(refocus = true) {
    if (!open) return;
    open = false;
    menu.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    menu.removeAttribute("aria-activedescendant");
    document.removeEventListener("pointerdown", outside, true);
    removeEventListener("scroll", place);
    removeEventListener("resize", hide);
    if (refocus) trigger.focus({ preventScroll: true });
  }
  const hide = () => close(false);

  function outside(event) {
    if (!menu.contains(event.target) && !trigger.contains(event.target)) close(false);
  }

  trigger.onclick = () => (open ? close() : show());
  trigger.onkeydown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); }
  };
  menu.onkeydown = (event) => {
    const last = items.length - 1;
    const moves = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
    } else if (event.key.length === 1) {
      // Typing a letter jumps to the next language starting with it.
      const letter = event.key.toLowerCase();
      const order = items.map((_, k) => (active + 1 + k) % items.length);
      const found = order.find((k) => items[k].textContent.trim().toLowerCase().startsWith(letter));
      if (found !== undefined) setActive(found);
    }
  };

  new MutationObserver(build).observe(select, { childList: true });
  build();
  return { close: hide };
}

// ---------------- light and dark ----------------
// The <head> already picked the theme (a saved choice, else the system's).
// Switching opens the new theme as a circle growing from the button.

function startTheme() {
  const root = document.documentElement;
  const button = $("theme-toggle");
  const apply = (theme) => {
    root.dataset.theme = theme;
    button.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
  };
  apply(root.dataset.theme);

  button.onclick = () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem("clipsy-theme", next); } catch (e) { /* not saved; still switches */ }
    if (calm || !document.startViewTransition) return apply(next);
    const box = button.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(() => apply(next)).ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 750, easing: "cubic-bezier(.22, 1, .36, 1)", pseudoElement: "::view-transition-new(root)" });
    });
  };

  // Until a choice is saved, follow the system as it changes.
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", (event) => {
    let saved = null;
    try { saved = localStorage.getItem("clipsy-theme"); } catch (e) { /* treat as unsaved */ }
    if (!saved) apply(event.matches ? "light" : "dark");
  });
}

// ---------------- pointer, scroll and the frame loop ----------------
// One requestAnimationFrame loop eases everything that follows the pointer or
// the scroll, and stops itself once everything has settled.

const pointer = { x: innerWidth / 2, y: innerHeight / 2, active: false };
const eased = { x: pointer.x, y: pointer.y, px: 0, py: 0, tx: 0, ty: 0, mx: 0, my: 0 };
let running = false;

function wake() {
  if (!running && !calm) {
    running = true;
    requestAnimationFrame(frame);
  }
}

function frame() {
  const home = onHome();
  let busy = false;
  const ease = (key, target, amount) => {
    const gap = target - eased[key];
    if (Math.abs(gap) > 0.001) busy = true;
    eased[key] += gap * amount;
  };

  // The soft light under the pointer.
  ease("x", pointer.x, 0.14);
  ease("y", pointer.y, 0.14);
  aura.style.transform = `translate3d(${eased.x}px, ${eased.y}px, 0)`;

  // The walls lean a little toward the pointer.
  ease("px", pointer.active ? pointer.x / innerWidth * 2 - 1 : 0, 0.05);
  ease("py", pointer.active ? pointer.y / innerHeight * 2 - 1 : 0, 0.05);
  for (const side of sides) {
    side.style.setProperty("--px", eased.px.toFixed(4));
    side.style.setProperty("--py", eased.py.toFixed(4));
  }

  // The drop window tips toward the pointer while it is over it.
  const left = spots.card.left - scrollX;
  const top = spots.card.top - scrollY;
  const over = pointer.active && pointer.x >= left && pointer.x <= left + spots.card.width &&
               pointer.y >= top && pointer.y <= top + spots.card.height;
  const dx = over ? (pointer.x - left) / spots.card.width - 0.5 : 0;
  const dy = over ? (pointer.y - top) / spots.card.height - 0.5 : 0;
  ease("tx", dx, 0.08);
  ease("ty", dy, 0.08);
  const angle = Math.hypot(eased.tx, eased.ty) * 5;
  card.style.rotate = angle > 0.01 ? `${-eased.ty} ${eased.tx} 0 ${angle.toFixed(3)}deg` : "";
  sheen.style.setProperty("--mx", `${pointer.x - left}px`);
  sheen.style.setProperty("--my", `${pointer.y - top}px`);

  // The upload button leans toward a pointer that comes near it.
  const bx = pointer.x - (spots.button.left - scrollX + spots.button.width / 2);
  const by = pointer.y - (spots.button.top - scrollY + spots.button.height / 2);
  const near = pointer.active && !button.disabled && Math.hypot(bx, by) < 90;
  ease("mx", near ? bx * 0.16 : 0, 0.12);
  ease("my", near ? by * 0.22 : 0, 0.12);
  button.style.translate = `${eased.mx.toFixed(2)}px ${eased.my.toFixed(2)}px`;

  // Hovering a column brings it to rest; behind the veil the walls drift slower.
  for (const wall of walls) {
    const target = wall.hovered ? 0 : (veiled ? 0.4 : 1);
    const gap = target - wall.rate;
    if (Math.abs(gap) > 0.003) {
      busy = true;
      wall.rate += gap * 0.07;
      wall.anim.updatePlaybackRate(wall.rate);
    }
  }

  if (busy && home) requestAnimationFrame(frame);
  else running = false;
}

const aura = $("aura");
const card = $("upload");
const sheen = card.querySelector(".drop-sheen");
const button = $("upload-button");
const sides = [...document.querySelectorAll(".reel-side")];

// Where the drop window and the button sit on the page. Measured when the
// layout changes, never in the frame loop: measuring there would force the
// browser to lay the page out again every frame. Offsets ignore the tilt and
// the button's lean, so neither feeds back into itself.
const spots = { card: { left: 0, top: 0, width: 1, height: 1 }, button: { left: 0, top: 0, width: 1, height: 1 } };

function pagePosition(el) {
  let left = 0;
  let top = 0;
  for (let node = el; node; node = node.offsetParent) {
    left += node.offsetLeft;
    top += node.offsetTop;
  }
  return { left, top, width: el.offsetWidth || 1, height: el.offsetHeight || 1 };
}

function measureSpots() {
  if (!onHome()) return;
  spots.card = pagePosition(card);
  spots.button = pagePosition(button);
}

function watchPointer() {
  if (!mouse || calm) return;
  new ResizeObserver(measureSpots).observe(document.body);
  addEventListener("resize", measureSpots);
  addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
    document.body.classList.add("pointer");
    wake();
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { pointer.active = false; wake(); });
}

// ---------------- dropping a file anywhere on the page ----------------
// The drop zone already accepts files (app.js); this lets the whole home
// screen accept them too, and stops a stray drop from opening the video in
// the browser tab instead.

function watchDragging() {
  const withFiles = (event) => event.dataTransfer && [...event.dataTransfer.types].includes("Files");
  let ended = 0;
  addEventListener("dragover", (event) => {
    if (!withFiles(event)) return;
    event.preventDefault();
    if (!onHome()) { event.dataTransfer.dropEffect = "none"; return; }
    document.body.classList.add("dragging");
    clearTimeout(ended);
    ended = setTimeout(() => document.body.classList.remove("dragging"), 150);
  });
  addEventListener("drop", (event) => {
    if (!withFiles(event)) return;
    event.preventDefault();
    document.body.classList.remove("dragging");
    if (!onHome() || $("drop").contains(event.target)) return;
    const input = $("file");
    input.files = event.dataTransfer.files;
    input.dispatchEvent(new Event("change"));
  });
}

// ---------------- below the hero ----------------
// Scrolling past the hero, a tint (the veil) fades in over the walls with the
// scroll, and a third of the way in the walls blur, once, at a fixed strength
// (home.css). Changing a blur's strength every frame is what made scrolling
// stutter. Once veiled, the walls' captions and video pause (nothing could be
// read through the blur) and they drift slower. Scrolling back up undoes it.

let veiled = false;
let veilShown = -1;
let introHeight = innerHeight;
const veil = $("veil");

const measureIntro = () => { if (onHome()) introHeight = $("intro").offsetHeight || innerHeight; };

function updateVeil() {
  if (!onHome()) return;
  const amount = Math.min(1, Math.max(0, (scrollY - introHeight * 0.3) / (introHeight * 0.45)));
  if (Math.abs(amount - veilShown) < 0.01) return;
  veilShown = amount;
  veil.style.opacity = amount.toFixed(3);
  veil.style.visibility = amount > 0 ? "visible" : "hidden";
  const nowVeiled = amount > 0.35;
  if (nowVeiled === veiled) return;
  veiled = nowVeiled;
  document.body.classList.toggle("veiled", veiled);
  if (veiled) pauseVideos(walls);
  else playVideos();
  wake();
}

function watchVeil() {
  let queued = false;
  addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; updateVeil(); });
  }, { passive: true });
  addEventListener("resize", () => { measureIntro(); updateVeil(); });
}

// ---------------- scrolling ----------------
// The wheel moves a target and the page glides to it, a little each frame, so
// a notchy wheel, a fine high-resolution one and a trackpad all scroll the same
// controlled way, at the same pace on a 60 Hz or a 144 Hz screen. One wheel
// event never moves the target more than MAX_STEP. The keyboard, the scrollbar,
// touch, Ctrl+wheel zoom and anything that scrolls inside the page (the
// language menu, the transcript) keep the browser's own scrolling.

const MAX_STEP = 220;          // pixels one wheel event may add
const GLIDE = 0.12;            // share of the remaining distance covered per 60 Hz frame
const TOP_SPEED = 2400;        // pixels a second the page never glides faster than
const scroller = { target: scrollY, current: scrollY, running: false, last: 0 };

function scrollsInside(node, down) {
  for (; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if (node.scrollHeight <= node.clientHeight) continue;
    if (!/(auto|scroll)/.test(getComputedStyle(node).overflowY)) continue;
    if (down ? node.scrollTop + node.clientHeight < node.scrollHeight - 1 : node.scrollTop > 0) return true;
  }
  return false;
}

function onWheel(event) {
  if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  if (scrollsInside(event.target, event.deltaY > 0)) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
  const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, event.deltaY * unit));
  if (!scroller.running) scroller.current = scroller.target = scrollY;
  scrollToY(scroller.target + step);
}

function scrollToY(y) {
  const bottom = document.documentElement.scrollHeight - innerHeight;
  scroller.target = Math.max(0, Math.min(bottom, y));
  if (scroller.running) return;
  scroller.running = true;
  scroller.current = scrollY;
  scroller.last = performance.now();
  requestAnimationFrame(glide);
}

function glide(now) {
  const elapsed = Math.min(64, now - scroller.last);
  scroller.last = now;
  const share = 1 - Math.pow(1 - GLIDE, elapsed / (1000 / 60));
  const most = TOP_SPEED * elapsed / 1000;
  scroller.current += Math.max(-most, Math.min(most, (scroller.target - scroller.current) * share));
  if (Math.abs(scroller.target - scroller.current) < 0.5) scroller.current = scroller.target;
  window.scrollTo(0, scroller.current);
  if (scroller.current !== scroller.target) requestAnimationFrame(glide);
  else scroller.running = false;
}

function watchWheel() {
  addEventListener("wheel", onWheel, { passive: false });
  // Scrolling some other way (keys, scrollbar) or changing screen: start from there.
  const settle = () => { if (!scroller.running) scroller.target = scroller.current = scrollY; };
  addEventListener("scroll", settle, { passive: true });
  addEventListener("hashchange", () => { scroller.target = scroller.current = scrollY; });
}

// ---------------- the bar ----------------

function startBar() {
  // "Your videos" and "Pricing" scroll the home screen to their section.
  for (const link of document.querySelectorAll(".nav-link[data-section]")) {
    link.onclick = (event) => {
      if (!onHome()) { wantSection = link.dataset.section; return; }   // the link takes us home first
      event.preventDefault();
      showSection(link.dataset.section);
    };
  }
}

let wantSection = null;
const showSection = (id) => scrollToY($(id).getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle($(id)).scrollMarginTop || 0));

// ---------------- pricing ----------------
// The plans rise in when the section is reached, the prices and minutes count
// up to their figures, and each plan's minutes bar fills to its share.

function watchPricing() {
  const section = $("pricing");
  const numbers = [...section.querySelectorAll("[data-count]")];
  const seen = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    seen.disconnect();
    section.classList.add("seen");
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 1400);
      const eased = 1 - Math.pow(1 - t, 4);
      for (const number of numbers) {
        number.textContent = Math.round(Number(number.dataset.count) * eased).toLocaleString("en-US");
      }
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: 0.25 });
  seen.observe(section);
}

// ---------------- start ----------------

let menu = null;
let launched = false;         // the opening plays once, the first time home shows

function onScreen() {
  const home = onHome();
  walls.forEach((wall) => (home && !wall.col.hidden ? wall.anim.play() : wall.anim.pause()));
  if (home) playVideos();
  else pauseVideos(walls);
  if (!home && menu) menu.close();
  if (home) {
    wake();
    document.fonts.ready.then(() => { measureRotator(); measureSpots(); measureIntro(); updateVeil(); });
    if (!launched) {
      launched = true;
      setTimeout(() => document.body.classList.add("entered"), 2600);
      // The opening, one thing at a time: the walls slide in, the captions
      // start talking, the inner columns bow out, then the first video plays.
      picturesReady().then(() => {
        bringInColumns();
        setTimeout(startTalking, arrivedMs());
        setTimeout(retireInner, arrivedMs() + 600);
        setTimeout(() => { settled = true; playVideos(); }, arrivedMs() + 2600);
      });
    }
    if (wantSection) {
      const id = wantSection;
      wantSection = null;
      requestAnimationFrame(() => showSection(id));
    }
  }
}

startTheme();
buildWalls();
startRotator();
buildScan();
startScan();
watchUpload();
watchChosenFile();
watchPointer();
watchDragging();
startBar();
watchPricing();
watchVeil();
watchWheel();
new MutationObserver(onScreen).observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
onScreen();
