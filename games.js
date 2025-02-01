const { bot, db } = require("./config");

// Fungsi untuk mendapatkan angka Reme
function getRemeValue(num) {
    const digits = num.toString().split('').map(Number);
    let sum = digits.reduce((a, b) => a + b, 0);
    return sum >= 10 ? sum % 10 : sum;
}

// Fungsi mendapatkan XP secara random (1-45)
function getRandomXP() {
    return Math.floor(Math.random() * 45) + 1;
}

// Fungsi untuk memperbarui XP dan level
function updateXPAndLevel(telegramId, chatId, earnedXP) {
    db.query("SELECT xp, level FROM users WHERE telegram_id = ?", [telegramId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return;

        let { xp, level } = results[0];
        xp += earnedXP;

        // Hitung batas XP untuk naik level
        let requiredXP = 100 * Math.pow(2, level - 1);
        let levelUp = false;

        while (xp >= requiredXP) {
            xp -= requiredXP;
            level++;
            levelUp = true;
            requiredXP = 100 * Math.pow(2, level - 1);
        }

        db.query("UPDATE users SET xp = ?, level = ? WHERE telegram_id = ?", [xp, level, telegramId]);

        let xpMessage = `🌟 *XP Diperoleh:* +${earnedXP} XP\n📈 *XP Sekarang:* ${xp}/${requiredXP} XP\n🏆 *Level:* ${level}`;
        if (levelUp) xpMessage += `\n🔥 *Level Up! Selamat, Anda naik ke level ${level}!*`;

        bot.sendMessage(chatId, xpMessage, { parse_mode: "Markdown" });
    });
}

// Fungsi untuk mendapatkan angka QQ (angka belakang)
function getQQValue(num) {
    return num % 10;
}

// Fungsi untuk memformat angka menjadi Rupiah
function formatRupiah(amount) {
    return `Rp ${amount.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Fungsi utama taruhan
function placeBet(chatId, telegramId, amount, gameType) {
    if (amount < 100) {
        bot.sendMessage(chatId, "⚠ Minimal taruhan adalah Rp 100!");
        return;
    }

    db.query("SELECT balance FROM users WHERE telegram_id = ?", [telegramId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            bot.sendMessage(chatId, "⚠ Anda belum terdaftar! Ketik /register untuk memulai.");
            return;
        }

        const currentBalance = results[0].balance;
        if (currentBalance < amount) {
            bot.sendMessage(chatId, "❌ Saldo tidak cukup!");
            return;
        }

        const playerSpin = Math.floor(Math.random() * 37); // Angka maksimal 36
        const systemSpin = Math.floor(Math.random() * 37);
        let winnings = 0;

        let resultMessage = `🎰 *Game:* ${gameType}\n`;
        resultMessage += `=======================\n`;

        if (gameType === "Reme") {
            const playerReme = getRemeValue(playerSpin);
            const systemReme = getRemeValue(systemSpin);
            resultMessage += `🎲 *Player Spin:* ${playerSpin}\n🔢 *User:* ${playerSpin.toString().split('').join('+')} = ${playerReme}\n`;
            resultMessage += `🎲 *Sistem Spin:* ${systemSpin}\n🔢 *Sistem:* ${systemSpin.toString().split('').join('+')} = ${systemReme}\n\n`;

            if (playerReme === systemReme) {
                winnings = -amount; // Seri, sistem menang
            } else if (playerReme > systemReme) {
                winnings = amount * 2;
                if ([0, 19, 28].includes(playerSpin)) {
                    winnings = amount * 3;
                    resultMessage += `🔥 *Bonus x3 karena angka spesial!*\n`;
                }
            } else {
                winnings = -amount;
            }

            resultMessage += winnings > 0 ? `🎉 *Menang!* +${formatRupiah(winnings)} 💰\n` : `💀 *Kalah!* -${formatRupiah(-winnings)} 💰\n`;

        } else if (gameType === "Casino") {
            resultMessage += `🎲 *Player Spin:* ${playerSpin}\n`;
            resultMessage += `🎲 *Sistem Spin:* ${systemSpin}\n\n`;

            if (playerSpin === systemSpin) {
                winnings = 0; // Draw, taruhan dikembalikan
            } else if (playerSpin === 0) {
                winnings = amount * 2; // Jika angka 0, otomatis menang (tidak draw)
            } else if (playerSpin > systemSpin) {
                winnings = amount * 2;
            } else {
                winnings = -amount;
            }

            resultMessage += winnings > 0 ? `🎉 *Menang!* +${formatRupiah(winnings)} 💰\n` :
                winnings === 0 ? `🤝 *Draw!* Taruhan dikembalikan.\n` :
                `💀 *Kalah!* -${formatRupiah(-winnings)} 💰\n`;

        } else if (gameType === "QQ") {
            const playerQQ = getQQValue(playerSpin);
            const systemQQ = getQQValue(systemSpin);
            resultMessage += `🎲 *Player Spin Get:* ${playerSpin} (QQ: ${playerQQ})\n`;
            resultMessage += `🎲 *Sistem Spin Get:* ${systemSpin} (QQ: ${systemQQ})\n\n`;

            if (playerQQ === 0) {
                winnings = amount * 2; // Jika angka belakangnya 0, otomatis menang
            } else if (playerQQ > systemQQ) {
                winnings = amount * 2;
            } else if (playerQQ === systemQQ) {
                winnings = 0; // Draw, taruhan dikembalikan
            } else {
                winnings = -amount;
            }

            resultMessage += winnings > 0 ? `🎉 *Menang!* +${formatRupiah(winnings)} 💰\n` :
                winnings === 0 ? `🤝 *Draw!* Taruhan dikembalikan.\n` :
                `💀 *Kalah!* -${formatRupiah(-winnings)} 💰\n`;
        }

        // Update saldo setelah permainan
        const newBalance = currentBalance + winnings;
        db.query("UPDATE users SET balance = ? WHERE telegram_id = ?", [newBalance, telegramId]);

        resultMessage += `🏦 *Saldo Sekarang:* ${formatRupiah(newBalance)} 💰\n`;
        resultMessage += `=======================`;

        bot.sendMessage(chatId, resultMessage, { parse_mode: "Markdown" });
        
        // Tambahkan XP setelah bermain game
        const earnedXP = getRandomXP();
        updateXPAndLevel(telegramId, chatId, earnedXP);
    });
}

module.exports = { placeBet };
