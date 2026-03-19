require('./settings');
const fs = require('fs');
const os = require('os');
const pino = require('pino');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const { toBuffer } = require('qrcode');
const { Boom } = require('@hapi/boom');
const NodeCache = require('node-cache');
const qrcode = require('qrcode-terminal');
const { exec } = require('child_process');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { default: WAConnection, useMultiFileAuthState, Browsers, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestWaWebVersion, jidNormalizedUser } = require('baileys');

const { dataBase } = require('./src/database');
const { app, server, PORT } = require('./src/server');
const { assertInstalled, unsafeAgent } = require('./lib/function');
const { GroupParticipantsUpdate, MessagesUpsert, Solving } = require('./src/message');

const print = (label, value) => console.log(`${chalk.green.bold('║')} ${chalk.cyan.bold(label.padEnd(16))}${chalk.yellow.bold(':')} ${value}`);
const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || global.pairing_code;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));
let pairingStarted = false;
let phoneNumber;

// FUNGSI UNTUK HAPUS SESSION LAMA TAPI AMAN
function cleanupSession() {
    try {
        const sessionPath = path.join(process.cwd(), 'nazedev');
        if (fs.existsSync(sessionPath)) {
            // HAPUS ISI FOLDER, BUKAN FOLDER NYA
            const files = fs.readdirSync(sessionPath);
            for (const file of files) {
                fs.unlinkSync(path.join(sessionPath, file));
            }
            console.log(chalk.yellow('🧹 Session lama dibersihkan'));
        }
        // PASTIKAN FOLDER ADA
        fs.mkdirSync(sessionPath, { recursive: true });
    } catch (e) {
        console.log('Gagal hapus session:', e);
    }
}

const userInfoSyt = () => {
    try {
        return os.userInfo().username;
    } catch (e) {
        return process.env.USER || process.env.USERNAME || 'unknown';
    }
};

global.fetchApi = async (endpoint = '/', data = {}, options = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            const base = options.name ? (options.name in global.APIs ? global.APIs[options.name] : options.name) : global.APIs.naze;
            const apikey = global.APIKeys[base];
            let method = (options.method || 'GET').toUpperCase();
            let url = base + endpoint;
            let payload = null;
            let headers = options.headers || { 'user-agent': 'Mozilla/5.0 (Linux; Android 15)' };
            const isForm = options.form || data instanceof FormData || (data && typeof data.getHeaders === 'function');
            if (isForm) {
                payload = data;
                method = 'POST';
                headers = { apikey, ...headers, ...data.getHeaders() };
            } else if (method !== 'GET') {
                payload = { ...data, apikey };
                headers['content-type'] = 'application/json';
            } else {
                url += '?' + new URLSearchParams({ ...data, apikey }).toString();
            }
            const res = await axios({
                method, url, data: payload,
                headers, httpsAgent: unsafeAgent,
                responseType: options.stream ? 'stream' : (options.buffer ? 'arraybuffer' : options.responseType || options.type || 'json'),
            });
            if (options.stream) {
                const fs = require('fs');
                const path = require('path');
                let ext = options.ext;
                if (typeof options.stream !== 'string' && !ext) {
                    const contentDisp = res.headers['content-disposition'];
                    const contentType = res.headers['content-type'];
                    if (contentDisp && contentDisp.includes('filename=')) {
                        const match = contentDisp.match(/filename="?([^"]+)"?/);
                        if (match && match[1]) {
                            ext = match[1].split('.').pop();
                        }
                    }
                    if (!ext && contentType) {
                        ext = contentType.split('/')[1]?.split(';')[0];
                        if (ext === 'jpeg') ext = 'jpg';
                    }
                    ext = ext || 'tmp';
                }
                let streamPath = typeof options.stream === 'string' ? options.stream : path.join(process.cwd(), 'database/temp', Date.now() + '.' + ext);
                const writeStream = fs.createWriteStream(streamPath);
                res.data.pipe(writeStream);
                writeStream.on('finish', () => resolve(streamPath));
                writeStream.on('error', reject);
            } else {
                resolve(options.buffer ? Buffer.from(res.data) : res.data);
            }
        } catch (e) {
            reject(e);
        }
    });
};

const storeDB = dataBase(global.tempatStore);
const database = dataBase(global.tempatDB);
const msgRetryCounterCache = new NodeCache();

assertInstalled(process.platform === 'win32' ? 'where ffmpeg' : 'command -v ffmpeg', 'FFmpeg', 0);
console.log(chalk.greenBright('✅  All external dependencies are satisfied'));
console.log(chalk.green.bold(`╔═════[${`${chalk.cyan(userInfoSyt())}@${chalk.cyan(os.hostname())}`}]═════`));
print('OS', `${os.platform()} ${os.release()} ${os.arch()}`);
print('Uptime', `${Math.floor(os.uptime() / 3600)} h ${Math.floor((os.uptime() % 3600) / 60)} m`);
print('Shell', process.env.SHELL || process.env.COMSPEC || 'unknown');
print('CPU', os.cpus()[0]?.model.trim() || 'unknown');
print('Memory', `${(os.freemem() / 1024 / 1024).toFixed(0)} MiB / ${(os.totalmem() / 1024 / 1024).toFixed(0)} MiB`);
print('Script version', `v${require('./package.json').version}`);
print('Node.js', process.version);
print('Baileys', `v${require('./package.json').dependencies.baileys}`);
print('Date & Time', new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour12: false }));
console.log(chalk.green.bold('╚' + ('═'.repeat(30))));
server.listen(PORT, () => {
    console.log('App listened on port', PORT);
});

async function startNazeBot() {
    try {
        // PASTIKAN FOLDER SESSION ADA
        const sessionPath = path.join(process.cwd(), 'nazedev');
        fs.mkdirSync(sessionPath, { recursive: true });

        const loadData = await database.read();
        const storeLoadData = await storeDB.read();
        if (!loadData || Object.keys(loadData).length === 0) {
            global.db = {
                hit: {},
                set: {},
                cmd: {},
                store: {},
                users: {},
                game: {},
                groups: {},
                database: {},
                premium: [],
                sewa: [],
                ...(loadData || {}),
            };
            await database.write(global.db);
        } else {
            global.db = loadData;
        }
        if (!storeLoadData || Object.keys(storeLoadData).length === 0) {
            global.store = {
                contacts: {},
                presences: {},
                messages: {},
                groupMetadata: {},
                ...(storeLoadData || {}),
            };
            await storeDB.write(global.store);
        } else {
            global.store = storeLoadData;
        }

        global.loadMessage = function (remoteJid, id) {
            const messages = store.messages?.[remoteJid]?.array;
            if (!messages) return null;
            return messages.find(msg => msg?.key?.id === id) || null;
        };

        if (!global._dbInterval) {
            global._dbInterval = setInterval(async () => {
                if (global.db) await database.write(global.db);
                if (global.store) await storeDB.write(global.store);
            }, 30 * 1000);
        }
    } catch (e) {
        console.log(e);
        process.exit(1);
    }

    const level = pino({ level: 'silent' });
    const { version } = await fetchLatestWaWebVersion();
    const { state, saveCreds } = await useMultiFileAuthState('nazedev');
    const getMessage = async (key) => {
        if (global.store) {
            const msg = await global.loadMessage(key.remoteJid, key.id);
            return msg?.message || '';
        }
        return {
            conversation: 'Halo Saya Naze Bot',
        };
    };

    const naze = WAConnection({
        version,
        logger: level,
        getMessage,
        syncFullHistory: false,
        maxMsgRetryCount: 15,
        msgRetryCounterCache,
        retryRequestDelayMs: 10,
        defaultQueryTimeoutMs: 0,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: false,
        transactionOpts: {
            maxCommitRetries: 10,
            delayBetweenTriesMs: 10,
        },
        appStateMacVerification: {
            patch: true,
            snapshot: true,
        },
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, level),
        },
    });

    // HANDLE PAIRING CODE
    if (pairingCode && !naze.authState.creds.registered && !pairingStarted) {
        async function getPhoneNumber() {
            phoneNumber = global.number_bot ? global.number_bot : process.env.BOT_NUMBER || await question('Please type your WhatsApp number : ');
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

            if (!parsePhoneNumber('+' + phoneNumber).valid && phoneNumber.length < 10) {
                console.log(chalk.bgBlack(chalk.redBright('Start with your Country WhatsApp code') + chalk.whiteBright(',') + chalk.greenBright(' Example : 62xxx')));
                await getPhoneNumber();
            }
        }
        
        await getPhoneNumber();
        console.log('Phone number captured. Waiting for Connection...\n' + chalk.blueBright('Estimated time: around 2 ~ 5 minutes'));
    }

    await Solving(naze, global.store);

    naze.ev.on('creds.update', saveCreds);

    naze.ev.on('connection.update', async (update) => {
        const { qr, connection, lastDisconnect, isNewLogin, receivedPendingNotifications } = update;
        
        // QR CODE
        if (qr) {
            if (!pairingCode) {
                console.log('\n📸 SCAN QR CODE INI:');
                qrcode.generate(qr, { small: true });
            }
            app.use('/qr', async (req, res) => {
                res.setHeader('content-type', 'image/png');
                res.end(await toBuffer(qr));
            });
        }

        // PAIRING CODE
        if (connection === 'connecting' && pairingCode && phoneNumber && !naze.authState.creds.registered && !pairingStarted) {
            pairingStarted = true;
            setTimeout(async () => {
                try {
                    console.log('Requesting Pairing Code...');
                    let code = await naze.requestPairingCode(phoneNumber);
                    console.log('\n' + '='.repeat(40));
                    console.log(chalk.green('✅ PAIRING CODE ANDA:'));
                    console.log(chalk.yellow.bold(`\n   ${code.match(/.{1,4}/g).join('-')}\n`));
                    console.log('='.repeat(40));
                    console.log(chalk.blue('⏰ Expires in 60 seconds'));
                    console.log(chalk.cyan('📱 Cara: Buka WhatsApp > 3 titik > Perangkat tertaut\n'));
                } catch (err) {
                    console.log('❌ Gagal minta pairing code:', err.message);
                    pairingStarted = false;
                }
            }, 3000);
        }

        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.connectionLost) {
                console.log('Connection to Server Lost, Attempting to Reconnect...');
                startNazeBot();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log('Connection closed, Attempting to Reconnect...');
                startNazeBot();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log('Restart Required...');
                startNazeBot();
            } else if (reason === DisconnectReason.timedOut) {
                console.log('Connection Timed Out, Attempting to Reconnect...');
                startNazeBot();
            } else if (reason === DisconnectReason.badSession) {
                console.log('Bad Session, Cleaning and Scan again...');
                cleanupSession();
                startNazeBot();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log('Connection Replaced, Close other session first...');
            } else if (reason === DisconnectReason.loggedOut) {
                console.log('Logged Out, Cleaning session and Scan again...');
                cleanupSession();
                startNazeBot();
            } else if (reason === DisconnectReason.forbidden) {
                console.log('Forbidden, Cleaning session and Scan again...');
                cleanupSession();
                startNazeBot();
            } else if (reason === DisconnectReason.multideviceMismatch) {
                console.log('Multidevice Mismatch, Cleaning session and Scan again...');
                cleanupSession();
                startNazeBot();
            } else {
                console.log(`Unknown DisconnectReason: ${reason}|${connection}`);
                startNazeBot();
            }
        }

        if (connection === 'open') {
            console.log(chalk.green('✅ Connected to : ' + JSON.stringify(naze.user, null, 2)));

            // FIX: Ganti decodeJid dengan split manual
            let botNumber = naze.user.id.split(':')[0] + '@s.whatsapp.net';

            if (global.db?.set[botNumber] && !global.db?.set[botNumber]?.join) {
                if (global.my?.ch?.length > 0 && global.my.ch.includes('@newsletter')) {
                    if (global.my.ch) await naze.newsletterMsg(global.my.ch, { type: 'follow' }).catch(e => {});
                    global.db.set[botNumber].join = true;
                }
            }
            
            console.log(chalk.green('🚀 Bot siap digunakan!'));
        }

        if (isNewLogin) console.log(chalk.green('[INFO] New device login detected...'));
        if (receivedPendingNotifications === 'true') {
            console.log(chalk.green('[INFO] Please wait About 1 Minute...'));
            naze.ev.flush();
        }
    });

    naze.ev.on('contacts.update', (update) => {
        for (let contact of update) {
            let trueJid;
            if (!trueJid) continue;
            if (contact.id.endsWith('@lid')) {
                trueJid = naze.findJidByLid(jidNormalizedUser(contact.id), store, true);
            } else {
                trueJid = jidNormalizedUser(contact.id);
            }
            global.store.contacts[trueJid] = {
                ...global.store.contacts[trueJid],
                phoneNumber: trueJid,
                name: contact.notify,
            };
            if (contact.id.endsWith('@lid')) {
                global.store.contacts[trueJid].id = jidNormalizedUser(contact.id);
            }
        }
    });

    naze.ev.on('call', async (call) => {
        // FIX: Ganti decodeJid di call handler
        let botNumber = naze.user.id.split(':')[0] + '@s.whatsapp.net';
        if (global.db?.set[botNumber]?.anticall) {
            for (let id of call) {
                if (id.status === 'offer') {
                    let msg = await naze.sendMessage(id.from, {
                        text: `Saat Ini, Kami Tidak Dapat Menerima Panggilan ${id.isVideo ? 'Video' : 'Suara'}.\nJika @${id.from.split('@')[0]} Memerlukan Bantuan, Silakan Hubungi Owner :)`,
                        mentions: [id.from],
                    });
                    await naze.sendContact(id.from, global.owner, msg);
                    await naze.rejectCall(id.id, id.from);
                }
            }
        }
    });

    naze.ev.on('messages.upsert', async (message) => {
        await MessagesUpsert(naze, message, global.store);
    });

    naze.ev.on('group-participants.update', async (update) => {
        await GroupParticipantsUpdate(naze, update, global.store);
    });

    naze.ev.on('groups.update', (update) => {
        for (const n of update) {
            if (global.store.groupMetadata[n.id]) {
                Object.assign(global.store.groupMetadata[n.id], n);
            } else global.store.groupMetadata[n.id] = n;
        }
    });

    naze.ev.on('presence.update', ({ id, presences: update }) => {
        store.presences[id] = global.store.presences?.[id] || {};
        Object.assign(global.store.presences[id], update);
    });

    if (!global._dbPresence) {
        global._dbPresence = setInterval(async () => {
            if (naze?.user?.id) {
                // FIX: Ganti decodeJid di presence update
                let botJid = naze.user.id.split(':')[0] + '@s.whatsapp.net';
                await naze.sendPresenceUpdate('available', botJid).catch(e => {});
            }
        }, 10 * 60 * 1000);
    }

    return naze;
}

startNazeBot();

// Process Exit
const cleanup = async (signal) => {
    console.log(`Received ${signal}. Menyimpan database...`);
    if (global.db) await database.write(global.db);
    if (global.store) await storeDB.write(global.store);
    server.close(() => {
        console.log('Server closed. Exiting...');
        process.exit(0);
    });
};

process.on('SIGINT', () => cleanup('SIGINT'));
process.on('SIGTERM', () => cleanup('SIGTERM'));
process.on('exit', () => cleanup('exit'));

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.log(chalk.yellowBright(`[WARNING] Address localhost:${PORT} in use. Please retry when the port is available!`));
        server.close();
    } else console.error(chalk.redBright(`[ERROR] ${error}`));
});

setInterval(() => {}, 1000 * 60 * 10);
