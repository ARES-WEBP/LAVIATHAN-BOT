const moment = require('moment-timezone');

const generateMenu = (m, user) => {
    const time = moment().tz('Asia/Jakarta').format('HH:mm:ss');
    const date = moment().tz('Asia/Jakarta').format('DD/MM/YYYY');
    
    return `╭───「 *${global.namabot}* 」
│
│ 👤 *USER INFO*
│ Nama: ${user.name}
│ Status: ${user.premium ? 'Premium' : 'Free'}
│ Limit: ${user.premium ? 'Unlimited' : user.limit}
│
│ 🕒 *TIME INFO*
│ Jam: ${time}
│ Tanggal: ${date}
│
╰──────────────────

*👤 USER MENU*
.profile
.limit
.claim
.invite
.report

*🔍 MAKER/TOOLS*
.sticker
.toimg
.nulis
.qr
.readqr

*📥 DOWNLOADER*
.ytmp3
.ytmp4
.tiktok
.ig
.fb

*🌐 INTERNET*
.google
.gimage
.cuaca
.kbbi
.translate

*🎮 GAMES*
.tebakgambar
.suit
.family100
.tebakkata
.slot

*🎨 FUN*
.truth
.dare
.jadwalin
.apakah
.rate

*🛠️ GROUP MENU*
.linkgc
.setdesc
.setname
.tagall
.hidetag

*👑 OWNER MENU*
.addprem
.delprem
.mute
.unmute
.broadcast
.addadmin
.addgroup
.listgroup
.join
.leave

_LAVIATHAN BOT BY ARES_`;
};

module.exports = { generateMenu };
