const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const required = ["DATABASE_URL", "SESSION_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD"];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.ADMIN_PASSWORD.length < 12) {
  console.error("ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
});
const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(session({
  store: new pgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  name: "uvp.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: "auto", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 }
}));

async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('administrador','editor','lector')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);
  const username = process.env.ADMIN_USERNAME.trim().toLowerCase();
  const existing = await pool.query("SELECT id FROM app_users WHERE username=$1", [username]);
  if (!existing.rowCount) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await pool.query(
      "INSERT INTO app_users(name,username,password_hash,role) VALUES($1,$2,$3,'administrador')",
      [process.env.ADMIN_NAME || "Administrador", username, hash]
    );
  }
  await pool.query(
    "INSERT INTO app_settings(key,value) VALUES('campaign',$1) ON CONFLICT(key) DO NOTHING",
    [JSON.stringify({ name: "Lanzamiento de producto", dates: "1 — 30 noviembre 2026" })]
  );
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Inicia sesión para continuar." });
  next();
}
function requireAdmin(req, res, next) {
  if (req.session.user?.role !== "administrador") return res.status(403).json({ error: "Acceso no autorizado." });
  next();
}
function sameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin && origin !== `${req.protocol}://${req.get("host")}`) {
    return res.status(403).json({ error: "Solicitud de origen no permitido." });
  }
  next();
}
app.use("/api", sameOrigin);

app.use("/api/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." }
}));
app.post("/api/login", async (req, res, next) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const result = await pool.query("SELECT id,name,username,password_hash,role FROM app_users WHERE username=$1", [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.password_hash))) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.user = { id: user.id, name: user.name, username: user.username, role: user.role };
    res.json({ user: req.session.user });
  } catch (err) { next(err); }
});
app.post("/api/logout", requireAuth, (req, res, next) => {
  req.session.destroy(err => err ? next(err) : res.clearCookie("uvp.sid", { sameSite: "lax" }).json({ ok: true }));
});
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));
app.get("/api/data", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT value FROM app_settings WHERE key='campaign'");
    res.json({ campaign: result.rows[0]?.value || {} });
  } catch (err) { next(err); }
});
app.put("/api/campaign", requireAuth, async (req, res, next) => {
  if (!["administrador", "editor"].includes(req.session.user.role)) return res.status(403).json({ error: "Acceso no autorizado." });
  const name = String(req.body.name || "").trim().slice(0, 160);
  const dates = String(req.body.dates || "").trim().slice(0, 160);
  if (!name || !dates) return res.status(400).json({ error: "Completa los datos de campaña." });
  try {
    const campaign = { name, dates };
    await pool.query("INSERT INTO app_settings(key,value) VALUES('campaign',$1) ON CONFLICT(key) DO UPDATE SET value=$1", [JSON.stringify(campaign)]);
    res.json({ campaign });
  } catch (err) { next(err); }
});
app.get("/api/users", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT id,name,username,role FROM app_users ORDER BY id");
    res.json({ users: result.rows });
  } catch (err) { next(err); }
});
app.post("/api/users", requireAuth, requireAdmin, async (req, res, next) => {
  const name = String(req.body.name || "").trim().slice(0, 120);
  const username = String(req.body.username || "").trim().toLowerCase().slice(0, 80);
  const password = String(req.body.password || "");
  const role = req.body.role;
  if (!name || !/^[a-z0-9._-]{3,80}$/.test(username) || password.length < 12 || !["administrador", "editor", "lector"].includes(role)) {
    return res.status(400).json({ error: "Revisa los datos. El usuario debe tener 3–80 caracteres y la contraseña al menos 12." });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO app_users(name,username,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,username,role",
      [name, username, hash, role]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ese nombre de usuario ya está en uso." });
    next(err);
  }
});
app.put("/api/users/:id", requireAuth, requireAdmin, async (req, res, next) => {
  const { id } = req.params;
  const name = String(req.body.name || "").trim().slice(0, 120);
  const username = String(req.body.username || "").trim().toLowerCase().slice(0, 80);
  const role = req.body.role;
  const password = String(req.body.password || "");
  if (!name || !/^[a-z0-9._-]{3,80}$/.test(username) || !["administrador", "editor", "lector"].includes(role) || (password && password.length < 12)) {
    return res.status(400).json({ error: "Revisa los datos. La contraseña debe tener al menos 12 caracteres." });
  }
  try {
    const params = [name, username, role, id];
    let query = "UPDATE app_users SET name=$1,username=$2,role=$3 WHERE id=$4 RETURNING id,name,username,role";
    if (password) {
      params.push(await bcrypt.hash(password, 12));
      query = "UPDATE app_users SET name=$1,username=$2,role=$3,password_hash=$5 WHERE id=$4 RETURNING id,name,username,role";
    }
    const result = await pool.query(query, params);
    if (!result.rowCount) return res.status(404).json({ error: "Usuario no encontrado." });
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ese nombre de usuario ya está en uso." });
    next(err);
  }
});
app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res, next) => {
  if (String(req.session.user.id) === String(req.params.id)) return res.status(400).json({ error: "No puedes eliminar tu propia cuenta." });
  try {
    const result = await pool.query("DELETE FROM app_users WHERE id=$1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Usuario no encontrado." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get("/Dashboard_UVP_actualizado.html", requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "Dashboard_UVP_actualizado.html"))
);
app.get(["/server.js", "/package.json", "/render.yaml", "/appwrite.config.json"], (req, res) => res.sendStatus(404));
app.use(express.static(path.join(__dirname), { index: "index.html", dotfiles: "deny" }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.use((err, req, res, next) => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: "Ocurrió un error. Intenta nuevamente." });
});

const port = process.env.PORT || 3000;
initialize().then(() => app.listen(port, () => console.log(`Resultados UVP listening on ${port}`)))
  .catch(err => { console.error("Database initialization failed:", err); process.exit(1); });
