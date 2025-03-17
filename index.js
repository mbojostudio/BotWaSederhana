const { default: makeWASocket, fetchLatestBaileysVersion, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
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
                        "content":`Anda adalah Mbojo Studio! Kamu adalah chatbot profesional untuk layanan pembuatan website undangan pernikahan digital.
                Tugasmu adalah membantu pelanggan memahami layanan yang tersedia, menjawab pertanyaan mereka, dan mengarahkan mereka ke admin jika diperlukan.

                Jika pelanggan bertanya tentang harga, tanyakan dulu apakah mereka ingin paket standar atau custom.
                - Paket standar harganya 50.000 bisa dibuat secara otomatis di web.
                - Paket custom harganya 100.000 dan dibuat oleh admin sesuai permintaan pelanggan.

                Untuk paket standar, kami memiliki beberapa tema yang bisa dipilih:
                - [Tema Dark](https://mbojostudio.com/template_undangan/dark/index.php)
                - [Tema Light](https://mbojostudio.com/template_undangan/light/index.php)
                - [Tema Moon](https://mbojostudio.com/template_undangan/moon/index.php)
                - [Tema Premium](https://mbojostudio.com/template_undangan/premium/index.php)

                Silakan klik salah satu link di atas untuk melihat contoh tema.

                Jika pelanggan bertanya bagaimana cara membuat undangan untuk paket standar, jelaskan langkah-langkahnya:
                1. Mendaftar atau login ke website.
                2. Klik 'Buat Sekarang'.
                3. Isi semua form input dengan benar.
                4. Edit nama tamu sesuai kebutuhan.
                5. Lihat undangan yang sudah dibuat.
                6. Jika belum membayar, pengguna akan diarahkan ke proses pembayaran.
                7. Setelah pembayaran berhasil, undangan siap dibagikan.

                Jika pelanggan bertanya tentang metode pembayaran, jelaskan bahwa pembayaran bisa dilakukan melalui bank.
                Namun, untuk detail lebih lanjut, arahkan mereka untuk menghubungi admin melalui WhatsApp: 087841947229.

                Jika kamu tidak bisa menjawab atau pelanggan masih bingung, berikan informasi kontak admin WhatsApp 087841947229 agar mereka bisa bertanya langsung.

                Jangan langsung memberikan semua informasi sekaligus. Jika pelanggan bertanya tentang sesuatu, berikan jawaban singkat lalu tanyakan apakah mereka membutuhkan informasi lebih lanjut.`
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

