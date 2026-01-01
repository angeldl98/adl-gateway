import { Router } from "express";
import pg from "pg";

const { Pool } = pg;
const router = Router();

function buildPool() {
  const connStr = process.env.DATABASE_URL;
  if (connStr) {
    return new Pool({ connectionString: connStr });
  }
  const host = process.env.POSTGRES_HOST || process.env.PGHOST || "postgres";
  const port = Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432);
  const user = process.env.POSTGRES_USER || process.env.PGUSER || "adl";
  const password = process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "";
  const database = process.env.POSTGRES_DB || process.env.PGDATABASE || "adl_core";
  return new Pool({ host, port, user, password, database });
}

const pool = buildPool();

function sanitizeLimit(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 50;
  return Math.min(Math.max(Math.trunc(num), 1), 200);
}

function sanitizeOffset(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.max(Math.trunc(num), 0);
}

router.get("/boe-auctions", async (req, res) => {
  const limit = sanitizeLimit(req.query.limit);
  const offset = sanitizeOffset(req.query.offset);
  const auctionStatus = (req.query.auction_status || "").toString().trim();
  const province = (req.query.province || "").toString().trim();

  const conditions = [];
  const params = [];

  if (auctionStatus) {
    params.push(auctionStatus);
    conditions.push(`auction_status = $${params.length}`);
  }

  if (province) {
    params.push(province);
    conditions.push(`province = $${params.length}`);
  }

  params.push(limit);
  params.push(offset);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        auction_type,
        auction_status,
        start_date,
        end_date,
        starting_price,
        deposit_amount,
        province,
        municipality,
        normalized_at
      FROM boe_subastas_norm
      ${where}
      ORDER BY normalized_at DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
      `,
      params
    );

    res.json({
      data: result.rows,
      pagination: {
        limit,
        offset,
        count: result.rows.length,
      },
    });
  } catch (err) {
    console.error("boe-auctions query failed", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;

