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
  // сначала порядок во всех группах, потом сдвиги: чтение места строки после записи order — раскладка всей страницы,
  // по одной на группу (23.10: ~6 раскладок на снимок, 0,65 с из 30); так — одна
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
    } else if (was.join("\n") !== fresh.join("\n")) moved = true;   // переставили — следующая не раньше чем через срок
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
  followTop(topOf());
  if (moved) sortedAt = now;
  if (stale && !timer) timer = setTimeout(() => { timer = 0; sortGroups(); }, sortedAt + REORDER_MS - now);
}

// ── «Открывать новое» (1.3.0): страница сама открывает сессию, которая по этой сортировке встала на первое место списка.
// Включается кнопкой в шапке сессии или галочкой в «Настройки → Вид»; хранится в браузере (hub.opt.<плагин>), по умолчанию выключено.
// Не переходит, пока владельцу мешать нельзя (текст в поле ввода, диалог, недавний клик/прокрутка/клавиши в поле, скрытая вкладка; фокус в поле и открытые карточки не мешают) —
// переходит, когда станет можно, если сессия всё ещё сверху. Открытая и «старая при загрузке» сессии не в счёт.
const QUIET_MS = 20000;    // после клика, прокрутки, клавиши, колеса — столько тишины до перехода
const GAP_MS = 30000;      // не чаще одного перехода за это время (защита от зацикливания)
const LOAD_MS = 10000;     // страница только загрузилась: список ещё складывается, запоминаем верх, не переходим
let hubRef = null, prevTop, pending = null, lastGo = -Infinity, lastAct = -Infinity, ours = "", watch = 0;
const ME = decodeURIComponent((new URL(import.meta.url).pathname.match(/\/ext\/([^/]+)\//) || [])[1] || "recent-first");
const enabled = () => !!hubRef?.option("auto");
const openName = () => { const m = location.hash.match(/^#\/s\/([^?]+)/); return m ? decodeURIComponent(m[1]) : ""; };
let waitWhy = "";   // почему переход откладывается сейчас («» — не ждём)
function paint(b) {
  const on = enabled();
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", String(on));
  b.title = on ? (waitWhy ? `Жду: ${waitWhy}. ` : "") + "Страница сама открывает сессию, которая встала на первое место списка. Нажмите, чтобы выключить"
    : "Включить: страница сама откроет сессию, которая встанет на первое место списка";
}
function setWhy(why) {
  if (why === waitWhy) return;
  waitWhy = why;
  for (const b of document.querySelectorAll(".sact-auto")) paint(b);
}
function setEnabled(on) {   // та же запись, что у галочки «Вид»: hub.opt.<плагин>
  try { localStorage.setItem(`hub.opt.${ME}`, JSON.stringify({ ...JSON.parse(localStorage.getItem(`hub.opt.${ME}`) || "{}"), auto: on })); } catch { /* нет хранилища */ }
  pending = null;
  prevTop = topOf();   // включили — верх на этот момент не «новый»
  hubRef.redraw();
}
// первая видимая строка списка по порядку страницы (группы сверху вниз, внутри — как расставил плагин); хаб-строка закреплена и не в счёт
function topOf() {
  const hubName = (snapRef?.sessions || []).find((s) => s.kind === "hub")?.name;
  for (const ul of document.querySelectorAll("#list .sgroup > ul")) {
    if (!ul.offsetParent) continue;   // свёрнутая группа — не «верх списка»
    const names = (places.get(groupOf(ul)) || []).filter((n) => n !== hubName);
    const rows = new Set([...ul.querySelectorAll("[data-sact]")].map((x) => x.dataset.sact));
    const n = names.find((x) => rows.has(x));
    if (n) return n;
  }
  return undefined;
}
// владельцу сейчас нельзя мешать: пустая строка — можно
function busy() {
  if (document.visibilityState !== "visible") return "вкладка скрыта";
  if (performance.now() - lastAct < QUIET_MS) return "недавно кликал или прокручивал";
  if (document.querySelector("dialog[open]")) return "открыт диалог";
  const h = location.hash;
  if (h && !h.startsWith("#/s/")) return "открыт не чат (настройки, вид плагина)";
  const ta = document.querySelector("main textarea");   // фокус в поле не мешает (страница сама ставит его при открытии сессии), мешает только набранный текст
  if (ta && ta.value.trim()) return "в поле ввода набран текст";
  return "";
}
function followTop(top) {
  if (top === undefined) return;
  if (prevTop === undefined || performance.now() < LOAD_MS) prevTop = top;
  else if (top !== prevTop) { prevTop = top; if (enabled()) pending = top; }
  attempt();
}
function attempt() {
  if (!pending) return clearInterval(watch), watch = 0, setWhy("");
  if (!enabled() || pending !== prevTop || pending === openName() || !(snapRef?.sessions || []).some((s) => s.name === pending)) { pending = null; return attempt(); }
  if (!watch) watch = setInterval(attempt, 1000);   // ждём, пока станет можно, без нового снимка
  const why = busy() || (performance.now() - lastGo < GAP_MS ? "только что был переход" : "");
  setWhy(why);
  if (why) return;
  lastGo = performance.now();
  ours = "#/s/" + encodeURIComponent(pending);
  pending = null;
  location.hash = ours;   // как go() хаба
}

export default function register(hub) {
  hub.addStyle("web/style.css");
  hubRef = hub;
  hub.addOptions({
    title: "Свежие сверху",
    options: [{ key: "auto", label: "Открывать новое: переходить на сессию, которая встала на первое место списка",
      hint: "Не переходит, пока в поле набран текст и сразу после клика или прокрутки — позже, если она всё ещё сверху", on: false }],
  });
  // тишина после прокрутки, клика и клавиш в поле ввода; клавиши вне поля (горячие клавиши страницы) тишины не просят
  for (const ev of ["wheel", "pointerdown", "keydown", "touchmove"]) document.addEventListener(ev, (e) => {
    if (ev === "keydown" && !e.target?.closest?.("textarea, input, [contenteditable]")) return;
    lastAct = performance.now();
  }, { capture: true, passive: true });
  // владелец сам открыл другую сессию — это его выбор: ожидавший переход отменяется
  addEventListener("hashchange", () => { if (location.hash !== ours) pending = null; ours = ""; });
  hub.addSlot("session.header", {
    id: "auto-open",
    order: 999,
    render(root) {
      let b = root.querySelector(":scope > .sact-auto");
      if (!b) {
        b = hub.el("button", "btn quiet small sact-auto", "Открывать новое");
        b.type = "button";
        b.addEventListener("click", (e) => { e.stopPropagation(); setEnabled(!enabled()); paint(b); });
        root.append(b);
      }
      paint(b);
    },
  });
  hub.addSlot("sidebar.session", {
    id: "recent-first",
    order: 999,
    render(root, snap, ctx) {
      snapRef = snap;
      root.dataset.sact = ctx.session.name;
      root.classList.add("sact-mark");
      // порядок — в том же кадре, что и новые строки: хаб собирает список и рисует его в задаче, а кадр
      // requestAnimationFrame из неё иногда наступает уже после отрисовки — строки на кадр вставали в порядке хаба
      // и возвращались назад (сдвиг раскладки 0,3 на каждом снимке). Микрозадача — после всей сборки, до отрисовки
      if (!queued) { queued = true; queueMicrotask(sortGroups); }
    },
  });
}
