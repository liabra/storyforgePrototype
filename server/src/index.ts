import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRoutes from "./routes/index";

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://front-storyforge.up.railway.app"
  ],
  credentials: true
}));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "StoryForge API running" });
});

app.use("/api", apiRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});