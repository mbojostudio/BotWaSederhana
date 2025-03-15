const { default: makeWASocket, fetchLatestBaileysVersion, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const fs = require('fs');
const path = require('path');

let faqData = [];

// Fungsi untuk memuat data FAQ dari file JSON
async function loadFaqData() {
    try {
        const dataPath = path.join(__dirname, 'data', 'faqData.json');
        const fileData = fs.readFileSync(dataPath, 'utf8');
        faqData = JSON.parse(fileData).faq;
        console.log('FAQ data berhasil dimuat:', faqData);
    } catch (error) {
        console.error('Error saat memuat FAQ data:', error);
    }
}

// Fungsi untuk memberikan jawaban berdasarkan input pengguna
function generateCustomReply(message) {
    const lowerCaseMessage = message.toLowerCase();

    for (const faq of faqData) {
        if (lowerCaseMessage.includes(faq.question.toLowerCase())) {
            return faq.answer;
        }
    }

    return null; // Tidak membalas jika tidak ada jawaban
}

// Fungsi untuk memulai WhatsApp bot
async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: 'error' }),
        keepAliveIntervalMs: 50000,
    });

    sock.ev.on('creds.update', saveCreds);

    let qrDisplayed = false;

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !qrDisplayed) {
            qrDisplayed = true;
            console.log('\nQR code untuk autentikasi:\n\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi tertutup, reconnecting...', shouldReconnect);

            if (shouldReconnect) {
                console.log('Mencoba reconnect dalam 5 detik...');
                setTimeout(() => {
                    qrDisplayed = false;
                    startWhatsAppBot();
                }, 5000);
            } else {
                console.log('Tidak akan mencoba reconnect karena status logged out.');
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Bot Terhubung!');
        }
    });

    // Menangani pesan masuk
    sock.ev.on('messages.upsert', async (messageUpdate) => {
        const message = messageUpdate.messages[0];
        if (!message || !message.message || message.key.fromMe) return;

        const remoteJid = message.key.remoteJid;
        const isGroup = remoteJid.endsWith('@g.us');

        const text = message.message.conversation || message.message.extendedTextMessage?.text;
        const mentionedJid = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

        if (!text) return;

        // Ambil nomor bot sendiri
        const ownJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        if (isGroup) {
            // Cek apakah bot disebut dalam grup
            if (!mentionedJid.includes(ownJid)) {
                console.log('Bot tidak disebut, mengabaikan pesan grup.');
                return;
            }
        }

        console.log('Pesan diterima:', text);

        // Panggil fungsi custom reply
        const reply = generateCustomReply(text);

        // Kirim balasan jika ada jawaban yang cocok
        if (reply) {
            try {
                await sock.sendMessage(remoteJid, { text: reply }, { quoted: message });
                console.log('Pesan berhasil dikirim');
            } catch (error) {
                console.error('Gagal mengirim pesan:', error);
            }
        }
    });
}

// Mulai bot dan load FAQ data
(async () => {
    await loadFaqData();
    startWhatsAppBot();
})();
