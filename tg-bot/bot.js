const { Bot, GrammyError, HttpError, InputFile } = require('grammy');
const crypto = require('crypto');
const https = require('https');

// ==================== CONFIGURATION ====================
const CONFIG = {
    BOT_TOKEN: '8522183541:AAGjtquki5IvlDPiXhU93apcbkR-x5r2UO4',
    MY_SECRET_SEED: 'Fixed_Device_V1_2026',
    PROXY_BASE_URL: 'https://bobr-hwid.alwaysdata.net/proxy.php'
};

// ==================== HWID GENERATION ====================
function generateHwid(seed) {
    return crypto.createHash('sha256')
        .update(seed)
        .digest('hex')
        .substring(0, 16);
}

// ==================== FETCH SUBSCRIPTION ====================
function fetchSubscription(url, hwid) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'HiddifyNext/1.5.0 (Windows NT 10.0; Win64; x64)',
                'X-Hwid': hwid,
                'X-Device-Id': hwid,
                'Accept': '*/*',
                'Connection': 'close'
            },
            timeout: 20000,
            rejectUnauthorized: false
        };

        const req = https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        });

        req.on('error', (err) => { reject(err); });
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

// ==================== DECODE LOGIC ====================
function decodeResponse(response) {
    try {
        const decoded = Buffer.from(response, 'base64').toString('utf-8');
        if (decoded.includes('://')) return decoded;
    } catch (e) {}
    return response;
}

function checkDeviceLimit(output) {
    if (output.includes('Limit of devices reached')) {
        throw new Error('SERVER ERROR: Лимит устройств исчерпан. Поменяйте MY_SECRET_SEED в коде.');
    }
    return output;
}

// ==================== BOT SETUP ====================
const bot = new Bot(CONFIG.BOT_TOKEN);

// Хранилище для пользовательских ссылок
const userUrls = new Map();

// ==================== COMMANDS ====================

bot.command('start', async (ctx) => {
    const startMsg = 
        `👋 <b>Привет!</b> Я бот для получения прокси из VPN-подписок(hwid: happ, v2raytun и т. д.)..\n\n` +
        `<b>Доступные команды:</b>\n` +
        `/seturl &lt;ссылка&gt; — Установить ссылку вашей подписки\n` +
        `/get — Получить конфигурацию\n` +
        `/getfile — Получить конфигурацию файлом\n\n` +
        `<blockquote>⚠️ <b>РИСКИ</b>\n` +
        `Бот имитирует HWID устройства. Если ваш провайдер разрешает только одно устройство, ваша оригинальная ссылка в приложениях может перестать работать. Администратор не хранит ваши подписки.</blockquote>\n\n` +
        `Исходный код: <a href="https://github.com/eldevex/hwid-simulator">GitHub</a>`;

    await ctx.reply(startMsg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true 
    });
});


bot.command('seturl', async (ctx) => {
    const url = ctx.message.text.split(' ')[1];
    if (!url) {
        return ctx.reply('❌ Укажите ссылку: <code>/seturl https://example.com</code>', { parse_mode: 'HTML' });
    }
    userUrls.set(ctx.from.id, url);
    await ctx.reply(`✅ Ссылка сохранена! Теперь введите /get`, { parse_mode: 'HTML' });
});

bot.command('get', async (ctx) => {
    const userId = ctx.from.id;
    const userUrl = userUrls.get(userId);

    if (!userUrl) {
        return ctx.reply('❌ Сначала установите ссылку через /seturl');
    }

    const loadingMsg = await ctx.reply('⏳ Запрос к серверу...');

    try {
        const hwid = generateHwid(CONFIG.MY_SECRET_SEED);
        const response = await fetchSubscription(userUrl, hwid);
        let output = decodeResponse(response);
        output = checkDeviceLimit(output);

        await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id);

        const proxyUrl = `${CONFIG.PROXY_BASE_URL}?url=${encodeURIComponent(userUrl)}`;

        if (output.length > 3500) {
            await ctx.replyWithDocument(
                new InputFile(Buffer.from(output), 'config.txt'),
                { 
                    caption: `✅ Конфигурация слишком большая, отправлена файлом.\n\nПрокси-ссылка:\n<code>${proxyUrl}</code>`, 
                    parse_mode: 'HTML' 
                }
            );
        } else {
            // Экранируем спецсимволы в конфиге, чтобы не сломать HTML
            const safeOutput = output
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            await ctx.reply(
                `✅ <b>Конфигурация:</b>\n` +
                `<pre><code>${safeOutput}</code></pre>\n\n` +
                `<b>Ссылка для клиента:</b>\n<code>${proxyUrl}</code>`,
                { parse_mode: 'HTML' }
            );
        }
    } catch (error) {
        await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        // Экранируем сообщение об ошибке на всякий случай
        const safeError = error.message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        await ctx.reply(`❌ <b>Ошибка:</b> ${safeError}`, { parse_mode: 'HTML' });
    }
});

bot.command('getfile', async (ctx) => {
    const userId = ctx.from.id;
    const userUrl = userUrls.get(userId);

    if (!userUrl) {
        return ctx.reply('❌ Сначала установите ссылку через /seturl');
    }

    const loadingMsg = await ctx.reply('⏳ Генерирую файл...');

    try {
        const hwid = generateHwid(CONFIG.MY_SECRET_SEED);
        const response = await fetchSubscription(userUrl, hwid);
        let output = decodeResponse(response);
        output = checkDeviceLimit(output);

        await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id);

        await ctx.replyWithDocument(
            new InputFile(Buffer.from(output), 'vpn_config.txt'),
            { caption: '✅ Ваш файл конфигурации готов.' }
        );
    } catch (error) {
        await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
});

// ==================== ERROR HANDLING ====================
bot.catch((err) => {
    const e = err.error;
    console.error(`Error: ${e.message}`);
});

// ==================== START BOT ====================
console.log('🚀 Бот запущен...');
bot.start();
