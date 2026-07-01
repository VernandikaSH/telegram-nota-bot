require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const { handlePhoto } = require('./handlers/photoHandler');
const { handleCallback } = require('./handlers/callbackHandler');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // kosongkan untuk mode polling (lokal)
const PORT = process.env.PORT || 8080;

if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN belum diset di .env');
  process.exit(1);
}

const app = express();
app.use(express.json());

let bot;

if (WEBHOOK_URL) {
  // ==== MODE WEBHOOK (production, misalnya di Render) ====
  bot = new TelegramBot(TOKEN, { webHook: true });
  const webhookPath = `/bot${TOKEN}`;

  bot.setWebHook(`${WEBHOOK_URL}${webhookPath}`);

  app.post(webhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  console.log('Bot berjalan dalam mode WEBHOOK');
} else {
  // ==== MODE POLLING (development lokal, tidak butuh URL publik) ====
  bot = new TelegramBot(TOKEN, { polling: true });
  console.log('Bot berjalan dalam mode POLLING (lokal)');
}

// Health check endpoint — berguna supaya Render free tier tidak mengira service mati
app.get('/', (req, res) => {
  res.send('Telegram Nota Bot is running ✅');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// ==== Routing pesan Telegram ====

bot.on('photo', (msg) => {
  handlePhoto(bot, msg);
});

bot.on('callback_query', (callbackQuery) => {
  handleCallback(bot, callbackQuery);
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    '👋 Halo! Kirim foto struk/nota belanja ke sini, nanti saya bacakan ringkasannya dan bisa langsung kamu simpan ke Google Sheets.'
  );
});

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

bot.on('webhook_error', (err) => {
  console.error('Webhook error:', err.message);
});
