// «Свежие сверху»: строки сессий в группах списка слева — по последней активности (правка ленты сессии, timeline_rev
// из снимка: растёт при каждом шаге, ответе, сообщении). Код хаба не меняет: место sidebar.session метит строку
// сессией, а порядок задаёт CSS order в группе (ul — flex-колонка). Исполнители под агентом идут сразу за ним.
let snapRef = null, queued = false;

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
