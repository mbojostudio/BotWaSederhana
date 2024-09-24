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

    // Mencari jawaban berdasarkan kata kunci
    for (const faq of faqData) {
        if (lowerCaseMessage.includes(faq.question.toLowerCase())) {
            return faq.answer;
        }
    }

    // Jika tidak ada jawaban yang ditemukan
    return '          *Selamat Datang Di*\n         ꧁ 𝔐𝔟𝔬𝔧𝔬 𝔰𝔱𝔲𝔡𝔦𝔬 ꧂\n\n\n\nKetik *Menu* untuk melanjutkan.';
}

// Fungsi untuk memulai WhatsApp bot
async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // Matikan QR di terminal
        logger: P({ level: 'error' }), // Logging hanya untuk menampilkan error
        keepAliveIntervalMs: 50000, // Interval keep-alive diperpanjang menjadi 20 detik
    });

    sock.ev.on('creds.update', saveCreds);

    let qrDisplayed = false; // Flag untuk mengecek apakah QR sudah ditampilkan

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Tampilkan QR hanya sekali
        if (qr && !qrDisplayed) {
            qrDisplayed = true;
            console.log('\nQR code untuk autentikasi:\n\n');
            qrcode.generate(qr, { small: true });
        }

        // Jika koneksi terputus, coba reconnect
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi tertutup, reconnecting...', shouldReconnect);

            if (shouldReconnect) {
                console.log('Mencoba reconnect dalam 5 detik...');
                setTimeout(() => {
                    qrDisplayed = false; // Reset flag QR saat reconnecting
                    startWhatsAppBot(); // Restart bot
                }, 1000); // Coba reconnect setelah 5 detik
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

        const text = message.message.conversation || message.message.extendedTextMessage?.text;
        if (text) {
            console.log('Pesan diterima:', text);

            // Panggil fungsi custom reply
            const reply = generateCustomReply(text);
            console.log('Balasan custom:', reply);

            // Kirim balasan ke WhatsApp
            try {
                await sock.sendMessage(message.key.remoteJid, { text: reply });
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
