import express from "express";
import cors from "cors";
import { router } from "./routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nclt-bot" });
});

app.use("/api", router);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`NCLT Bot server listening on http://localhost:${port}`);
});
