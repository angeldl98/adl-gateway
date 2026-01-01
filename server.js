import express from "express";
import jwt from "jsonwebtoken";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const PORT = process.env.PORT || 8080;

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

app.use(express.json());

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
