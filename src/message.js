const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { getContentType, jidNormalizedUser, downloadContentFromMessage } = require('baileys');
const { bot: tgBot, sendLog } = require('../lib/telegram');
const { runtime } = require('../lib/function');
const moment = require('moment-timezone');

const Solving = async (naze, store) => {
    naze.public = true;

    naze.serializeM = (m) => {
        if (!m) return m;
        let M = {};
        if (m.key) {
            M.id = m.key.id;
            M.isBot = M.id.startsWith('BAE5') && M.id.length === 16;
            M.chat = m.key.remoteJid;
            M.fromMe = m.key.fromMe;
            M.isGroup = M.chat.endsWith('@g.us');
            M.sender = jidNormalizedUser(M.fromMe ? naze.user.id : M.isGroup ? m.key.participant : M.chat);
        }
        if (m.message) {
            M.mtype = getContentType(m.message);
            M.msg = (M.mtype == 'viewOnceMessage' ? m.message[M.mtype].message[getContentType(m.message[M.mtype].message)] : m.message[M.mtype]);
            M.body = m.message.conversation || (M.msg && M.msg.caption) || (M.msg && M.msg.text) || (M.mtype == 'listResponseMessage' && M.msg.singleSelectReply.selectedRowId) || (M.mtype == 'buttonsResponseMessage' && M.msg.selectedButtonId) || (M.mtype == 'viewOnceMessage' && M.msg.caption) || m.text || '';
            M.mentionedJid = M.msg && M.msg.contextInfo ? M.msg.contextInfo.mentionedJid : [];
        }
        M.reply = (text) => naze.sendMessage(M.chat, { text: text }, { quoted: m });
        return M;
    };

    global.sendWA = (jid, text) => naze.sendMessage(jid, { text: text });
    global.broadcastWA = (text) => {
        const allUsers = Object.keys(global.db.users);
        for (let u of allUsers) {
            naze.sendMessage(u, { text: text }).catch(e => {});
        }
    };
};

const MessagesUpsert = async (naze, { messages, type }, store) => {
    try {
        if (type !== 'notify') return;
        let m = messages[0];
        if (!m.message) return;
        if (m.key && m.key.remoteJid === 'status@broadcast') return;

        m = naze.serializeM(m);
        const body = m.body || '';
        const prefix = /^[./!#]/.test(body) ? body.match(/^[./!#]/)[0] : '';
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ')[0].toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const text = args.join(' ');
        const isOwner = global.owner.includes(m.sender.split('@')[0]);
        const botNumber = naze.user.id.split(':')[0] + '@s.whatsapp.net';

        // Database logic
        if (!global.db.users) global.db.users = {};
        let user = global.db.users[m.sender];
        if (!user) {
            global.db.users[m.sender] = {
                name: m.pushName || 'User',
                registered: false,
                registerTime: 0,
                limit: global.limit.free,
                premium: false,
                premiumExpired: null,
                muted: false,
                mutedReason: "",
                banned: false,
                admin: false,
                lastClaim: 0,
                totalChat: 0
            };
            user = global.db.users[m.sender];
        }
        user.totalChat += 1;

        // Telegram Log
        if (global.telegram.enable && !m.fromMe) {
            const logText = `👤 *Dari:* ${m.pushName || 'User'} (${m.sender.split('@')[0]})
💬 *Pesan:* ${body}
🕐 *Waktu:* ${moment().tz('Asia/Jakarta').format('HH:mm:ss')}
[Balas pesan ini untuk membalas]`;
            sendLog(logText);
        }

        // Mute Check
        if (user.muted && !isOwner) return;

        // Registration Check
        const isRegistered = user.registered;
        if (isCmd && !isRegistered && command !== 'register') {
            const noGif = fs.existsSync(global.media.no) ? fs.readFileSync(global.media.no) : null;
            if (noGif) {
                await naze.sendMessage(m.chat, { video: noGif, gifPlayback: true, caption: "❌ ANDA BELUM REGISTER! Ketik .register [nama] untuk daftar" }, { quoted: m });
            } else {
                await m.reply("❌ ANDA BELUM REGISTER! Ketik .register [nama] untuk daftar");
            }
            return;
        }

        // Command Handler
        switch (command) {
            case 'register':
                if (isRegistered) return m.reply('❌ Kamu sudah terdaftar!');
                if (!text) return m.reply(`Format: ${prefix}register [nama]`);
                user.name = text;
                user.registered = true;
                user.registerTime = Date.now();
                const doneGif = fs.existsSync(global.media.done) ? fs.readFileSync(global.media.done) : null;
                const regMsg = `✅ REGISTRASI BERHASIL! 
Nama: ${text}
ID: ${m.sender.split('@')[0]}
Status: User Biasa

Sekarang kamu bisa menggunakan .menu`;
                if (doneGif) {
                    await naze.sendMessage(m.chat, { video: doneGif, gifPlayback: true, caption: regMsg }, { quoted: m });
                } else {
                    await m.reply(regMsg);
                }
                break;

            case 'menu':
                const { generateMenu } = require('./menu');
                const menuImg = fs.existsSync(global.media.menu) ? fs.readFileSync(global.media.menu) : null;
                const menuText = generateMenu(m, user);
                if (menuImg) {
                    await naze.sendMessage(m.chat, { image: menuImg, caption: menuText }, { quoted: m });
                } else {
                    await m.reply(menuText);
                }
                break;

            case 'tag':
                const tagImg = fs.existsSync(global.media.tag) ? fs.readFileSync(global.media.tag) : null;
                if (tagImg) {
                    await naze.sendMessage(m.chat, { image: tagImg, caption: "📌 GUNAKAN .menu UNTUK MELIHAT DAFTAR PERINTAH" }, { quoted: m });
                } else {
                    await m.reply("📌 GUNAKAN .menu UNTUK MELIHAT DAFTAR PERINTAH");
                }
                break;
            
            // Add more commands here...
            case 'profile':
                m.reply(`👤 *USER PROFILE*
Nama: ${user.name}
Nomor: ${m.sender.split('@')[0]}
Status: ${user.premium ? 'Premium' : 'User Biasa'}
Limit: ${user.premium ? 'Unlimited' : user.limit}
Terdaftar: ${moment(user.registerTime).format('DD/MM/YYYY')}`);
                break;
            
            case 'addprem':
                if (!isOwner) return m.reply('Khusus Owner!');
                let jid = m.mentionedJid[0] || (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
                if (!jid) return m.reply('Tag atau masukkan nomor user!');
                if (!global.db.users[jid]) return m.reply('User tidak ditemukan di database!');
                global.db.users[jid].premium = true;
                m.reply(`✅ Berhasil menambahkan @${jid.split('@')[0]} sebagai user premium`, null, { mentions: [jid] });
                break;
            
            case 'broadcast':
            case 'bc':
                if (!isOwner) return m.reply('Khusus Owner!');
                if (!text) return m.reply('Masukkan pesan broadcast!');
                const allUsers = Object.keys(global.db.users);
                m.reply(`Mengirim broadcast ke ${allUsers.length} user...`);
                for (let u of allUsers) {
                    await naze.sendMessage(u, { text: text }).catch(e => console.log('Gagal kirim ke', u));
                }
                m.reply('✅ Broadcast selesai!');
                break;

            // GROUP MENU
            case 'linkgc':
                if (!m.isGroup) return m.reply('Hanya di grup!');
                const link = await naze.groupInviteCode(m.chat);
                m.reply(`https://chat.whatsapp.com/${link}`);
                break;
            
            case 'tagall':
                if (!m.isGroup) return m.reply('Hanya di grup!');
                const groupMetadata = await naze.groupMetadata(m.chat);
                const participants = groupMetadata.participants;
                let tag = `*TAG ALL*\n\n`;
                for (let mem of participants) {
                    tag += ` @${mem.id.split('@')[0]}\n`;
                }
                naze.sendMessage(m.chat, { text: tag, mentions: participants.map(a => a.id) }, { quoted: m });
                break;

            case 'hidetag':
                if (!m.isGroup) return m.reply('Hanya di grup!');
                const groupMetadata2 = await naze.groupMetadata(m.chat);
                const participants2 = groupMetadata2.participants;
                naze.sendMessage(m.chat, { text: text ? text : '', mentions: participants2.map(a => a.id) });
                break;

            // OWNER MENU
            case 'addgroup':
                if (!isOwner) return m.reply('Khusus Owner!');
                if (!text) return m.reply('Masukkan link grup!');
                if (!text.includes('chat.whatsapp.com/')) return m.reply('Link tidak valid!');
                let code = text.split('chat.whatsapp.com/')[1];
                let res = await naze.groupAcceptInvite(code);
                m.reply(`✅ BERHASIL JOIN GRUP`);
                break;

            case 'mute':
                if (!isOwner) return m.reply('Khusus Owner!');
                let jidMute = m.mentionedJid[0] || (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
                if (!jidMute) return m.reply('Tag user!');
                global.db.users[jidMute].muted = true;
                m.reply(`✅ Berhasil mute @${jidMute.split('@')[0]}`, null, { mentions: [jidMute] });
                break;

            case 'unmute':
                if (!isOwner) return m.reply('Khusus Owner!');
                let jidUnmute = m.mentionedJid[0] || (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
                if (!jidUnmute) return m.reply('Tag user!');
                global.db.users[jidUnmute].muted = false;
                m.reply(`✅ Berhasil unmute @${jidUnmute.split('@')[0]}`, null, { mentions: [jidUnmute] });
                break;

            // MAKER
            case 'sticker':
            case 's':
                // Basic sticker logic placeholder
                m.reply('Fitur sticker sedang dikembangkan. Gunakan bot lain sementara.');
                break;

            // DOWNLOADER
            case 'tiktok':
                if (!text) return m.reply('Masukkan URL TikTok!');
                m.reply('Sedang mendownload... (Placeholder)');
                break;

            case 'ytmp3':
                if (!text) return m.reply('Masukkan URL YouTube!');
                m.reply('Sedang mendownload audio... (Placeholder)');
                break;
            
            case 'ytmp4':
                if (!text) return m.reply('Masukkan URL YouTube!');
                m.reply('Sedang mendownload video... (Placeholder)');
                break;

            // INTERNET
            case 'google':
                if (!text) return m.reply('Masukkan query!');
                m.reply(`Mencari Google untuk: ${text}... (Placeholder)`);
                break;

            case 'cuaca':
                if (!text) return m.reply('Masukkan nama kota!');
                m.reply(`Mengecek cuaca di ${text}... (Placeholder)`);
                break;

            // GAMES
            case 'tebakgambar':
                m.reply('Game Tebak Gambar dimulai! (Placeholder)');
                break;

            case 'slot':
                const slots = ['🍎', '🍐', '🍊', '🍋', '🍌'];
                const r1 = slots[Math.floor(Math.random() * slots.length)];
                const r2 = slots[Math.floor(Math.random() * slots.length)];
                const r3 = slots[Math.floor(Math.random() * slots.length)];
                m.reply(`[ ${r1} | ${r2} | ${r3} ]\n\n${r1 === r2 && r2 === r3 ? 'JACKPOT! 🎉' : 'Coba lagi!'}`);
                break;

            // FUN
            case 'truth':
                const truths = ['Pernah bohong sama ortu?', 'Siapa orang yang kamu suka?', 'Pernah nangis karena apa?'];
                m.reply(truths[Math.floor(Math.random() * truths.length)]);
                break;

            case 'dare':
                const dares = ['Chat mantan bilang kangen', 'VN bilang "I love you" ke grup', 'Pap muka jelek'];
                m.reply(dares[Math.floor(Math.random() * dares.length)]);
                break;

            case 'apakah':
                if (!text) return m.reply('Tanya apa?');
                const answers = ['Iya', 'Tidak', 'Mungkin', 'Bisa jadi'];
                m.reply(`Pertanyaan: Apakah ${text}\nJawaban: ${answers[Math.floor(Math.random() * answers.length)]}`);
                break;

            case 'rate':
                if (!text) return m.reply('Apa yang mau di rate?');
                m.reply(`Rate ${text}: ${Math.floor(Math.random() * 100)}%`);
                break;

            // TOOLS
            case 'nulis':
                if (!text) return m.reply('Tulis apa?');
                m.reply(`Menulis: ${text}... (Placeholder)`);
                break;

            case 'qr':
                if (!text) return m.reply('Masukkan teks/link!');
                m.reply(`Membuat QR untuk: ${text}... (Placeholder)`);
                break;

            case 'kbbi':
                if (!text) return m.reply('Masukkan kata!');
                m.reply(`Mencari KBBI untuk: ${text}... (Placeholder)`);
                break;

            case 'translate':
                if (!text) return m.reply('Format: .translate [kode] [teks]');
                m.reply(`Menerjemahkan... (Placeholder)`);
                break;

            case 'limit':
                m.reply(`Limit kamu: ${user.premium ? 'Unlimited' : user.limit}`);
                break;

            case 'claim':
                const daily = 10;
                const lastClaim = user.lastClaim || 0;
                const now = Date.now();
                if (now - lastClaim < 86400000) {
                    const remaining = 86400000 - (now - lastClaim);
                    const hours = Math.floor(remaining / 3600000);
                    const minutes = Math.floor((remaining % 3600000) / 60000);
                    return m.reply(`❌ Kamu sudah claim hari ini! Tunggu ${hours} jam ${minutes} menit lagi.`);
                }
                user.limit += daily;
                user.lastClaim = now;
                m.reply(`✅ Berhasil claim ${daily} limit harian!`);
                break;
            
            case 'report':
                if (!text) return m.reply('Masukkan laporan kamu!');
                const reportMsg = `📢 *REPORT USER*\n\nDari: @${m.sender.split('@')[0]}\nPesan: ${text}`;
                naze.sendMessage(global.owner[0] + '@s.whatsapp.net', { text: reportMsg, mentions: [m.sender] });
                m.reply('✅ Laporan telah dikirim ke owner.');
                break;

            case 'stats':
                const totalUsers = Object.keys(global.db.users).length;
                const totalGroups = Object.keys(global.db.groups || {}).length;
                const uptime = runtime(process.uptime());
                m.reply(`📊 *BOT STATISTICS*
Total Users: ${totalUsers}
Total Groups: ${totalGroups}
Uptime: ${uptime}`);
                break;
        }

    } catch (e) {
        console.log(chalk.red(e));
    }
};

const GroupParticipantsUpdate = async (naze, { id, participants, action }, store) => {
    // Welcome/Goodbye logic
};

module.exports = { Solving, MessagesUpsert, GroupParticipantsUpdate };
