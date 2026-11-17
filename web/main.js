// "Recent first": session rows in the groups of the list on the left, by latest activity (a change of the session's
// feed, timeline_rev from the snapshot: it grows with every step, reply, message). It does not change the hub code: the
// sidebar.session place marks the row with the session, and CSS order inside the group sets the order (the ul is a flex
// column). Executors under an agent come right after it.
let snapRef = null, queued = false;
// reorder at most once every REORDER_MS (rows used to jump on every step of any session). In between, the hub redraws
// the list with new rows: they get the remembered order; a row new to the group takes its place by its activity at
// once, the others do not move; whatever has built up waits for one timer for the rest of the period
const REORDER_MS = 10000;
const places = new Map();    // group → row names in order since the last reorder
let sortedAt = -Infinity, timer = 0;
// rows slide to their new place in 150 ms (FLIP), in all themes; with "reduce motion" in the system, without movement
const lastTop = new Map();   // session name → where the row stood (relative to its group) after the last sort
const moving = new Map();    // name → {delta, t0}: a slide in progress; the hub redraws the list on every snapshot and
                             // the rows are new, so the animation continues on the new row from the same point, not lost
const DUR = 150;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function slide(ul, named) {
  if (!ul.offsetParent) return;   // the group is folded: positions are remembered once it is opened
  const base = ul.getBoundingClientRect().top, now = performance.now();
  for (const [li, n] of named) {
    const top = li.getBoundingClientRect().top - base, was = lastTop.get(n);
    lastTop.set(n, top);
    if (still()) continue;
    if (was !== undefined && Math.abs(was - top) >= 1) moving.set(n, { delta: was - top, t0: now });
    const m = moving.get(n);
    if (!m) continue;
    if (now - m.t0 >= DUR) { moving.delete(n); continue; }
    if (li.getAnimations().length) continue;
    const a = li.animate([{ transform: `translateY(${m.delta}px)` }, { transform: "none" }], { duration: DUR, easing: "ease-out" });
    a.currentTime = now - m.t0;
  }
}

function act(name) { return (snapRef?.timeline_rev || {})[name] || 0; }
// an agent goes by the freshest of itself and its executors (raised_by), even if their list is folded
const score = (name) => Math.max(act(name), ...(snapRef?.sessions || []).filter((x) => x.raised_by === name).map((x) => act(x.name)));
const groupOf = (ul) => { const box = ul.parentElement; return box.dataset.g ?? (box.dataset.sec ? "sec:" + box.dataset.sec : "bare"); };

function sortGroups() {
  queued = false;
  const now = performance.now(), due = now - sortedAt >= REORDER_MS;
  let moved = false, stale = false;
  // first the order in all groups, then the slides: reading a row's position after writing order lays out the whole
  // page, once per group (~6 layouts per snapshot, 0.65 s out of 30); this way, once
  const slides = [];
  for (const ul of document.querySelectorAll("#list .sgroup > ul")) {
    ul.classList.add("sact-flex");
    const rows = [...ul.children].filter((li) => !li.classList.contains("forks"));
    const named = rows.map((li) => [li, li.querySelector("[data-sact]")?.dataset.sact]).filter(([, n]) => n);
    const sc = new Map(named.map(([, n]) => [n, score(n)]));
    const fresh = [...sc.keys()].sort((a, b) => sc.get(b) - sc.get(a));
    const key = groupOf(ul), was = (places.get(key) || []).filter((n) => sc.has(n));
    let order = fresh;
    if (!due) {
      order = [...was];
      for (const n of fresh) {
        if (order.includes(n)) continue;
        const at = order.findIndex((m) => sc.get(m) < sc.get(n));
        order.splice(at < 0 ? order.length : at, 0, n);
      }
      if (order.join("\n") !== fresh.join("\n")) stale = true;
    } else if (was.join("\n") !== fresh.join("\n")) moved = true;   // reordered: the next one not before the period ends
    places.set(key, order);
    const place = new Map(order.map((n, i) => [n, i]));
    for (const [li, n] of named) {
      const i = place.get(n);
      li.style.order = String(i * 2);
      const next = li.nextElementSibling;
      if (next?.classList.contains("forks")) next.style.order = String(i * 2 + 1);
    }
    slides.push([ul, named]);
  }
  for (const [ul, named] of slides) slide(ul, named);
  if (moved) sortedAt = now;
  if (stale && !timer) timer = setTimeout(() => { timer = 0; sortGroups(); }, sortedAt + REORDER_MS - now);
}

export default function register(hub) {
  hub.addStyle("web/style.css");
  hub.addSlot("sidebar.session", {
    id: "recent-first",
    order: 999,
    render(root, snap, ctx) {
      snapRef = snap;
      root.dataset.sact = ctx.session.name;
      root.classList.add("sact-mark");
      if (!queued) { queued = true; requestAnimationFrame(sortGroups); }
    },
  });
}
