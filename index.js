import express from "express";
import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const token = process.env.TELEGRAM_BOT_TOKEN;
const OPENSEA_API = process.env.OPENSEA_API_KEY;
const WEBHOOK_URL = process.env.RAILWAY_URL;

if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN missing");
  process.exit(1);
}

// Telegram bot
const bot = new TelegramBot(token);

// webhook set
bot.setWebHook(`${WEBHOOK_URL}/bot${token}`);

console.log("🔧 Bot start ho raha hai...");
console.log("🌐 Webhook URL:", WEBHOOK_URL);
console.log("🔑 OpenSea API:", OPENSEA_API ? "Set ✅" : "Missing ❌");

// webhook route
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// test route
app.get("/", (req, res) => {
  res.send("🤖 Mint bot running 24/7");
});

// Telegram commands
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🚀 Mint bot active! Waiting for alerts.");
});

// Example OpenSea check
async function checkMint(contract) {
  try {
    const url = `https://api.opensea.io/api/v2/chain/ethereum/contract/${contract}`;

    const res = await axios.get(url, {
      headers: {
        "X-API-KEY": OPENSEA_API,
      },
    });

    return res.data;
  } catch (err) {
    console.error("OpenSea error:", err.message);
  }
}

// server start
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log("✅ Bot ready! Waiting for messages...");
});
