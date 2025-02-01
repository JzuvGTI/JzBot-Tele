const { bot, db } = require("./config");
const { requireRegistration } = require("./middleware");
const { placeBet } = require("./games");
const moment = require("moment");

// Fungsi untuk memformat angka menjadi Rupiah
function formatRupiah(amount) {
    return `Rp ${amount.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
// Fungsi untuk mendapatkan cooldown terakhir dari pengguna
function getCooldown(telegramId, type, callback) {
    db.query("SELECT * FROM cooldowns WHERE telegram_id = ? AND type = ?", [telegramId, type], (err, results) => {
        if (err) return callback(err, null);
        callback(null, results.length > 0 ? results[0] : null);
    });
}

// Fungsi untuk menyimpan cooldown
function setCooldown(telegramId, type, timestamp, callback) {
    db.query("REPLACE INTO cooldowns (telegram_id, type, last_used) VALUES (?, ?, ?)", [telegramId, type, timestamp], (err) => {
        if (err) return callback(err);
        callback(null);
    });
}

// Command /register
bot.onText(/\/register/, (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const name = msg.from.first_name;
    const username = msg.from.username || null;

    db.query("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            bot.sendMessage(chatId, "Anda sudah terdaftar!");
        } else {
            db.query("INSERT INTO users (telegram_id, name, username, balance) VALUES (?, ?, ?, 1000)", 
            [telegramId, name, username], (err) => {
                if (err) throw err;
                bot.sendMessage(chatId, `Registrasi berhasil! 🎉 Anda mendapatkan saldo awal ${formatRupiah(1000)} 💰`);
            });
        }
    });
});

// Command /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
📌 *Daftar Perintah Bot*  
=========================  

👤 *Akun:*  
➤ \`/register\`  
➤ \`/profile\`  
➤ \`/saldo\`  

🎰 *Casino:*  
➤ \`/qq <jumlah>\`  
➤ \`/casino <jumlah>\`  
➤ \`/reme <jumlah>\`  

💸 *Ekonomi:*  
➤ \`/transfer <username|telegram_id|mention> @username\`  
➤ \`/givebalance <username|telegram_id|mention> @username\`  
➤ \`/daily (1 Days cooldowns)\`  
➤ \`/farm (2 Minutes cooldowns)\`  


🔧 *Role:*  
➤ \`/giverole <username|telegram_id|mention> <role_id>\`  
1️⃣ User  
2️⃣ Moderator  
3️⃣ Developer  

=========================  
`;

    bot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" });
});



// Command saldo
requireRegistration("saldo", (msg, match, user) => {
    bot.sendMessage(msg.chat.id, `💰 *Saldo Anda:* ${formatRupiah(user.balance)}`, { parse_mode: "Markdown" });
});

// Command qq, casino, reme
requireRegistration("reme", (msg, match, user) => {
    const amount = parseInt(match[1]);
    if (isNaN(amount)) {
        bot.sendMessage(msg.chat.id, "⚠ Format salah! Gunakan /reme <jumlah>");
        return;
    }
    placeBet(msg.chat.id, msg.from.id, amount, "Reme");
});

requireRegistration("casino", (msg, match, user) => {
    const amount = parseInt(match[1]);
    if (isNaN(amount)) {
        bot.sendMessage(msg.chat.id, "⚠ Format salah! Gunakan /casino <jumlah>");
        return;
    }
    placeBet(msg.chat.id, msg.from.id, amount, "Casino");
});

requireRegistration("qq", (msg, match, user) => {
    const amount = parseInt(match[1]);
    if (isNaN(amount)) {
        bot.sendMessage(msg.chat.id, "⚠ Format salah! Gunakan /qq <jumlah>");
        return;
    }
    placeBet(msg.chat.id, msg.from.id, amount, "QQ");
});

// Fungsi untuk mendapatkan user dari telegram_id, username, atau mention
function getUserIdentifier(input, callback) {
    if (!isNaN(input)) {
        // Jika input angka, anggap sebagai telegram_id
        db.query("SELECT telegram_id FROM users WHERE telegram_id = ?", [input], (err, results) => {
            if (err) return callback(err, null);
            if (results.length > 0) return callback(null, results[0].telegram_id);
            return callback(null, null);
        });
    } else if (input.startsWith("@")) {
        // Jika input dimulai dengan @, anggap sebagai username
        const username = input.replace("@", "");
        db.query("SELECT telegram_id FROM users WHERE username = ?", [username], (err, results) => {
            if (err) return callback(err, null);
            if (results.length > 0) return callback(null, results[0].telegram_id);
            return callback(null, null);
        });
    } else {
        callback(null, null);
    }
}

// Fungsi untuk memberikan role ke pengguna
bot.onText(/\/giverole (\S+) (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    const targetUserInput = match[1];
    const roleId = parseInt(match[2]);

    // Cek apakah role yang diberikan valid
    if (![1, 2, 3].includes(roleId)) {
        bot.sendMessage(chatId, "⚠ Role ID tidak valid! Gunakan:\n1️⃣ User\n2️⃣ Moderator\n3️⃣ Developer");
        return;
    }

    // Cek apakah pengirim adalah Developer
    db.query("SELECT role FROM users WHERE telegram_id = ?", [senderId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            bot.sendMessage(chatId, "⚠ Anda belum terdaftar! Ketik /register untuk memulai.");
            return;
        }

        const senderRole = results[0].role;
        if (senderRole !== 3) {
            bot.sendMessage(chatId, "❌ Anda tidak memiliki izin untuk memberikan role!");
            return;
        }

        // Ambil telegram_id target berdasarkan input (ID, username, atau mention)
        getUserIdentifier(targetUserInput, (err, targetUserId) => {
            if (err) throw err;
            if (!targetUserId) {
                bot.sendMessage(chatId, "⚠ Pengguna tidak ditemukan di database!");
                return;
            }

            // Perbarui role pengguna
            db.query("UPDATE users SET role = ? WHERE telegram_id = ?", [roleId, targetUserId], (err, result) => {
                if (err) throw err;
                if (result.affectedRows === 0) {
                    bot.sendMessage(chatId, "⚠ Gagal mengubah role, pastikan ID benar!");
                    return;
                }

                const roleNames = { 1: "User", 2: "Moderator", 3: "Developer" };
                bot.sendMessage(chatId, `✅ Role berhasil diberikan!\n👤 *User ID:* ${targetUserId}\n🎭 *Role Baru:* ${roleNames[roleId]}`, { parse_mode: "Markdown" });
            });
        });
    });
});

bot.onText(/\/profile/, (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || '-';

    db.query("SELECT name, balance, level, xp, role FROM users WHERE telegram_id = ?", [telegramId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            bot.sendMessage(chatId, "⚠ Anda belum terdaftar! Ketik /register untuk memulai.");
            return;
        }

        const { name, balance, level, xp, role } = results[0];
        const roleName = role === 1 ? "User" : role === 2 ? "Moderator" : "Developer";
        const formattedBalance = formatRupiah(balance);
        const xpRequired = 100 * Math.pow(2, level - 1);
        
        const profileMessage = `
📜 *Profile Pengguna*  
====================  
👤 *Nama:* ${name}  
💬 *Username:* @${username}  
🏦 *Saldo:* ${formattedBalance} 💰  
📈 *Level:* ${level}  
🌟 *XP:* ${xp} / ${xpRequired} XP  
🛡️ *Role:* ${roleName}  

====================
Gunakan perintah lain untuk melanjutkan permainan atau transfer saldo!  
`;

        bot.sendMessage(chatId, profileMessage, { parse_mode: "Markdown" });
    });
});

bot.onText(/\/givebalance (\d+) (\S+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    const amount = parseInt(match[1]);
    const targetInput = match[2]; // Bisa berupa username, telegram_id, atau tag

    if (isNaN(amount) || amount <= 0) {
        bot.sendMessage(chatId, "⚠ Format salah! Gunakan /givebalance <jumlah> <username/telegram_id/tag>");
        return;
    }

    // Cek apakah sender adalah Developer
    db.query("SELECT role FROM users WHERE telegram_id = ?", [senderId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            bot.sendMessage(chatId, "⚠ Anda belum terdaftar! Ketik /register untuk memulai.");
            return;
        }

        const senderRole = results[0].role;

        if (senderRole !== 3) {  // Pastikan hanya Developer (role 3) yang bisa menggunakan perintah ini
            bot.sendMessage(chatId, "❌ Anda tidak memiliki izin untuk memberikan balance!");
            return;
        }

        // Fungsi untuk mendapatkan user berdasarkan input
        function getUserIdentifier(input, callback) {
            if (!isNaN(input)) {
                // Jika input berupa telegram_id
                db.query("SELECT telegram_id FROM users WHERE telegram_id = ?", [input], (err, results) => {
                    if (err) return callback(err, null);
                    if (results.length > 0) return callback(null, results[0].telegram_id);
                    return callback(null, null);
                });
            } else if (input.startsWith("@")) {
                // Jika input berupa username
                const username = input.replace("@", "");
                db.query("SELECT telegram_id FROM users WHERE username = ?", [username], (err, results) => {
                    if (err) return callback(err, null);
                    if (results.length > 0) return callback(null, results[0].telegram_id);
                    return callback(null, null);
                });
            } else {
                // Jika input berupa tag (dalam grup), ambil telegram_id berdasarkan mention
                const telegramIdMatch = input.match(/@(\w+)/);
                if (telegramIdMatch) {
                    const username = telegramIdMatch[1];
                    db.query("SELECT telegram_id FROM users WHERE username = ?", [username], (err, results) => {
                        if (err) return callback(err, null);
                        if (results.length > 0) return callback(null, results[0].telegram_id);
                        return callback(null, null);
                    });
                } else {
                    callback(null, null);
                }
            }
        }

        // Ambil telegram_id target berdasarkan input (username/telegram_id/tag)
        getUserIdentifier(targetInput, (err, targetUserId) => {
            if (err) throw err;
            if (!targetUserId) {
                bot.sendMessage(chatId, "⚠ Pengguna tidak ditemukan!");
                return;
            }

            // Update saldo pengguna yang diberikan balance
            db.query("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [amount, targetUserId], (err) => {
                if (err) throw err;

                bot.sendMessage(chatId, `✅ Berhasil memberikan ${formatRupiah(amount)} kepada pengguna dengan username @${targetInput}.`);
            });
        });
    });
});


bot.onText(/\/transfer (\d+) (\S+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    const amount = parseInt(match[1]);
    const targetInput = match[2]; // Bisa berupa username, telegram_id, atau tag

    if (isNaN(amount) || amount <= 0) {
        bot.sendMessage(chatId, "⚠ Format salah! Gunakan /givebalance <jumlah> <username/telegram_id/tag>");
        return;
    }

    // Cek apakah sender adalah Developer
    db.query("SELECT role, balance FROM users WHERE telegram_id = ?", [senderId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            bot.sendMessage(chatId, "⚠ Anda belum terdaftar! Ketik /register untuk memulai.");
            return;
        }

        const senderRole = results[0].role;
        const senderBalance = results[0].balance;

        if (senderRole !== 3) {
            bot.sendMessage(chatId, "❌ Anda tidak memiliki izin untuk memberikan balance!");
            return;
        }

        if (senderBalance < amount) {
            bot.sendMessage(chatId, "⚠ Saldo Anda tidak mencukupi untuk melakukan transfer.");
            return;
        }

        // Fungsi untuk mendapatkan user berdasarkan input
        function getUserIdentifier(input, callback) {
            if (!isNaN(input)) {
                // Jika input berupa telegram_id
                db.query("SELECT telegram_id FROM users WHERE telegram_id = ?", [input], (err, results) => {
                    if (err) return callback(err, null);
                    if (results.length > 0) return callback(null, results[0].telegram_id);
                    return callback(null, null);
                });
            } else if (input.startsWith("@")) {
                // Jika input berupa username
                const username = input.replace("@", "");
                db.query("SELECT telegram_id FROM users WHERE username = ?", [username], (err, results) => {
                    if (err) return callback(err, null);
                    if (results.length > 0) return callback(null, results[0].telegram_id);
                    return callback(null, null);
                });
            } else {
                // Jika input berupa tag, coba ambil telegram_id berdasarkan mention
                const telegramIdMatch = input.match(/@(\w+)/);
                if (telegramIdMatch) {
                    const username = telegramIdMatch[1];
                    db.query("SELECT telegram_id FROM users WHERE username = ?", [username], (err, results) => {
                        if (err) return callback(err, null);
                        if (results.length > 0) return callback(null, results[0].telegram_id);
                        return callback(null, null);
                    });
                } else {
                    callback(null, null);
                }
            }
        }

        // Ambil telegram_id target berdasarkan input (username/telegram_id/tag)
        getUserIdentifier(targetInput, (err, targetUserId) => {
            if (err) throw err;
            if (!targetUserId) {
                bot.sendMessage(chatId, "⚠ Pengguna tidak ditemukan!");
                return;
            }

            // Update saldo pengirim dan penerima
            db.query("UPDATE users SET balance = balance - ? WHERE telegram_id = ?", [amount, senderId], (err) => {
                if (err) throw err;
                db.query("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [amount, targetUserId], (err) => {
                    if (err) throw err;

                    bot.sendMessage(chatId, `✅ Transfer berhasil! Anda telah mengirim ${formatRupiah(amount)} ke pengguna dengan ID @${targetUserId}.`);
                });
            });
        });
    });
});

// Command /farm
bot.onText(/\/farm/, (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    getCooldown(telegramId, 'farm', (err, cooldown) => {
        if (err) throw err;

        // Cek cooldown 2 menit
        if (cooldown && moment().diff(moment(cooldown.last_used), 'minutes') < 2) {
            bot.sendMessage(chatId, "⚠ Anda sudah melakukan farm dalam 2 menit terakhir. Tunggu sebentar.");
            return;
        }

        // Lakukan farming (max 250)
        const amount = Math.floor(Math.random() * 250) + 1;

        // Update cooldown dan saldo
        db.query("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [amount, telegramId], (err) => {
            if (err) throw err;

            setCooldown(telegramId, 'farm', moment().format(), (err) => {
                if (err) throw err;

                bot.sendMessage(chatId, `✅ Anda mendapatkan ${formatRupiah(amount)} dari farming!`);
            });
        });
    });
});

// Command /daily
bot.onText(/\/daily/, (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    getCooldown(telegramId, 'daily', (err, cooldown) => {
        if (err) throw err;

        // Cek apakah pengguna sudah melakukan daily hari ini
        if (cooldown && moment().isSame(moment(cooldown.last_used), 'day')) {
            bot.sendMessage(chatId, "⚠ Anda sudah mengambil daily hari ini. Cobalah besok.");
            return;
        }

        // Lakukan daily (max 2000)
        const amount = Math.floor(Math.random() * 2000) + 1;

        // Update cooldown dan saldo
        db.query("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [amount, telegramId], (err) => {
            if (err) throw err;

            setCooldown(telegramId, 'daily', moment().format(), (err) => {
                if (err) throw err;

                bot.sendMessage(chatId, `✅ Anda mendapatkan ${formatRupiah(amount)} dari daily!`);
            });
        });
    });
});