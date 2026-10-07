// «Свежие сверху»: строки сессий в группах списка слева — по последней активности (правка ленты сессии, timeline_rev
// из снимка: растёт при каждом шаге, ответе, сообщении). Код хаба не меняет: место sidebar.session метит строку
// сессией, а порядок задаёт CSS order в группе (ul — flex-колонка). Исполнители под агентом идут сразу за ним.
let snapRef = null, queued = false;
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

function sortGroups() {
  queued = false;
  for (const ul of document.querySelectorAll("#list .sgroup > ul")) {
    ul.classList.add("sact-flex");
    const rows = [...ul.children].filter((li) => !li.classList.contains("forks"));
    const named = rows.map((li) => [li, li.querySelector("[data-sact]")?.dataset.sact]).filter(([, n]) => n);
    // агент с исполнителями — по самому свежему из них
    // агент — по самому свежему из него и его исполнителей (raised_by), даже если их список свёрнут
    const score = (li, name) => Math.max(act(name), ...(snapRef?.sessions || []).filter((x) => x.raised_by === name).map((x) => act(x.name)));
    named.map(([li, n]) => [li, score(li, n)]).sort((a, b) => b[1] - a[1]).forEach(([li], i) => {
      li.style.order = String(i * 2);
      const next = li.nextElementSibling;
      if (next?.classList.contains("forks")) next.style.order = String(i * 2 + 1);
    });
    slide(ul, named);
  }
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
