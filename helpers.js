const { db } = require("./config");

// Fungsi untuk cek apakah user sudah terdaftar
function checkRegistration(telegramId, callback) {
    db.query("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, results) => {
        if (err) throw err;
        callback(results.length > 0, results[0]);
    });
}

module.exports = { checkRegistration };
