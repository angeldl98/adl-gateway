import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(
  "/",
  createProxyMiddleware({
    target: "http://adl-web:3000",
    changeOrigin: true,
  })
);

app.listen(PORT, () => {
  console.log(`adl-gateway listening on port ${PORT}`);
});
