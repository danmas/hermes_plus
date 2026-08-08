// server/index.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { resolve as resolve2 } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { WebSocketServer as WebSocketServer2 } from "ws";

// server/config.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// src/config/envSubst.ts
var PLACEHOLDER_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
function defaultEnvSource() {
  const proc = globalThis.process;
  if (proc && proc.env) {
    return proc.env;
  }
  try {
    const meta = import.meta;
    if (meta && meta.env) return meta.env;
  } catch {
  }
  return {};
}
function substString(input, env, warned) {
  return input.replace(PLACEHOLDER_RE, (_match, varName) => {
    const value = env[varName];
    if (value === void 0 || value === "") {
      if (!warned.has(varName)) {
        warned.add(varName);
        console.warn(`[envSubst] \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u0430: ${varName} (\u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0430 \u043F\u0443\u0441\u0442\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430)`);
      }
      return "";
    }
    return value;
  });
}
function expandEnvPlaceholders(obj, env = defaultEnvSource()) {
  const warned = /* @__PURE__ */ new Set();
  return walk(obj, env, warned);
}
function walk(node, env, warned) {
  if (typeof node === "string") {
    return substString(node, env, warned);
  }
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, env, warned));
  }
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = walk(value, env, warned);
    }
    return out;
  }
  return node;
}

// server/config.ts
function loadDotEnv(cwd) {
  const out = {};
  for (const name of [".env", ".env.local"]) {
    const p = resolve(cwd, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
  }
  return out;
}
function mergedEnv(cwd) {
  const env = { ...loadDotEnv(cwd) };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== void 0) env[k] = v;
  }
  return env;
}
function loadConfig(cwd) {
  const env = mergedEnv(cwd);
  const get = (k, dflt = "") => env[k] ?? dflt;
  const password = get("HERMES_PLUS_PASSWORD");
  if (!password) {
    throw new Error(
      `HERMES_PLUS_PASSWORD \u043D\u0435 \u0437\u0430\u0434\u0430\u043D. \u0417\u0430\u0434\u0430\u0439\u0442\u0435 \u0434\u043B\u0438\u043D\u043D\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C (\u2265 24 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432) \u0432 .env.local.
\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C: node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
    );
  }
  if (password.length < 24) {
    throw new Error("HERMES_PLUS_PASSWORD \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0439 (< 24 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432) \u2014 \u043F\u043E\u0440\u0442 \u0431\u0443\u0434\u0435\u0442 \u0432\u0438\u0434\u0435\u043D \u0441\u043A\u0430\u043D\u0435\u0440\u0430\u043C.");
  }
  const cookieSecureRaw = get("COOKIE_SECURE", "auto").toLowerCase();
  const cookieSecure = cookieSecureRaw === "1" || cookieSecureRaw === "true" ? "1" : cookieSecureRaw === "0" || cookieSecureRaw === "false" ? "0" : "auto";
  return {
    port: Number(get("PORT", get("BFF_PORT", "8787"))),
    password,
    cookieSecure,
    localOrigin: get("HERMES_LOCAL_ORIGIN", "http://127.0.0.1:9119").replace(/\/$/, ""),
    l1Origin: get("HERMES_L1_ORIGIN", "http://192.168.1.221:9119").replace(/\/$/, ""),
    sessionToken: get("HERMES_DASHBOARD_SESSION_TOKEN") || null,
    l1Username: get("HERMES_L1_USERNAME", get("VITE_HERMES_L1_USERNAME")),
    l1Password: get("HERMES_L1_PASSWORD", get("VITE_HERMES_L1_PASSWORD")),
    distDir: get("BFF_DIST_DIR", resolve(cwd, "dist"))
  };
}
var VALID_AUTH_TYPES = ["none", "session-token", "bearer", "cookie"];
function validateAgents(agents) {
  if (!Array.isArray(agents)) return '\u043F\u043E\u043B\u0435 "agents" \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043C\u0430\u0441\u0441\u0438\u0432\u043E\u043C';
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const where = `agents[${i}]`;
    if (!a || typeof a !== "object") return `${where}: \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043E\u0431\u044A\u0435\u043A\u0442\u043E\u043C`;
    if (!a.id || typeof a.id !== "string") return `${where}: \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u043B\u0435 "id"`;
    if (seen.has(a.id)) return `\u0434\u0443\u0431\u043B\u0438\u0440\u0443\u044E\u0449\u0438\u0439\u0441\u044F id \u0430\u0433\u0435\u043D\u0442\u0430: "${a.id}"`;
    seen.add(a.id);
    if (!a.name || typeof a.name !== "string") {
      return `${where} (id=${a.id}): \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u043B\u0435 "name"`;
    }
    if (!a.auth || typeof a.auth !== "object" || typeof a.auth.type !== "string") {
      return `${where} (id=${a.id}): \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u043B\u0435 "auth.type"`;
    }
    if (!VALID_AUTH_TYPES.includes(a.auth.type)) {
      return `${where} (id=${a.id}): \u043D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 auth.type "${a.auth.type}"; \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0435: ${VALID_AUTH_TYPES.join(", ")}`;
    }
  }
  return null;
}
function sanitizeAgent(a) {
  return {
    id: a.id,
    name: a.name,
    baseUrl: a.baseUrl,
    ...a.proxyPath ? { proxyPath: a.proxyPath } : {},
    ...a.profile ? { profile: a.profile } : {},
    ...a.tags?.length ? { tags: a.tags } : {},
    auth: { type: a.auth.type }
  };
}
function loadAgentsRegistry(cwd, env) {
  const path = resolve(cwd, "agents-config.json");
  if (!existsSync(path)) {
    console.warn("[bff] agents-config.json \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u2014 \u0440\u0435\u0435\u0441\u0442\u0440 \u043F\u0443\u0441\u0442");
    return { agents: [], publicAgents: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    const resolved = expandEnvPlaceholders(parsed, env);
    const err = validateAgents(resolved.agents);
    if (err) {
      console.warn(`[bff] \u043D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0439 agents-config.json: ${err} \u2014 \u0440\u0435\u0435\u0441\u0442\u0440 \u043F\u0443\u0441\u0442`);
      return { agents: [], publicAgents: [] };
    }
    const agents = resolved.agents;
    return { agents, publicAgents: agents.map(sanitizeAgent) };
  } catch (e) {
    console.warn(`[bff] \u043E\u0448\u0438\u0431\u043A\u0430 \u0447\u0442\u0435\u043D\u0438\u044F agents-config.json: ${e instanceof Error ? e.message : String(e)}`);
    return { agents: [], publicAgents: [] };
  }
}

// server/auth.ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
var SESSION_COOKIE = "hp_sid";
var IDLE_TTL_MS = 12 * 3600 * 1e3;
var ABS_TTL_MS = 7 * 24 * 3600 * 1e3;
var MAX_AGE_S = Math.floor(ABS_TTL_MS / 1e3);
var sessions = /* @__PURE__ */ new Map();
function sweep() {
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (now - s.lastSeen > IDLE_TTL_MS || now - s.createdAt > ABS_TTL_MS) {
      sessions.delete(sid);
    }
  }
}
function createSession(ip) {
  sweep();
  const sid = randomBytes(32).toString("hex");
  sessions.set(sid, { createdAt: Date.now(), lastSeen: Date.now(), ip });
  return sid;
}
function isValidSession(sid) {
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) return false;
  const s = sessions.get(sid);
  if (!s) return false;
  const now = Date.now();
  if (now - s.lastSeen > IDLE_TTL_MS || now - s.createdAt > ABS_TTL_MS) {
    sessions.delete(sid);
    return false;
  }
  s.lastSeen = now;
  return true;
}
function destroySession(sid) {
  if (sid) sessions.delete(sid);
}
var FAIL_WINDOW_MS = 15 * 60 * 1e3;
var MAX_FAILS = 5;
var failLog = /* @__PURE__ */ new Map();
function loginBlockedFor(ip) {
  const now = Date.now();
  const recent = (failLog.get(ip) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  failLog.set(ip, recent);
  if (recent.length >= MAX_FAILS) {
    return Math.max(1, Math.ceil((FAIL_WINDOW_MS - (now - recent[0])) / 1e3));
  }
  return 0;
}
function recordLoginFail(ip) {
  const arr = failLog.get(ip) ?? [];
  arr.push(Date.now());
  failLog.set(ip, arr);
}
function clearLoginFails(ip) {
  failLog.delete(ip);
}
function verifyPassword(input, expected) {
  const a = createHash("sha256").update(String(input)).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}
function sessionSetCookie(sid, secure) {
  return `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure ? "; Secure" : ""}`;
}
function sessionClearCookie(secure) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
var LOGIN_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hermes_plus \u2014 \u0432\u0445\u043E\u0434</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0b0f14; color: #d7e0ea;
    font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  }
  .card {
    width: min(360px, calc(100vw - 32px)); padding: 28px 24px;
    background: #121821; border: 1px solid #1f2a38; border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.45);
  }
  h1 { margin: 0 0 4px; font-size: 18px; }
  .sub { margin: 0 0 20px; font-size: 12px; color: #7d8ca0; }
  label { display: block; margin-bottom: 6px; font-size: 12px; color: #9fb0c3; }
  input[type=password] {
    width: 100%; padding: 10px 12px; border-radius: 8px;
    border: 1px solid #2a3a4e; background: #0d131b; color: #e6edf5; outline: none;
  }
  input[type=password]:focus { border-color: #2dd4bf; }
  button {
    margin-top: 16px; width: 100%; padding: 10px 12px; border: 0; border-radius: 8px;
    background: #14b8a6; color: #04211d; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #2dd4bf; }
  button:disabled { opacity: .6; cursor: default; }
  .err { margin-top: 12px; min-height: 16px; font-size: 12px; color: #f87171; }
</style>
</head>
<body>
  <form class="card" id="f">
    <h1>hermes_plus</h1>
    <p class="sub">Fleet Control Plane \u2014 \u0434\u043E\u0441\u0442\u0443\u043F \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0430</p>
    <label for="p">\u041F\u0430\u0440\u043E\u043B\u044C</label>
    <input id="p" name="password" type="password" autocomplete="current-password" autofocus required>
    <button type="submit" id="b">\u0412\u043E\u0439\u0442\u0438</button>
    <div class="err" id="e"></div>
  </form>
<script>
  document.getElementById('f').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('b');
    const err = document.getElementById('e');
    const password = document.getElementById('p').value;
    btn.disabled = true; err.textContent = '';
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) { location.replace('/'); return; }
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        err.textContent = '\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043F\u043E\u043F\u044B\u0442\u043E\u043A. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 ' + (d.retry_after || 60) + ' \u0441.';
      } else {
        err.textContent = '\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C';
      }
    } catch {
      err.textContent = '\u0421\u0435\u0442\u044C \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430';
    } finally {
      btn.disabled = false;
    }
  });
</script>
</body>
</html>
`;

// server/upstream.ts
import http from "node:http";
import https from "node:https";
var DEFAULT_TIMEOUT_MS = 3e4;
var tokenCache = null;
var TOKEN_TTL_MS = 10 * 60 * 1e3;
async function getLocalToken(cfg2) {
  if (cfg2.sessionToken) return cfg2.sessionToken;
  if (tokenCache && Date.now() - tokenCache.fetchedAt < TOKEN_TTL_MS) {
    return tokenCache.token;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5e3);
    const res = await fetch(cfg2.localOrigin + "/", { signal: ctrl.signal });
    clearTimeout(t);
    const html = await res.text();
    const m = html.match(/SESSION_TOKEN__\s*=\s*"([^"]+)"/);
    if (m?.[1]) {
      tokenCache = { token: m[1], fetchedAt: Date.now() };
      return m[1];
    }
  } catch {
  }
  return tokenCache?.token ?? null;
}
function invalidateLocalToken() {
  tokenCache = null;
}
var l1Jar = "";
var l1LoginPromise = null;
function ensureL1Login(cfg2) {
  if (l1Jar) return Promise.resolve(l1Jar);
  if (!l1LoginPromise) {
    l1LoginPromise = (async () => {
      if (!cfg2.l1Username || !cfg2.l1Password) {
        throw new Error("\u043A\u0440\u0435\u0434\u044B l1 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u044B (HERMES_L1_USERNAME / HERMES_L1_PASSWORD)");
      }
      const res = await fetch(cfg2.l1Origin + "/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "basic", username: cfg2.l1Username, password: cfg2.l1Password })
      });
      if (!res.ok) throw new Error(`L1 login failed: HTTP ${res.status}`);
      const setCookies = res.headers.getSetCookie?.() ?? [];
      l1Jar = setCookies.map((c) => c.split(";")[0]).filter((c) => /^hermes_session_(at|rt|provider)=/.test(c)).join("; ");
      if (!l1Jar) throw new Error("L1 login succeeded but no session cookies");
      return l1Jar;
    })().finally(() => {
      l1LoginPromise = null;
    });
  }
  return l1LoginPromise;
}
function resetL1Jar() {
  l1Jar = "";
}
async function fetchL1WsTicket(cfg2, jar) {
  try {
    const res = await fetch(cfg2.l1Origin + "/api/auth/ws-ticket", {
      method: "POST",
      headers: { Cookie: jar, Accept: "application/json" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ticket ?? null;
  } catch {
    return null;
  }
}
var HOP_BY_HOP = /* @__PURE__ */ new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "set-cookie",
  "content-length"
  // пересчитываем сами по буферу
]);
function filterResponseHeaders(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v || HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}
function relayToUpstream(opts) {
  return new Promise((resolvePromise, rejectPromise) => {
    const url = new URL(opts.origin + opts.path);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: opts.method,
        headers: { ...opts.headers, host: url.host },
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on(
          "end",
          () => resolvePromise({
            status: res.statusCode ?? 502,
            headers: filterResponseHeaders(res.headers),
            body: Buffer.concat(chunks)
          })
        );
        res.on("error", rejectPromise);
      }
    );
    req.on("timeout", () => req.destroy(new Error(`upstream timeout (${opts.path})`)));
    req.on("error", rejectPromise);
    if (opts.body) {
      opts.body.pipe(req);
    } else {
      req.end();
    }
  });
}
function pickRequestHeaders(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk) || lk === "host" || lk === "cookie" || lk === "authorization") continue;
    out[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}
function toWsUrl(origin, path, search) {
  const u = new URL(origin + path + (search || ""));
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}

// server/wsproxy.ts
import WebSocket from "ws";
function bridgeWs(clientWs, upstreamUrl, headers) {
  const up = new WebSocket(upstreamUrl, headers ? { headers } : void 0);
  let upOpen = false;
  const pendingToUp = [];
  up.on("open", () => {
    upOpen = true;
    for (const m of pendingToUp) up.send(m.data, { binary: m.binary });
    pendingToUp.length = 0;
  });
  up.on("message", (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
  });
  clientWs.on("message", (data, isBinary) => {
    if (upOpen && up.readyState === WebSocket.OPEN) {
      up.send(data, { binary: isBinary });
    } else if (up.readyState === WebSocket.CONNECTING) {
      pendingToUp.push({ data, binary: isBinary });
    }
  });
  let closing = false;
  const closePair = (code, reason, target) => {
    if (closing) return;
    closing = true;
    try {
      target.close(code, reason);
    } catch {
    }
  };
  clientWs.on("close", (code, reason) => closePair(code, reason, up));
  up.on("close", (code, reason) => closePair(code, reason, clientWs));
  up.on("error", (err) => {
    console.warn("[bff:ws] upstream error:", err.message);
    closePair(1011, Buffer.from("upstream error"), clientWs);
  });
  up.on("unexpected-response", (_req, res) => {
    console.warn(`[bff:ws] upstream unexpected response: HTTP ${res.statusCode}`);
    closePair(1011, Buffer.from(`upstream HTTP ${res.statusCode}`), clientWs);
  });
  clientWs.on("error", (err) => {
    console.warn("[bff:ws] client error:", err.message);
    closePair(1011, Buffer.from("client error"), up);
  });
}
async function handleUpgrade(opts) {
  const { req, socket, head, wss: wss2, prepare } = opts;
  try {
    const clientQuery = new URL(req.url ?? "", "http://localhost").searchParams;
    clientQuery.delete("token");
    clientQuery.delete("ticket");
    const target = await prepare(clientQuery);
    if (!target) {
      socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      socket.destroy();
      return true;
    }
    wss2.handleUpgrade(req, socket, head, (clientWs) => {
      bridgeWs(clientWs, target.url, target.headers);
    });
    return true;
  } catch (e) {
    console.warn("[bff:ws] upgrade failed:", e instanceof Error ? e.message : String(e));
    try {
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    } catch {
    }
    return true;
  }
}

// server/index.ts
var CWD = process.cwd();
var cfg;
try {
  cfg = loadConfig(CWD);
} catch (e) {
  console.error(`[bff] \u043E\u0448\u0438\u0431\u043A\u0430 \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u0438: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
var registry = loadAgentsRegistry(CWD, mergedEnv(CWD));
var SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY"
};
var app = new Hono();
function clientIp(c) {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return c.env.incoming.socket.remoteAddress ?? "unknown";
}
function isSecureRequest(c) {
  if (cfg.cookieSecure === "1") return true;
  if (cfg.cookieSecure === "0") return false;
  const proto = c.req.header("x-forwarded-proto") ?? "";
  return proto.split(",")[0].trim() === "https";
}
function sessionFromCookies(c) {
  return parseCookies(c.req.header("cookie"))[SESSION_COOKIE];
}
app.get("/login", (c) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
  return c.html(LOGIN_HTML);
});
app.post("/auth/login", async (c) => {
  const ip = clientIp(c);
  const blocked = loginBlockedFor(ip);
  if (blocked > 0) {
    return c.json({ error: "Too many attempts", retry_after: blocked }, 429);
  }
  let password;
  try {
    const body = await c.req.json();
    password = body.password;
  } catch {
    return c.json({ error: "Bad request: expected JSON {password}" }, 400);
  }
  if (typeof password !== "string" || !verifyPassword(password, cfg.password)) {
    recordLoginFail(ip);
    console.warn(`[bff] \u043D\u0435\u0443\u0434\u0430\u0447\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0441 ${ip}`);
    return c.json({ error: "Invalid password" }, 401);
  }
  clearLoginFails(ip);
  const sid = createSession(ip);
  c.header("Set-Cookie", sessionSetCookie(sid, isSecureRequest(c)));
  console.log(`[bff] \u043B\u043E\u0433\u0438\u043D ok (${ip})`);
  return c.json({ ok: true });
});
app.post("/auth/logout", (c) => {
  destroySession(sessionFromCookies(c));
  c.header("Set-Cookie", sessionClearCookie(isSecureRequest(c)));
  return c.json({ ok: true });
});
app.use("*", async (c, next) => {
  if (!isValidSession(sessionFromCookies(c))) {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith("/api") || path.startsWith("/l1")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.redirect("/login", 302);
  }
  await next();
});
app.get("/api/me", (c) => c.json({ ok: true, user: "operator" }));
app.get("/api/agents", (c) => c.json({ agents: registry.publicAgents }));
function toHonoResponse(up) {
  return new Response(new Uint8Array(up.body), {
    status: up.status,
    headers: { ...up.headers, ...SECURITY_HEADERS }
  });
}
app.all("/api/*", async (c) => {
  const incoming = c.env.incoming;
  const url = new URL(c.req.url);
  const upstreamPath = url.pathname + url.search;
  const method = incoming.method ?? "GET";
  const headers = pickRequestHeaders(incoming.headers);
  const hasBody = method !== "GET" && method !== "HEAD";
  const doRequest = async (token) => {
    if (token) headers["x-hermes-session-token"] = token;
    return relayToUpstream({
      origin: cfg.localOrigin,
      path: upstreamPath,
      method,
      headers,
      body: hasBody ? incoming : null
    });
  };
  try {
    const token = await getLocalToken(cfg);
    let up = await doRequest(token);
    if (up.status === 401 && !cfg.sessionToken) {
      invalidateLocalToken();
      const fresh = await getLocalToken(cfg);
      if (fresh && fresh !== token) {
        up = await doRequest(fresh);
      }
    }
    return toHonoResponse(up);
  } catch (e) {
    console.warn(`[bff] local proxy error (${upstreamPath}):`, e instanceof Error ? e.message : String(e));
    return c.json({ error: "Bad Gateway", details: "local Hermes \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D" }, 502);
  }
});
var L1_DENY = /* @__PURE__ */ new Set(["/api/auth/ws-ticket", "/auth/password-login", "/api/auth/session-token"]);
app.all("/l1/*", async (c) => {
  const incoming = c.env.incoming;
  const url = new URL(c.req.url);
  const stripped = url.pathname.replace(/^\/l1/, "") || "/";
  if (L1_DENY.has(stripped)) {
    return c.json({ error: "Not Found" }, 404);
  }
  const upstreamPath = stripped + url.search;
  const method = incoming.method ?? "GET";
  const baseHeaders = pickRequestHeaders(incoming.headers);
  const hasBody = method !== "GET" && method !== "HEAD";
  const doRequest = async (jar) => {
    return relayToUpstream({
      origin: cfg.l1Origin,
      path: upstreamPath,
      method,
      headers: { ...baseHeaders, ...jar ? { cookie: jar } : {} },
      // Тело стримится один раз: при ретрае его уже нет — для POST с телом
      // ретрай не делается (см. ниже).
      body: hasBody ? incoming : null
    });
  };
  try {
    let jar = await ensureL1Login(cfg).catch(() => "");
    const up = await doRequest(jar);
    if (up.status === 401 && !hasBody) {
      resetL1Jar();
      jar = await ensureL1Login(cfg).catch(() => "");
      return toHonoResponse(await doRequest(jar));
    }
    return toHonoResponse(up);
  } catch (e) {
    console.warn(`[bff] l1 proxy error (${upstreamPath}):`, e instanceof Error ? e.message : String(e));
    return c.json({ error: "Bad Gateway", details: "\u0430\u0433\u0435\u043D\u0442 l1 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D" }, 502);
  }
});
var SPA_INDEX_PATH = resolve2(cfg.distDir, "index.html");
function spaIndexResponse(c) {
  if (!existsSync2(SPA_INDEX_PATH)) {
    return c.text("dist/ \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D: \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u0435 `npm run build`", 503);
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
  c.header("content-type", "text/html; charset=utf-8");
  c.header("cache-control", "no-cache, must-revalidate");
  return c.body(readFileSync2(SPA_INDEX_PATH));
}
app.get("/", (c) => spaIndexResponse(c));
app.get("/index.html", (c) => spaIndexResponse(c));
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", (c) => spaIndexResponse(c));
var wss = new WebSocketServer2({ noServer: true });
var nodeServer = serve(
  { fetch: app.fetch, port: cfg.port, hostname: "0.0.0.0" },
  (info) => {
    console.log(`[bff] hermes_plus BFF: http://127.0.0.1:${info.port}`);
    console.log(`[bff] local \u2192 ${cfg.localOrigin} | l1 \u2192 ${cfg.l1Origin}`);
    console.log(`[bff] \u0430\u0433\u0435\u043D\u0442\u043E\u0432 \u0432 \u0440\u0435\u0435\u0441\u0442\u0440\u0435: ${registry.agents.length}`);
    if (!existsSync2(resolve2(cfg.distDir, "index.html"))) {
      console.warn("[bff] \u0412\u041D\u0418\u041C\u0410\u041D\u0418\u0415: dist/index.html \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u2014 UI \u043D\u0435 \u0431\u0443\u0434\u0435\u0442 \u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C (npm run build)");
    }
  }
);
nodeServer.on("upgrade", (req, socket, head) => {
  void (async () => {
    const cookies = parseCookies(req.headers.cookie);
    if (!isValidSession(cookies[SESSION_COOKIE])) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const pathname = new URL(req.url ?? "", "http://localhost").pathname;
    if (pathname === "/api/ws") {
      await handleUpgrade({
        req,
        socket,
        head,
        wss,
        prepare: async (q) => {
          const token = await getLocalToken(cfg);
          if (!token) return null;
          q.set("token", token);
          return { url: toWsUrl(cfg.localOrigin, "/api/ws", `?${q.toString()}`) };
        }
      });
      return;
    }
    if (pathname === "/l1/api/ws") {
      await handleUpgrade({
        req,
        socket,
        head,
        wss,
        prepare: async (q) => {
          try {
            const jar = await ensureL1Login(cfg);
            const ticket = await fetchL1WsTicket(cfg, jar);
            if (!ticket) return null;
            q.set("ticket", ticket);
            return {
              url: toWsUrl(cfg.l1Origin, "/api/ws", `?${q.toString()}`),
              headers: { Cookie: jar }
            };
          } catch (e) {
            console.warn("[bff:ws] l1 prepare failed:", e instanceof Error ? e.message : String(e));
            return null;
          }
        }
      });
      return;
    }
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  })();
});
process.on("SIGINT", () => {
  console.log("\n[bff] SIGINT \u2014 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430");
  wss.close();
  nodeServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2e3).unref();
});
