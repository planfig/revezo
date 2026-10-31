// Dashboard client. Inlined into the page with a CSP nonce. Rules: data goes in with
// textContent only, and dynamic styles only through the CSSOM (element.style), never as
// inline style attributes.
(() => {
  "use strict";
  const T = {
    en: {
      loginTitle: "Sign in", loginHelp: "Use the user and password of this Revezo.", open: "Open",
      firstTitle: "Create your login", firstHelp: "First time here: prove you own this Revezo with the REVEZO_API_KEY (in the .env file) and choose a user and password.",
      resetTitle: "New password", resetHelp: "Forgot the password? Use the REVEZO_API_KEY (in the .env file) to choose a new one.",
      user: "User", password: "Password", newPassword: "New password (at least 10 characters)", repeatPassword: "Repeat the password",
      captcha: "Type the characters in the picture", captchaNew: "Another picture", enter: "Sign in", saveLogin: "Save and sign in",
      forgot: "Forgot the password?", backToLogin: "Back to sign in", locked: "Too many attempts. Try again in {min} min.",
      err_wrong_login: "Wrong user or password.", err_captcha_required: "Type the characters in the picture.", err_captcha_wrong: "The characters do not match. Try the new picture.",
      err_wrong_api_key: "That is not the REVEZO_API_KEY.", err_invalid_user: "User: 3 to 64 letters, digits or . _ @ -", err_weak_password: "The password needs at least 10 characters.",
      err_mismatch: "The two passwords are different.", err_invalid_body: "Something went wrong. Try again.",
      liveTitle: "Live view", liveHelp: "Updates every 3 seconds", clients: "Clients", clientsSub: "your apps", hub: "Hub",
      hubSub: "{routes} routes · {sent} sent today", recent: "Recent attempts", time: "Time", route: "Route", provider: "Provider",
      result: "Result", detail: "Detail", logout: "Sign out", updated: "Updated",
      offline: "Could not reach the server.", today: "Today", month: "Month", noLimit: "no limit",
      st_ok: "free", st_high: "almost full", st_full: "full", st_blocked: "paused by errors until {until}", st_user: "paused by you",
      sent: "sent", skipped_full: "skipped: full", skipped_blocked: "skipped: paused (errors)", skipped_capability: "skipped: not allowed",
      skipped_paused: "skipped: paused by you", failed: "failed", none: "No attempts yet.",
      legOk: "free", legHigh: "80% or more of the limit", legFull: "full or paused by errors", legUser: "paused by you",
      noProviders: "no providers yet", sectorsNav: "Sectors", vstats: "{routes} routes · {apis} APIs · {sent} sent today", vstats1: "1 route · {apis} APIs · {sent} sent today", sentToday: "{n} sent today",
      soonTitle: "No APIs in this sector yet", soonText: "Coming in a future version.",
      sec_email: "E-mail", sec_sms: "SMS", sec_whatsapp: "WhatsApp", sec_llm: "AI (LLM)", sec_scraping: "Scraping", sec_social: "Social posting", sec_search: "Web search",
      hint_sms: "Planned: SMS gateways.", hint_whatsapp: "Planned: WhatsApp Business APIs.", hint_llm: "Planned: OpenRouter, Groq, Ollama.",
      hint_scraping: "Planned: scraping APIs.", hint_social: "Planned: Meta, LinkedIn, Bluesky, Telegram.", hint_search: "Planned: web search APIs.",
      manageTitle: "Manage APIs", fromFile: "from the file", fromPanel: "added here", default: "default",
      priority: "priority", weighted: "by weight", "least-used": "least used", strategy: "Strategy", kind: "Kind",
      up: "Move up", down: "Move down", pause: "Pause", resume: "Resume", edit: "Edit", remove: "Remove", save: "Save", cancel: "Cancel",
      removeRoute: "Remove route", weight: "Weight", perMinute: "Per minute", perHour: "Per hour", perDay: "Per day", perMonth: "Per month",
      marketing: "Allows marketing e-mails", keysSaved: "keys", saved: "saved", missing: "missing",
      confirmRemove: "Remove {name}? Its saved keys are deleted.", confirmRemoveRoute: "Remove route {name}?",
      addTitle: "Add an API", addHelp: "Keys are stored encrypted and never shown again. The hub starts using the new API on the next call.",
      type: "Type", name: "Name (optional)", add: "Add", newRouteTitle: "New route", create: "Create",
      done: "Done.", added: "{name} added. The hub is already using it.", ro_memory_storage: "Read only: counters are kept in memory. Set storage.sqlite in revezo.config.yaml to manage APIs here.",
      ro_no_secrets_key: "Read only: REVEZO_SECRETS_KEY is not set. It encrypts the API keys you add here. Add it to .env and restart.",
      ro_no_api_key: "Read only: the server runs without REVEZO_API_KEY.",
      limitsLine: "{limits} · weight {weight}", perDayShort: "/day", perMonthShort: "/month", perHourShort: "/hour", perMinuteShort: "/min",
    },
    pt: {
      loginTitle: "Entrar", loginHelp: "Use o usuário e a senha deste Revezo.", open: "Abrir",
      firstTitle: "Crie o seu acesso", firstHelp: "Primeira vez: prove que este Revezo é seu com a REVEZO_API_KEY (no arquivo .env) e escolha um usuário e uma senha.",
      resetTitle: "Nova senha", resetHelp: "Esqueceu a senha? Use a REVEZO_API_KEY (no arquivo .env) para escolher outra.",
      user: "Usuário", password: "Senha", newPassword: "Nova senha (mínimo 10 caracteres)", repeatPassword: "Repita a senha",
      captcha: "Digite os caracteres da imagem", captchaNew: "Outra imagem", enter: "Entrar", saveLogin: "Salvar e entrar",
      forgot: "Esqueceu a senha?", backToLogin: "Voltar para entrar", locked: "Tentativas demais. Tente de novo daqui a {min} min.",
      err_wrong_login: "Usuário ou senha errados.", err_captcha_required: "Digite os caracteres da imagem.", err_captcha_wrong: "Os caracteres não conferem. Tente a nova imagem.",
      err_wrong_api_key: "Essa não é a REVEZO_API_KEY.", err_invalid_user: "Usuário: 3 a 64 letras, números ou . _ @ -", err_weak_password: "A senha precisa de pelo menos 10 caracteres.",
      err_mismatch: "As duas senhas são diferentes.", err_invalid_body: "Algo deu errado. Tente de novo.",
      liveTitle: "Ao vivo", liveHelp: "Atualiza a cada 3 segundos", clients: "Clientes", clientsSub: "seus apps", hub: "Hub",
      hubSub: "{routes} rotas · {sent} envios hoje", recent: "Últimas tentativas", time: "Hora", route: "Rota", provider: "Provedor",
      result: "Resultado", detail: "Detalhe", logout: "Sair", updated: "Atualizado",
      offline: "Não foi possível falar com o servidor.", today: "Hoje", month: "Mês", noLimit: "sem limite",
      st_ok: "livre", st_high: "quase cheio", st_full: "cheio", st_blocked: "pausado por erro até {until}", st_user: "pausado por você",
      sent: "enviado", skipped_full: "pulado: cheio", skipped_blocked: "pulado: pausado (erro)", skipped_capability: "pulado: não permitido",
      skipped_paused: "pulado: pausado por você", failed: "falhou", none: "Nenhuma tentativa ainda.",
      legOk: "livre", legHigh: "80% ou mais do limite", legFull: "cheio ou pausado por erro", legUser: "pausado por você",
      noProviders: "nenhum provedor ainda", sectorsNav: "Setores", vstats: "{routes} rotas · {apis} APIs · {sent} envios hoje", vstats1: "1 rota · {apis} APIs · {sent} envios hoje", sentToday: "{n} envios hoje",
      soonTitle: "Ainda sem APIs neste setor", soonText: "Chega numa próxima versão.",
      sec_email: "E-mail", sec_sms: "SMS", sec_whatsapp: "WhatsApp", sec_llm: "IA (LLM)", sec_scraping: "Raspagem (scraping)", sec_social: "Redes sociais", sec_search: "Pesquisa na web",
      hint_sms: "Planejado: gateways de SMS.", hint_whatsapp: "Planejado: APIs do WhatsApp Business.", hint_llm: "Planejado: OpenRouter, Groq, Ollama.",
      hint_scraping: "Planejado: APIs de raspagem.", hint_social: "Planejado: Meta, LinkedIn, Bluesky, Telegram.", hint_search: "Planejado: APIs de pesquisa na web.",
      manageTitle: "Gerir APIs", fromFile: "do arquivo", fromPanel: "do painel", default: "padrão",
      priority: "prioridade", weighted: "por peso", "least-used": "menos usado", strategy: "Estratégia", kind: "Tipo de API",
      up: "Subir", down: "Descer", pause: "Pausar", resume: "Retomar", edit: "Editar", remove: "Remover", save: "Salvar", cancel: "Cancelar",
      removeRoute: "Remover rota", weight: "Peso", perMinute: "Por minuto", perHour: "Por hora", perDay: "Por dia", perMonth: "Por mês",
      marketing: "Permite e-mails de marketing", keysSaved: "chaves", saved: "guardada", missing: "em falta",
      confirmRemove: "Remover {name}? As chaves guardadas são apagadas.", confirmRemoveRoute: "Remover a rota {name}?",
      addTitle: "Adicionar API", addHelp: "As chaves ficam guardadas cifradas e nunca mais aparecem. O hub passa a usar a nova API já na próxima chamada.",
      type: "Provedor", name: "Nome (opcional)", add: "Adicionar", newRouteTitle: "Nova rota", create: "Criar",
      done: "Feito.", added: "{name} adicionado. O hub já está usando.", ro_memory_storage: "Só leitura: os contadores estão só na memória. Ponha storage.sqlite no revezo.config.yaml para gerir as APIs aqui.",
      ro_no_secrets_key: "Só leitura: falta a variável REVEZO_SECRETS_KEY, que cifra as chaves das APIs adicionadas aqui. Acrescente-a ao .env e reinicie.",
      ro_no_api_key: "Só leitura: o servidor está rodando sem REVEZO_API_KEY.",
      limitsLine: "{limits} · peso {weight}", perDayShort: "/dia", perMonthShort: "/mês", perHourShort: "/hora", perMinuteShort: "/min",
      "API key": "Chave da API", "Secret key": "Chave secreta", Port: "Porta", User: "Usuário", Password: "Senha",
      "TLS from the start (port 465)": "TLS desde o início (porta 465)", Model: "Modelo", "Base URL": "Endereço (URL)",
      err_duplicate_name: "Já existe um provedor ou rota com esse nome.",
      err_duplicate_account: "Esta rota já tem uma conta desse provedor. Somar contas grátis do mesmo provedor viola os termos dele.",
      err_from_file: "Isto vem do revezo.config.yaml: mude lá.", err_read_only: "O painel está só de leitura.",
      err_invalid_name: "Nome inválido: use letras, números, - _ ou . (até 48).", err_not_empty: "Remova primeiro os provedores da rota.",
      err_missing_option: "Falta preencher um campo obrigatório.", err_invalid_limits: "Limites inválidos: use números inteiros.",
      err_invalid_weight: "O peso tem de ser maior que 0 e até 1000.",
    },
  };
  const lang = (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
  const t = (k, vars) => {
    let s = T[lang][k] ?? T.en[k] ?? k;
    if (vars) for (const [name, v] of Object.entries(vars)) s = s.split("{" + name + "}").join(String(v));
    return s;
  };
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = t(e.dataset.t); });

  const SVGNS = "http://www.w3.org/2000/svg";
  const WINDOWS = ["minute", "hour", "day", "month"];
  const LIMIT = { minute: "perMinute", hour: "perHour", day: "perDay", month: "perMonth" };
  const STRATEGIES = ["priority", "weighted", "least-used"];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const sv = (tag, attrs, cls, text) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
    if (cls) e.setAttribute("class", cls);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const num = (n) => Number(n).toLocaleString(lang);
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtUntil = (iso) => new Date(iso).toLocaleString(lang, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const clip = (s, max) => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s);

  let state = null;
  let lastId = null;
  let recent = [];
  let timer = null;
  let busy = false;
  let manageSig = "";
  let editing = null; // provider name whose edit form is open

  async function api(path, opts = {}) {
    // The session cookie authenticates; this header proves the call comes from this page.
    const headers = { "x-revezo-panel": "1" };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(path, {
      method: opts.method || "GET", headers, cache: "no-store", credentials: "same-origin",
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error((data && data.message) || String(res.status));
      err.status = res.status;
      err.code = data && data.error;
      throw err;
    }
    return data;
  }

  function provState(p) {
    if (p.paused) return "user";
    if (p.blocked) return "blocked";
    let max = 0;
    for (const w of WINDOWS) {
      const limit = p.limits[LIMIT[w]];
      if (limit === undefined) continue;
      max = Math.max(max, limit === 0 ? 1 : p.usage[w] / limit);
    }
    return max >= 1 ? "full" : max >= 0.8 ? "high" : "ok";
  }
  const stateText = (p, s) => t("st_" + s, { until: p.blocked ? fmtUntil(p.blocked.until) : "" });
  const usageText = (used, limit) => (limit === undefined ? num(used) + " · " + t("noLimit") : num(used) + " / " + num(limit));

  // ---------- live view: one visor per sector ----------

  const SECTORS = ["email", "sms", "whatsapp", "llm", "scraping", "social", "search"];
  const visors = new Map(); // kind -> { section, box, stats, sr, sig, parts... }
  const selected = new Map(); // kind -> route name shown in the fan
  let sectorSig = "";
  let routeKind = new Map();

  const sectorTitle = (kind) => (T[lang]["sec_" + kind] || T.en["sec_" + kind] ? t("sec_" + kind) : kind);

  function sectorsOf(routes) {
    const kinds = SECTORS.slice();
    for (const r of routes) if (!kinds.includes(r.kind)) kinds.push(r.kind);
    return kinds.map((kind) => ({ kind, routes: routes.filter((r) => r.kind === kind) }));
  }

  /** Builds the sector chips and one empty visor section per sector, when the list changes. */
  function syncSectors(sectors) {
    const sig = sectors.map((s) => s.kind).join(",");
    if (sig === sectorSig) return;
    sectorSig = sig;
    for (const v of visors.values()) v.dots.forEach((d) => cancelAnimationFrame(d));
    visors.clear();
    const nav = $("sectorNav");
    const box = $("visors");
    nav.replaceChildren();
    box.replaceChildren();
    sectors.forEach((s, i) => {
      const id = "sector-" + i;
      const chip = el("a", "chip");
      chip.href = "#" + id;
      const count = el("span", "chip-n");
      chip.append(el("span", "", sectorTitle(s.kind)), count);
      nav.append(chip);
      const section = el("section", "visor pal-" + (i % 7));
      section.id = id;
      const head = el("div", "vhead");
      const titles = el("div");
      titles.append(el("h2", "", sectorTitle(s.kind)), el("p", "vstats"));
      head.append(titles);
      const vbox = el("div", "vbox");
      const sr = el("p", "sr");
      section.append(head, vbox, sr);
      box.append(section);
      visors.set(s.kind, { index: i, section, box: vbox, stats: titles.lastChild, sr, chip, count, sig: "", dots: new Set(), energy: 0 });
    });
  }

  function pickRoute(s) {
    const want = selected.get(s.kind);
    return s.routes.find((r) => r.route === want) || s.routes.find((r) => r.isDefault) || s.routes[0];
  }

  function visorLayout(s, W) {
    const wide = W >= 760;
    const sel = pickRoute(s);
    const provs = sel ? sel.providers : [];
    const n = provs.length;
    const m = s.routes.length;
    const L = { W, wide, sel, cards: [], nodes: [] };
    if (!m) {
      L.H = wide ? 170 : 200;
      L.orb = wide ? { x: Math.round(W * 0.14), y: L.H / 2, r: 30 } : { x: W / 2, y: 70, r: 28 };
      return L;
    }
    if (wide) {
      const cardW = 190, cardH = 64, gap = 14;
      L.H = Math.max(400, n * 44 + 90, m * (cardH + gap) + 80);
      L.orb = { x: Math.round(W * 0.14), y: L.H / 2, r: 46 };
      const cardX = Math.round(W * 0.34);
      let y = L.H / 2 - (m * cardH + (m - 1) * gap) / 2;
      for (const r of s.routes) {
        const cy = y + cardH / 2;
        const x0 = L.orb.x + L.orb.r + 26;
        L.cards.push({ r, x: cardX, y, w: cardW, h: cardH,
          d: "M" + x0 + "," + L.orb.y + " C" + (x0 + cardX) / 2 + "," + L.orb.y + " " + (x0 + cardX) / 2 + "," + cy + " " + cardX + "," + cy });
        y += cardH + gap;
      }
      const card = L.cards.find((c) => c.r === sel);
      const cx = card.x + card.w, cy = card.y + card.h / 2;
      const x1 = W - 210, x0 = cx + 80;
      const a = n > 1 ? Math.min(1.2, 0.2 + n * 0.08) : 0;
      const spread = Math.min(L.H / 2 - 34, n * 22);
      const Rx = a ? (x1 - x0) / (1 - Math.cos(a)) : 0;
      const Ry = a ? spread / Math.sin(a) : 0;
      provs.forEach((p, i) => {
        const th = n > 1 ? -a + (2 * a * i) / (n - 1) : 0;
        const x = n > 1 ? x1 - Rx + Rx * Math.cos(th) : x1;
        const y2 = L.H / 2 + Ry * Math.sin(th);
        const fade = n > 8 ? 1 - 0.5 * Math.pow(Math.abs(th) / a, 3) : 1;
        L.nodes.push({ p, x, y: y2, fade, maxChars: 22,
          d: "M" + cx + "," + cy + " C" + (cx + (x - cx) * 0.45) + "," + cy + " " + (x - (x - cx) * 0.35) + "," + y2 + " " + (x - 7) + "," + y2 });
      });
      L.emptyAt = { x: x0, y: cy };
    } else {
      L.orb = { x: W / 2, y: 82, r: 36 };
      const cardH = 54, gap = 10, cardX = 26, cardW = W - cardX - 2;
      let y = 170;
      const ob = L.orb.y + L.orb.r + 22;
      for (const r of s.routes) {
        const cy = y + cardH / 2;
        L.cards.push({ r, x: cardX, y, w: cardW, h: cardH,
          d: "M" + W / 2 + "," + ob + " C" + W / 2 + "," + (ob + 26) + " 10," + (ob + 6) + " 10," + (ob + 36) + " L10," + (cy - 8) + " Q10," + cy + " 18," + cy + " L" + cardX + "," + cy });
        y += cardH + gap;
      }
      const card = L.cards.find((c) => c.r === sel);
      const top = card.y + card.h;
      y += 20;
      const step = Math.min(10, 60 / Math.max(1, n));
      const nodeX = cardX + 22 + n * step + 10;
      provs.forEach((p, i) => {
        const sx = cardX + 22 + i * step;
        const cy = y + 18;
        L.nodes.push({ p, x: nodeX, y: cy, fade: 1, maxChars: Math.floor((W - nodeX - 20) / 8),
          d: "M" + sx + "," + top + " L" + sx + "," + (cy - 10) + " Q" + sx + "," + cy + " " + (sx + 10) + "," + cy + " L" + (nodeX - 7) + "," + cy });
        y += 52;
      });
      L.emptyAt = { x: cardX + 4, y: y + 10 };
      L.H = Math.max(y + 20, 260);
    }
    return L;
  }

  function buildVisor(s, v) {
    const W = Math.max(300, Math.floor(v.box.clientWidth || 320));
    const L = visorLayout(s, W);
    const svg = sv("svg", { viewBox: "0 0 " + L.W + " " + L.H, width: L.W, height: L.H, "aria-hidden": "true", focusable: "false" });
    const gid = "orbg-" + v.index;
    const defs = sv("defs");
    const grad = sv("radialGradient", { id: gid, cx: "38%", cy: "34%", r: "70%" });
    grad.append(sv("stop", { offset: "0%" }, "orb-s1"), sv("stop", { offset: "55%" }, "orb-s2"), sv("stop", { offset: "100%" }, "orb-s3"));
    defs.append(grad);
    const wiresG = sv("g"), nodesG = sv("g"), layer = sv("g");
    svg.append(defs, wiresG, nodesG, layer);

    // the sector's core: halo, ring of activity ticks, glowing orb
    const o = L.orb;
    nodesG.append(sv("circle", { cx: o.x, cy: o.y, r: o.r * 2.3 }, "halo"), sv("circle", { cx: o.x, cy: o.y, r: o.r * 1.55 }, "halo2"));
    const ring = sv("g", {}, "ring" + (s.routes.length ? "" : " off"));
    const ticks = [];
    for (let i = 0; i < 72; i++) {
      const line = sv("line", {}, "tick");
      ring.append(line);
      ticks.push({ line, ang: (i / 72) * Math.PI * 2 });
    }
    nodesG.append(ring, sv("circle", { cx: o.x, cy: o.y, r: o.r, fill: "url(#" + gid + ")" }, "orb" + (s.routes.length ? "" : " off")));
    const coreSub = sv("text", { x: o.x, y: o.y + o.r * 1.55 + 26, "text-anchor": "middle" }, "v-pill");
    nodesG.append(coreSub);

    const parts = { svg, layer, L, ticks, coreSub, cardWires: new Map(), cards: new Map(), wires: new Map(), nodes: new Map() };
    if (!s.routes.length) {
      const tx = L.wide ? Math.round(W * 0.38) : 16;
      const ty = L.wide ? L.H / 2 - 4 : 158;
      nodesG.append(sv("text", { x: tx, y: ty }, "v-name", t("soonTitle")),
        sv("text", { x: tx, y: ty + 22 }, "v-muted", clip(t("hint_" + s.kind) === "hint_" + s.kind ? t("soonText") : t("hint_" + s.kind), Math.floor((W - tx) / 7))));
    }
    for (const c of L.cards) {
      const wire = sv("path", { d: c.d }, "vwire w-in");
      wiresG.append(wire);
      parts.cardWires.set(c.r.route, wire);
      const g = sv("g", { tabindex: 0, role: "button" }, "vcard" + (c.r === L.sel ? " sel" : ""));
      g.setAttribute("aria-label", c.r.route);
      const rect = sv("rect", { x: c.x, y: c.y, width: c.w, height: c.h, rx: 9 }, "vcard-bg");
      const big = sv("text", { x: c.x + 14, y: c.y + (L.wide ? 30 : 24) }, "v-big");
      const label = sv("text", { x: c.x + 14, y: c.y + (L.wide ? 50 : 42) }, "v-muted", clip(c.r.route, Math.floor((c.w - 28) / 14)));
      const side = sv("text", { x: c.x + c.w - 12, y: c.y + (L.wide ? 50 : 42), "text-anchor": "end" }, "v-muted");
      g.append(rect, big, label, side);
      const choose = () => { selected.set(s.kind, c.r.route); v.sig = ""; renderVisors(state.routes); };
      g.addEventListener("click", choose);
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); choose(); } });
      nodesG.append(g);
      parts.cards.set(c.r.route, { big, side, c });
    }
    if (L.sel && !L.nodes.length) nodesG.append(sv("text", { x: L.emptyAt.x, y: L.emptyAt.y + 4 }, "v-muted", t("noProviders")));
    for (const n of L.nodes) {
      const wire = sv("path", { d: n.d }, "vwire w-ok");
      wiresG.append(wire);
      parts.wires.set(n.p.name, wire);
      const g = sv("g", {}, "vnode");
      if (n.fade < 1) g.style.opacity = String(n.fade);
      const glow = sv("circle", { cx: n.x, cy: n.y, r: 11 }, "nglow");
      const dot = sv("circle", { cx: n.x, cy: n.y, r: 5.5 }, "ndot");
      const name = sv("text", { x: n.x + 14, y: n.y - 3 }, "v-name", clip(n.p.name, n.maxChars));
      const pillBg = sv("rect", { x: n.x + 14, y: n.y + 5, width: 92, height: 15, rx: 4 }, "pill-bg");
      const pill = sv("text", { x: n.x + 19, y: n.y + 16 }, "v-pill");
      const segs = [];
      for (let i = 0; i < 5; i++) {
        const r = sv("rect", { x: n.x + 112 + i * 9, y: n.y + 8, width: 7, height: 9, rx: 1.5 }, "seg");
        segs.push(r);
        g.append(r);
      }
      g.append(glow, dot, name, pillBg, pill);
      nodesG.append(g);
      parts.nodes.set(n.p.name, { n, glow, dot, pill, pillBg, segs });
    }
    v.dots.forEach((d) => cancelAnimationFrame(d));
    v.dots.clear();
    v.box.replaceChildren(svg);
    Object.assign(v, parts);
  }

  function updateVisor(s, v) {
    const all = s.routes.flatMap((r) => r.providers);
    const total = all.reduce((sum, p) => sum + p.usage.day, 0);
    const maxDay = Math.max(1, ...all.map((p) => p.usage.day));
    v.count.textContent = String(all.length);
    v.chip.classList.toggle("empty", !s.routes.length);
    v.stats.textContent = s.routes.length ? t(s.routes.length === 1 ? "vstats1" : "vstats", { routes: s.routes.length, apis: all.length, sent: num(total) }) : "";
    v.sr.textContent = v.stats.textContent || t("soonTitle");
    v.coreSub.textContent = s.routes.length ? t("sentToday", { n: num(total) }) : "";
    // activity ring: longer ticks when this sector is busy
    const o = v.L.orb;
    const busy = Math.min(1, v.energy / 6);
    v.energy *= 0.6;
    for (const tk of v.ticks) {
      const len = 3 + (s.routes.length ? 4 * Math.abs(Math.sin(tk.ang * 5 + total)) + 14 * busy * Math.random() : 0);
      const r0 = o.r + 9;
      tk.line.setAttribute("x1", (o.x + Math.cos(tk.ang) * r0).toFixed(1));
      tk.line.setAttribute("y1", (o.y + Math.sin(tk.ang) * r0).toFixed(1));
      tk.line.setAttribute("x2", (o.x + Math.cos(tk.ang) * (r0 + len)).toFixed(1));
      tk.line.setAttribute("y2", (o.y + Math.sin(tk.ang) * (r0 + len)).toFixed(1));
    }
    for (const r of s.routes) {
      const card = v.cards.get(r.route);
      const sent = r.providers.reduce((sum, p) => sum + p.usage.day, 0);
      if (card) {
        card.big.textContent = num(r.providers.length) + " API" + (r.providers.length === 1 ? "" : "s");
        card.side.textContent = t(r.strategy) + " · " + num(sent);
      }
      const cw = v.cardWires.get(r.route);
      if (cw) cw.style.strokeWidth = (sent > 0 ? 1.5 + Math.min(5, Math.sqrt(sent) / 3) : 1.2) + "px";
      for (const p of r.providers) {
        const node = v.nodes.get(p.name);
        const wire = v.wires.get(p.name);
        if (!node || !wire) continue;
        const st = provState(p);
        wire.setAttribute("class", "vwire w-" + st);
        wire.style.strokeWidth = (p.usage.day > 0 ? 1.4 + 3.6 * Math.sqrt(p.usage.day / maxDay) : 1.2) + "px";
        node.dot.setAttribute("class", "ndot f-" + st);
        node.glow.setAttribute("class", "nglow f-" + st);
        node.pill.textContent = t("today") + " " + usageText(p.usage.day, p.limits.perDay);
        node.pillBg.setAttribute("width", String(Math.max(70, node.pill.textContent.length * 6.2 + 10)));
        const lim = p.limits.perDay ?? p.limits.perMonth;
        const used = p.limits.perDay !== undefined ? p.usage.day : p.usage.month;
        const filled = lim ? Math.ceil(Math.min(1, used / lim) * 5) : 0;
        const segX = node.n.x + 14 + Math.max(70, node.pill.textContent.length * 6.2 + 10) + 6;
        node.segs.forEach((sg, i) => {
          sg.setAttribute("x", String(segX + i * 9));
          sg.setAttribute("class", "seg" + (i < filled ? " f-" + st : ""));
        });
      }
    }
  }

  function renderVisors(routes) {
    routeKind = new Map(routes.map((r) => [r.route, r.kind]));
    const sectors = sectorsOf(routes);
    syncSectors(sectors);
    for (const s of sectors) {
      const v = visors.get(s.kind);
      const W = Math.floor(v.box.clientWidth || 320);
      const sel = pickRoute(s);
      const sig = JSON.stringify([Math.round(W / 40), sel && sel.route, s.routes.map((r) => [r.route, r.providers.map((p) => p.name)])]);
      if (sig !== v.sig) {
        buildVisor(s, v);
        v.sig = sig;
      }
      updateVisor(s, v);
    }
  }

  function runDot(v, legs, delay) {
    const dot = sv("circle", { r: 4.5, cx: -20, cy: -20 }, "vdot");
    if (motion.matches) {
      const last = legs[legs.length - 1];
      const pt = last.getPointAtLength(last.getTotalLength());
      dot.setAttribute("cx", String(pt.x));
      dot.setAttribute("cy", String(pt.y));
      v.layer.append(dot);
      setTimeout(() => dot.remove(), 1500);
      return;
    }
    const lens = legs.map((w) => w.getTotalLength());
    const total = lens.reduce((a, b) => a + b, 0);
    const DURATION = 1500;
    const layer = v.layer;
    let start = null;
    let raf = 0;
    const step = (now) => {
      v.dots.delete(raf);
      if (start === null) start = now + delay;
      const k = (now - start) / DURATION;
      if (k >= 1 || !layer.isConnected) { dot.remove(); return; }
      if (k >= 0) {
        if (!dot.isConnected) layer.append(dot);
        let d = (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) * total;
        let i = 0;
        while (i < legs.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
        const pt = legs[i].getPointAtLength(d);
        dot.setAttribute("cx", String(pt.x));
        dot.setAttribute("cy", String(pt.y));
      }
      raf = requestAnimationFrame(step);
      v.dots.add(raf);
    };
    raf = requestAnimationFrame(step);
    v.dots.add(raf);
  }

  /** A dot for one sent message: core → route card → provider (when that route is open). */
  function sendDot(e, delay) {
    const v = visors.get(routeKind.get(e.route));
    if (!v || !v.cardWires) return;
    v.energy += 1;
    const cw = v.cardWires.get(e.route);
    if (!cw) return;
    const pw = v.L.sel && v.L.sel.route === e.route ? v.wires.get(e.provider) : undefined;
    runDot(v, pw ? [cw, pw] : [cw], delay);
  }

  /** A red mark on the provider's wire for a failed attempt. */
  function failMark(e) {
    const v = visors.get(routeKind.get(e.route));
    const wire = v && v.wires && v.wires.get(e.provider);
    if (!wire) return;
    const pt = wire.getPointAtLength(wire.getTotalLength() * 0.7);
    const g = sv("g", {}, "fail");
    g.append(
      sv("circle", { cx: pt.x, cy: pt.y, r: 8 }, "failmark"),
      sv("path", { d: "M" + (pt.x - 3) + "," + (pt.y - 3) + " L" + (pt.x + 3) + "," + (pt.y + 3) + " M" + (pt.x + 3) + "," + (pt.y - 3) + " L" + (pt.x - 3) + "," + (pt.y + 3) }, "failx"),
    );
    v.layer.append(g);
    setTimeout(() => g.remove(), 8000);
  }

  // ---------- recent attempts ----------

  function renderEvents() {
    const body = $("events");
    body.replaceChildren();
    if (!recent.length) {
      const tr = el("tr");
      const td = el("td", "msg", t("none"));
      td.colSpan = 5;
      tr.append(td);
      body.append(tr);
      return;
    }
    for (const e of recent) {
      const tr = el("tr");
      const cls = e.outcome === "sent" ? "ok" : e.outcome === "failed" ? "bad" : "warn";
      tr.append(el("td", "", fmtTime(e.ts)), el("td", "", e.route), el("td", "", e.provider), el("td", cls, t(e.outcome)),
        el("td", "msg", [e.kind, e.message].filter(Boolean).join(" · ")));
      body.append(tr);
    }
  }

  async function pullEvents() {
    if (lastId === null) {
      const res = await api("/v1/events?limit=50");
      recent = res.events;
      lastId = res.last;
      renderEvents();
      return;
    }
    const res = await api("/v1/events?limit=200&since=" + lastId);
    if (res.last < lastId) { lastId = null; return pullEvents(); } // server restarted
    lastId = res.last;
    if (!res.events.length) return;
    const fresh = res.events.slice().reverse();
    let delay = 0;
    for (const e of fresh) {
      if (e.outcome === "sent") { sendDot(e, delay); delay += 180; }
      else if (e.outcome === "failed") failMark(e);
    }
    recent = res.events.concat(recent).slice(0, 50);
    renderEvents();
  }

  // ---------- management ----------

  const msg = (id, text, ok) => { const p = $(id); p.textContent = text || ""; p.className = text ? (ok ? "msg-ok" : "msg-bad") : ""; };
  const errText = (err) => (T[lang]["err_" + err.code] ? t("err_" + err.code) : err.message);

  async function act(method, path, body, msgId, okText) {
    try {
      await api(path, { method, body });
      msg(msgId, okText || t("done"), true);
      editing = null;
      manageSig = "";
      await refresh();
      return true;
    } catch (err) {
      if (err.status === 401) { boot(); return false; }
      msg(msgId, errText(err), false);
      return false;
    }
  }

  function limitsLine(p) {
    const parts = [];
    for (const w of ["day", "month", "hour", "minute"]) {
      const v = p.limits[LIMIT[w]];
      if (v !== undefined) parts.push(num(v) + t(LIMIT[w] + "Short"));
    }
    return t("limitsLine", { limits: parts.join(" · ") || t("noLimit"), weight: p.weight });
  }

  function renderManage() {
    const writable = state.writable;
    const ro = $("readonly");
    ro.hidden = writable;
    ro.textContent = writable ? "" : t("ro_" + state.reason);
    const warn = $("warnings");
    warn.replaceChildren(...state.warnings.map((w) => el("li", "", w)));
    warn.hidden = !state.warnings.length;
    $("addCard").hidden = !writable;
    $("routeCard").hidden = !writable;

    const box = $("routes");
    box.replaceChildren();
    for (const r of state.routes) {
      const sec = el("div", "route");
      const head = el("div", "row");
      head.append(el("h3", "", r.route), el("span", "muted", r.kind), el("span", "pill " + (r.source === "panel" ? "ok" : "off"), t(r.source === "panel" ? "fromPanel" : "fromFile")));
      if (r.isDefault) head.append(el("span", "pill ok", t("default")));
      const strat = el("select", "inline");
      strat.setAttribute("aria-label", t("strategy") + " " + r.route);
      for (const s of STRATEGIES) { const o = el("option", "", t(s)); o.value = s; strat.append(o); }
      strat.value = r.strategy;
      strat.disabled = !writable;
      strat.addEventListener("change", () => act("PATCH", "/v1/admin/routes/" + encodeURIComponent(r.route), { strategy: strat.value }, "manageMsg"));
      head.append(el("span", "grow"), strat);
      if (writable && r.source === "panel" && !r.providers.length) {
        const rm = el("button", "ghost danger", t("removeRoute"));
        rm.type = "button";
        rm.addEventListener("click", () => { if (confirm(t("confirmRemoveRoute", { name: r.route }))) act("DELETE", "/v1/admin/routes/" + encodeURIComponent(r.route), undefined, "manageMsg"); });
        head.append(rm);
      }
      sec.append(head);
      if (!r.providers.length) sec.append(el("p", "muted", t("noProviders")));
      r.providers.forEach((p, idx) => sec.append(providerRow(r, p, idx, writable)));
      box.append(sec);
    }
  }

  function providerRow(r, p, idx, writable) {
    const row = el("div", "prov");
    const s = provState(p);
    const info = el("div", "grow");
    const top = el("div", "row");
    top.append(el("span", "name", p.name), el("span", "muted", p.type),
      el("span", "pill " + (p.source === "panel" ? "ok" : "off"), t(p.source === "panel" ? "fromPanel" : "fromFile")),
      el("span", "pill " + ({ ok: "ok", high: "warn", full: "bad", blocked: "bad", user: "off" })[s], stateText(p, s)));
    info.append(top);
    const secretNames = Object.keys(p.secrets || {});
    let line = limitsLine(p);
    if (secretNames.length) line += " · " + t("keysSaved") + ": " + secretNames.map((k) => k + " " + (p.secrets[k] ? "✓ " + t("saved") : "✗ " + t("missing"))).join(", ");
    info.append(el("div", "muted", line));
    row.append(info);

    const actions = el("div", "actions");
    const btn = (label, fn, cls) => {
      const b = el("button", "ghost" + (cls ? " " + cls : ""), label);
      b.type = "button";
      b.disabled = !writable;
      b.addEventListener("click", fn);
      actions.append(b);
      return b;
    };
    const move = (delta) => {
      const order = r.providers.map((x) => x.name);
      const j = idx + delta;
      [order[idx], order[j]] = [order[j], order[idx]];
      act("PATCH", "/v1/admin/routes/" + encodeURIComponent(r.route), { order }, "manageMsg");
    };
    const upB = btn("↑", () => move(-1));
    upB.setAttribute("aria-label", t("up") + " " + p.name);
    upB.disabled = !writable || idx === 0;
    const downB = btn("↓", () => move(1));
    downB.setAttribute("aria-label", t("down") + " " + p.name);
    downB.disabled = !writable || idx === r.providers.length - 1;
    btn(p.paused ? t("resume") : t("pause"), () => act("PATCH", "/v1/admin/providers/" + encodeURIComponent(p.name), { paused: !p.paused }, "manageMsg"));
    if (p.source === "panel") {
      btn(t("edit"), () => { editing = editing === p.name ? null : p.name; renderManage(); });
      btn(t("remove"), () => {
        if (confirm(t("confirmRemove", { name: p.name }))) act("DELETE", "/v1/admin/providers/" + encodeURIComponent(p.name), undefined, "manageMsg");
      }, "danger");
    }
    row.append(actions);
    if (editing === p.name && writable) row.append(editForm(p));
    return row;
  }

  function numberInput(labelKey, value, attrs) {
    const label = el("label");
    const input = el("input");
    input.type = "number";
    input.min = attrs && attrs.min !== undefined ? attrs.min : "0";
    input.step = attrs && attrs.step ? attrs.step : "1";
    if (attrs && attrs.max) input.max = attrs.max;
    if (value !== undefined) input.value = String(value);
    label.append(el("span", "", t(labelKey)), input);
    return { label, input };
  }

  function readLimits(inputs) {
    const limits = {};
    for (const [key, input] of Object.entries(inputs)) {
      const v = input.value.trim();
      limits[key] = v === "" ? null : Number(v);
    }
    return limits;
  }

  function editForm(p) {
    const form = el("form", "edit");
    const inputs = {};
    for (const key of ["perDay", "perMonth", "perHour", "perMinute"]) {
      const f = numberInput(key, p.limits[key]);
      inputs[key] = f.input;
      form.append(f.label);
    }
    const w = numberInput("weight", p.weight, { min: "0.1", max: "1000", step: "0.1" });
    form.append(w.label);
    const mk = el("label", "check");
    const box = el("input");
    box.type = "checkbox";
    box.checked = p.capabilities && p.capabilities.allowsMarketing === true;
    mk.append(box, el("span", "", t("marketing")));
    form.append(mk);
    const save = el("button", "", t("save"));
    save.type = "submit";
    const cancel = el("button", "ghost", t("cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => { editing = null; renderManage(); });
    form.append(save, cancel);
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      act("PATCH", "/v1/admin/providers/" + encodeURIComponent(p.name), {
        limits: readLimits(inputs), weight: Number(w.input.value), capabilities: { allowsMarketing: box.checked },
      }, "manageMsg");
    });
    return form;
  }

  // ---------- add forms ----------

  let addSig = "";
  let addTypeShown = "";

  function syncAddForms() {
    const sig = JSON.stringify([state.routes.map((r) => [r.route, r.kind]), state.plugins.map((p) => p.kind + ":" + p.id)]);
    if (sig === addSig) return;
    addSig = sig;
    const routeSel = $("addRoute");
    const keep = routeSel.value;
    routeSel.replaceChildren(...state.routes.map((r) => { const o = el("option", "", r.route + " (" + r.kind + ")"); o.value = r.route; return o; }));
    if (state.routes.some((r) => r.route === keep)) routeSel.value = keep;
    syncTypes();
    const kinds = [...new Set(state.plugins.map((p) => p.kind))];
    const kindSel = $("routeKind");
    const keepKind = kindSel.value;
    kindSel.replaceChildren(...kinds.map((k) => { const o = el("option", "", k); o.value = k; return o; }));
    if (kinds.includes(keepKind)) kindSel.value = keepKind;
    const stratSel = $("routeStrategy");
    if (!stratSel.options.length) stratSel.append(...STRATEGIES.map((s) => { const o = el("option", "", t(s)); o.value = s; return o; }));
  }

  function syncTypes() {
    const route = state.routes.find((r) => r.route === $("addRoute").value);
    const typeSel = $("addType");
    const keep = typeSel.value;
    const plugins = state.plugins.filter((p) => route && p.kind === route.kind);
    typeSel.replaceChildren(...plugins.map((p) => { const o = el("option", "", p.label); o.value = p.id; return o; }));
    if (plugins.some((p) => p.id === keep)) typeSel.value = keep;
    showFields();
  }

  function showFields() {
    const plugin = state.plugins.find((p) => p.id === $("addType").value && state.routes.some((r) => r.route === $("addRoute").value && r.kind === p.kind));
    const key = plugin ? plugin.kind + ":" + plugin.id : "";
    if (key === addTypeShown) return;
    addTypeShown = key;
    const box = $("addFields");
    box.replaceChildren();
    if (!plugin) return;
    for (const f of plugin.fields) {
      const input = el("input");
      input.dataset.field = f.name;
      input.dataset.kind = f.type;
      if (f.type === "boolean") {
        input.type = "checkbox";
        const label = el("label", "check");
        label.append(input, el("span", "", t(f.label)));
        box.append(label);
        continue;
      }
      input.type = f.secret ? "password" : f.type === "number" ? "number" : "text";
      if (f.secret) input.autocomplete = "new-password";
      if (f.placeholder) input.placeholder = f.placeholder;
      input.maxLength = 1000;
      input.required = f.required;
      const label = el("label");
      label.append(el("span", "", t(f.label) + (f.required ? " *" : "")), input);
      box.append(label);
    }
    const s = plugin.suggestedLimits || {};
    $("addPerDay").value = s.perDay !== undefined ? String(s.perDay) : "";
    $("addPerMonth").value = s.perMonth !== undefined ? String(s.perMonth) : "";
    $("addPerHour").value = s.perHour !== undefined ? String(s.perHour) : "";
    $("addMarketing").checked = plugin.defaultCapabilities.allowsMarketing === true;
    $("addName").placeholder = plugin.id;
  }

  /** "brevo", or "brevo-2", "brevo-3"... when the name is taken. */
  function freeName(base) {
    const taken = new Set(state.routes.flatMap((r) => r.providers.map((p) => p.name)));
    let name = base;
    for (let i = 2; taken.has(name); i++) name = base + "-" + i;
    return name;
  }

  $("addRoute").addEventListener("change", syncTypes);
  $("addType").addEventListener("change", showFields);

  $("addForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const options = {};
    for (const input of $("addFields").querySelectorAll("input")) {
      const k = input.dataset.field;
      if (input.dataset.kind === "boolean") { if (input.checked) options[k] = true; }
      else if (input.value.trim() !== "") options[k] = input.dataset.kind === "number" ? Number(input.value) : input.value.trim();
    }
    const limits = {};
    for (const [key, id] of [["perDay", "addPerDay"], ["perMonth", "addPerMonth"], ["perHour", "addPerHour"]]) {
      const v = $(id).value.trim();
      if (v !== "") limits[key] = Number(v);
    }
    const name = $("addName").value.trim() || freeName($("addType").value);
    const ok = await act("POST", "/v1/admin/providers", {
      route: $("addRoute").value, use: $("addType").value, name, options, limits,
      weight: Number($("addWeight").value) || 1, capabilities: { allowsMarketing: $("addMarketing").checked },
    }, "addMsg", t("added", { name }));
    if (ok) {
      $("addName").value = "";
      for (const input of $("addFields").querySelectorAll("input")) { input.value = ""; input.checked = false; }
    }
  });

  $("routeForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const ok = await act("POST", "/v1/admin/routes", { name: $("routeName").value.trim(), kind: $("routeKind").value, strategy: $("routeStrategy").value }, "routeMsg");
    if (ok) $("routeName").value = "";
  });

  // ---------- refresh loop ----------

  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      state = await api("/v1/admin/state");
      $("login").hidden = true;
      $("app").hidden = false;
      $("error").hidden = true;
      renderVisors(state.routes);
      const sig = JSON.stringify([state.writable, state.reason, state.warnings, state.routes.map((r) => [r.route, r.strategy,
        r.providers.map((p) => [p.name, p.paused, provState(p), p.limits, p.weight, p.capabilities, p.secrets])])]);
      const typing = document.activeElement && $("routes").contains(document.activeElement) && document.activeElement.tagName !== "BUTTON";
      if (sig !== manageSig && !typing && editing === null) { manageSig = sig; renderManage(); }
      syncAddForms();
      await pullEvents();
      $("updated").textContent = t("updated") + " " + fmtTime(new Date().toISOString());
    } catch (err) {
      if (err.status === 401) boot();
      else $("updated").textContent = t("offline");
    } finally {
      busy = false;
    }
  }

  function start() {
    clearInterval(timer);
    refresh();
    timer = setInterval(() => { if (!document.hidden) refresh(); }, 3000);
  }

  // ---------- login ----------

  let captchaId = null;

  function showEntry(mode, text) {
    clearInterval(timer);
    lastId = null;
    recent = [];
    manageSig = "";
    addSig = "";
    $("app").hidden = true;
    $("login").hidden = false;
    const setup = mode !== "login";
    $("loginForm").hidden = setup;
    $("setupForm").hidden = !setup;
    $("toSetup").hidden = setup;
    $("toLogin").hidden = !setup || mode === "first";
    $("loginTitle").textContent = t(mode === "first" ? "firstTitle" : mode === "reset" ? "resetTitle" : "loginTitle");
    $("loginHelp").textContent = t(mode === "first" ? "firstHelp" : mode === "reset" ? "resetHelp" : "loginHelp");
    $("error").hidden = !text;
    $("error").textContent = text || "";
  }

  async function post(path, body) {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    let data = {};
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  }

  async function loadCaptcha() {
    try {
      captchaId = (await post("/auth/captcha", {})).data.id;
      $("captchaImg").src = "/auth/captcha/" + captchaId + ".svg";
      $("captcha").value = "";
      $("captcha").required = true;
      $("captchaBox").hidden = false;
    } catch {
      $("error").hidden = false;
      $("error").textContent = t("offline");
    }
  }

  const lockedText = (sec) => t("locked", { min: Math.max(1, Math.ceil(sec / 60)) });

  /** Asks the server what to show: the dashboard, the login or the first-time setup. */
  async function boot() {
    clearInterval(timer);
    let st;
    try {
      st = await (await fetch("/auth/status", { cache: "no-store", credentials: "same-origin" })).json();
    } catch {
      showEntry("login", t("offline"));
      return;
    }
    if (st.loggedIn) { start(); return; }
    if (!st.admin) { showEntry("first"); return; }
    showEntry("login", st.lockedFor ? lockedText(st.lockedFor) : "");
    $("captchaBox").hidden = true;
    $("captcha").required = false;
    captchaId = null;
    if (st.captcha) loadCaptcha();
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state) renderVisors(state.routes); }, 200);
  });

  $("loginForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const body = { user: $("user").value.trim(), password: $("password").value };
    if (captchaId) { body.captchaId = captchaId; body.captcha = $("captcha").value; }
    const { status, data } = await post("/auth/login", body);
    $("password").value = "";
    if (status === 200) { captchaId = null; $("captchaBox").hidden = true; $("error").hidden = true; start(); return; }
    $("error").hidden = false;
    $("error").textContent = status === 429 ? lockedText(data.retryAfterSec || 900) : t("err_" + (data.error || "wrong_login"));
    captchaId = null;
    if (data.captcha || data.error === "captcha_required" || data.error === "captcha_wrong") loadCaptcha();
  });
  $("captchaNew").addEventListener("click", loadCaptcha);

  $("setupForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if ($("setupPass").value !== $("setupPass2").value) {
      $("error").hidden = false;
      $("error").textContent = t("err_mismatch");
      return;
    }
    const { status, data } = await post("/auth/setup", { apiKey: $("setupKey").value.trim(), user: $("setupUser").value.trim(), password: $("setupPass").value });
    $("setupKey").value = "";
    $("setupPass").value = "";
    $("setupPass2").value = "";
    if (status === 200) { $("error").hidden = true; start(); return; }
    $("error").hidden = false;
    $("error").textContent = status === 429 ? lockedText(data.retryAfterSec || 900) : t("err_" + (data.error || "wrong_api_key"));
  });
  $("toSetup").addEventListener("click", () => showEntry("reset"));
  $("toLogin").addEventListener("click", () => boot());
  $("logout").addEventListener("click", async () => {
    await post("/auth/logout", {}).catch(() => {});
    boot();
  });
  boot();
})();
