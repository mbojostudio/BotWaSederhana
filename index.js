const { default: makeWASocket, fetchLatestBaileysVersion, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const OPENROUTER_API_KEY = "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"; // Ganti dengan API Key Anda
const SITE_URL = "https://mbojostudio.com"; // Opsional, untuk ranking di OpenRouter
const SITE_NAME = "Mbojo Studio AI Bot"; // Opsional, untuk ranking di OpenRouter

// Fungsi untuk mengirim permintaan ke OpenRouter AI
async function getAiResponse(userMessage) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": SITE_URL,
                "X-Title": SITE_NAME,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "google/gemma-3-27b-it:free",
                "messages": [
                    {
                        "role": "system",
                        "content": "Anda adalah dewa cinta. Tugas Anda adalah membantu pengguna dengan jawaban yang relevan dan informatif."
                    },
                    {
                        "role": "user",
                        "content": userMessage
                    }
                ]
            })
        });

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "Maaf, saya tidak dapat memahami pertanyaan Anda.";
    } catch (error) {
        console.error("Error saat meminta balasan AI:", error);
        return "Maaf, ada kesalahan dalam sistem AI.";
    }
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
            console.log("WhatsApp Bot Terhubung!");
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

        // Panggil AI untuk mendapatkan balasan
        const aiReply = await getAiResponse(text);

        // Kirim balasan
        try {
            await sock.sendMessage(remoteJid, { text: aiReply }, { quoted: message });
            console.log('Pesan berhasil dikirim:', aiReply);
        } catch (error) {
            console.error('Gagal mengirim pesan:', error);
        }
    });
}
// Mulai bot
(async () => {
    startWhatsAppBot();
})();

