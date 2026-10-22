// «Свежие сверху»: строки сессий в группах списка слева — по последней активности (правка ленты сессии, timeline_rev
// из снимка: растёт при каждом шаге, ответе, сообщении). Код хаба не меняет: место sidebar.session метит строку
// сессией, а порядок задаёт CSS order в группе (ul — flex-колонка). Исполнители под агентом идут сразу за ним.
let snapRef = null, queued = false;
// пересортировка — не чаще раза в REORDER_MS (владелец: строки прыгали на каждом шаге любой сессии). Между ними хаб
// перерисовывает список новыми строками — на них ставим запомненный порядок; новая в группе строка встаёт по своей
// активности сразу, остальные не двигаются; накопилось — один таймер на остаток срока
const REORDER_MS = 10000;
const places = new Map();    // группа → имена строк по порядку с прошлой пересортировки
let sortedAt = -Infinity, timer = 0;
// сдвиг строк на новое место за 150 мс (FLIP), во всех темах; при «меньше анимации» в системе — без движения
const lastTop = new Map();   // имя сессии → где строка стояла (относительно своей группы) после прошлой сортировки
const moving = new Map();    // имя → {delta, t0}: сдвиг идёт; хаб перерисовывает список на каждом снимке и строки
                             // новые — анимацию продолжаем на новой строке с того же места, а не теряем
const DUR = 150;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function slide(ul, named) {
  if (!ul.offsetParent) return;   // группа свёрнута — запомним места, когда раскроют
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
// агент — по самому свежему из него и его исполнителей (raised_by), даже если их список свёрнут
const score = (name) => Math.max(act(name), ...(snapRef?.sessions || []).filter((x) => x.raised_by === name).map((x) => act(x.name)));
const groupOf = (ul) => { const box = ul.parentElement; return box.dataset.g ?? (box.dataset.sec ? "sec:" + box.dataset.sec : "bare"); };

function sortGroups() {
  queued = false;
  const now = performance.now(), due = now - sortedAt >= REORDER_MS;
  let moved = false, stale = false;
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
    } else if (was.join("\n") !== fresh.join("\n")) moved = true;   // переставили — следующая не раньше чем через срок
    places.set(key, order);
    const place = new Map(order.map((n, i) => [n, i]));
    for (const [li, n] of named) {
      const i = place.get(n);
      li.style.order = String(i * 2);
      const next = li.nextElementSibling;
      if (next?.classList.contains("forks")) next.style.order = String(i * 2 + 1);
    }
    slide(ul, named);
  }
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
