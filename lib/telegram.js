const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

let bot;
if (global.telegram && global.telegram.enable) {
    bot = new TelegramBot(global.telegram.token, { polling: true });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        const ownerId = global.telegram.ownerId;

        if (chatId.toString() !== ownerId.toString()) return;

        if (text && text.startsWith('/')) {
            const command = text.split(' ')[0];
            const args = text.split(' ').slice(1);

            switch (command) {
                case '/start':
                    bot.sendMessage(chatId, 'LAVIATHAN BOT Telegram Control Active');
                    break;
                case '/stats':
                    const stats = global.db.stats || {};
                    bot.sendMessage(chatId, `📊 *Bot Statistics*
Total Users: ${Object.keys(global.db.users).length}
Total Commands: ${stats.totalCommands || 0}
Today Commands: ${stats.todayCommands || 0}`, { parse_mode: 'Markdown' });
                    break;
                case '/addprem':
                    if (!args[0]) return bot.sendMessage(chatId, 'Format: /addprem [nomor]');
                    let jid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    if (global.db.users[jid]) {
                        global.db.users[jid].premium = true;
                        bot.sendMessage(chatId, `✅ Berhasil add premium: ${args[0]}`);
                    } else {
                        bot.sendMessage(chatId, '❌ User tidak ditemukan');
                    }
                    break;
                case '/delprem':
                    if (!args[0]) return bot.sendMessage(chatId, 'Format: /delprem [nomor]');
                    let jidDel = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    if (global.db.users[jidDel]) {
                        global.db.users[jidDel].premium = false;
                        bot.sendMessage(chatId, `✅ Berhasil hapus premium: ${args[0]}`);
                    } else {
                        bot.sendMessage(chatId, '❌ User tidak ditemukan');
                    }
                    break;
                case '/mute':
                    if (!args[0]) return bot.sendMessage(chatId, 'Format: /mute [nomor]');
                    let jidMute = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    if (global.db.users[jidMute]) {
                        global.db.users[jidMute].muted = true;
                        bot.sendMessage(chatId, `✅ Berhasil mute: ${args[0]}`);
                    } else {
                        bot.sendMessage(chatId, '❌ User tidak ditemukan');
                    }
                    break;
                case '/unmute':
                    if (!args[0]) return bot.sendMessage(chatId, 'Format: /unmute [nomor]');
                    let jidUnmute = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    if (global.db.users[jidUnmute]) {
                        global.db.users[jidUnmute].muted = false;
                        bot.sendMessage(chatId, `✅ Berhasil unmute: ${args[0]}`);
                    } else {
                        bot.sendMessage(chatId, '❌ User tidak ditemukan');
                    }
                    break;
                case '/broadcast':
                    if (!args[0]) return bot.sendMessage(chatId, 'Format: /broadcast [pesan]');
                    const bcText = args.join(' ');
                    // This will be handled by an event or global function to access naze instance
                    global.broadcastWA(bcText);
                    bot.sendMessage(chatId, '✅ Broadcast WhatsApp started...');
                    break;
            }
        } else if (msg.reply_to_message) {
            // Reply to WA logic
            const replyText = msg.reply_to_message.text;
            if (replyText && replyText.includes('Dari:')) {
                const match = replyText.match(/\((.*?)\)/);
                if (match && match[1]) {
                    const jid = match[1] + '@s.whatsapp.net';
                    global.sendWA(jid, text);
                    bot.sendMessage(chatId, `✅ Pesan terkirim ke ${match[1]}`);
                }
            }
        }
    });
}

const sendLog = (text) => {
    if (bot && global.telegram.enable) {
        bot.sendMessage(global.telegram.ownerId, text, { parse_mode: 'Markdown' });
    }
};

module.exports = { bot, sendLog };
