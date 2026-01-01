import express from "express";
import jwt from "jsonwebtoken";
import { createProxyMiddleware } from "http-proxy-middleware";
import pg from "pg";
import boeAuctionsRouter from "./src/routes/api/v1/boe-auctions.js";
import pharmaMedicinesRouter from "./src/routes/api/v1/pharma-medicines.js";

const app = express();
const PORT = process.env.PORT || 8080;
const { Client } = pg;

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

app.use(express.json());

async function checkDb() {
  const host =
    process.env.POSTGRES_HOST || process.env.PGHOST || "adl-postgres";
  const port = Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432);
  const user = process.env.POSTGRES_USER || process.env.PGUSER || "adl";
  const password = process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "";
  const database = process.env.POSTGRES_DB || process.env.PGDATABASE || "adl_core";
  const connStr =
    process.env.DATABASE_URL ||
    `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  const client = new Client({ connectionString: connStr });
  const result = { ok: false, error: null };
  try {
    await client.connect();
    await client.query("SELECT 1");
    result.ok = true;
  } catch (err) {
    result.error = err?.message || String(err);
  } finally {
    await client.end().catch(() => {});
  }
  return result;
}

async function checkWeb() {
  const target = process.env.READYZ_WEB_URL || "http://adl-web:3000/api/health";
  try {
    const resp = await fetch(target);
    return { ok: resp.ok, status: resp.status };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// Temporary in-memory users with roles/plans
const USERS = {
  admin: { password: "admin", role: "admin", plan: "pro" },
  user: { password: "user", role: "user", plan: "free" },
  trial: { password: "trial", role: "trial", plan: "free" },
};

// --- LOGIN (temporary hardcoded users) ---
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = USERS[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    {
      sub: username,
      role: user.role,
      plan: user.plan,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.json({ token });
});

// Liveness (sin auth)
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Readiness (con auth + dependencia de DB y adl-web)
app.get("/readyz", authMiddleware, async (_req, res) => {
  const [db, web] = await Promise.all([checkDb(), checkWeb()]);
  const ready = db.ok && web.ok;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "degraded",
    db,
    web
  });
});

// --- AUTH MIDDLEWARE ---
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(roles = []) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: role not allowed" });
    }
    next();
  };
}

function requirePlan(plans = []) {
  return (req, res, next) => {
    if (!plans.includes(req.user.plan)) {
      return res.status(403).json({ error: "Forbidden: plan not allowed" });
    }
    next();
  };
}

// --- Example protected APIs ---
app.get("/api/admin", authMiddleware, requireRole(["admin"]), (req, res) => {
  res.json({ message: "Admin access granted" });
});

app.get(
  "/api/pro",
  authMiddleware,
  requirePlan(["pro"]),
  (req, res) => {
    res.json({ message: "Pro plan access granted" });
  }
);

// --- API v1 (read-only data exposition) ---
app.use("/api/v1", authMiddleware, boeAuctionsRouter);
app.use("/api/v1", authMiddleware, pharmaMedicinesRouter);

// --- PROTECTED ROUTES ---
app.use(
  "/",
  authMiddleware,
  createProxyMiddleware({
    target: "http://adl-web:3000",
    changeOrigin: true,
  })
);

// --- HEALTH ---
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`adl-gateway with auth listening on port ${PORT}`);
});
