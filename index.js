import express from "express";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const token = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.RAILWAY_URL;

if (!token) {
  console.log("❌ TELEGRAM_BOT_TOKEN missing");
  process.exit(1);
}

const bot = new TelegramBot(token);

console.log("🤖 Bot starting...");

// webhook set
bot.setWebHook(`${WEBHOOK_URL}/bot${token}`);

// telegram webhook route
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// test route (important for Railway)
app.get("/", (req, res) => {
  res.send("Bot running 24/7 🚀");
});

// start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
