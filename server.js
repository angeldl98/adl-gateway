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

// --- LOGIN (temporary hardcoded user) ---
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  // TEMPORARY: replace later with DB/users
  if (username !== "admin" || password !== "admin") {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { sub: username, role: "admin" },
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
