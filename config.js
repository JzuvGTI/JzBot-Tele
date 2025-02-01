require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2');

// Konfigurasi Bot Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Konfigurasi Database MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect(err => {
    if (err) throw err;
    console.log("Database Connected!");
});

module.exports = { bot, db };
