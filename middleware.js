const { bot } = require("./config");
const { checkRegistration } = require("./helpers");

function requireRegistration(command, handler) {
    bot.onText(new RegExp(`\\/${command} ?(.*)?`), (msg, match) => {
        const chatId = msg.chat.id;
        const telegramId = msg.from.id;

        checkRegistration(telegramId, (isRegistered, user) => {
            if (!isRegistered) {
                bot.sendMessage(chatId, "⚠ Anda belum terdaftar! Ketik /register untuk memulai.");
                return;
            }
            handler(msg, match, user);
        });
    });
}

module.exports = { requireRegistration };
