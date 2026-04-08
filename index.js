require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

// Fix: Webhook instead of polling for Railway
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);

// Test token
console.log('🤖 Token loaded:', token ? '✅ YES' : '❌ NO');

let tracks = [];

// Error handling
bot.on('polling_error', (error) => {
    console.log('Polling error (normal on Railway):', error.code);
});

// Commands
bot.onText(/\/start/, (msg) => {
    console.log('✅ /start received from:', msg.chat.username);
    bot.sendMessage(msg.chat.id, '🚀 **24/7 Mint Bot LIVE!**\n\n/track chain:eth contract:0x123 supply:300 channel:@yourchannel');
});

bot.onText(/\/track (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const params = match[1].toLowerCase();
    
    const contractMatch = params.match(/contract:([0-9a-f]{40,})/i);
    const supplyMatch = params.match(/supply:(\d+)/);
    const channelMatch = params.match(/channel:@?([a-z0-9_]+)/i);
    
    if (!contractMatch || !supplyMatch) {
        return bot.sendMessage(chatId, '❌ Format: /track chain:eth contract:0x123... supply:300 channel:@yourname');
    }
    
    const track = {
        contract: contractMatch[1].toLowerCase(),
        supply: parseInt(supplyMatch[1]),
        channel: '@' + (channelMatch ? channelMatch[1] : 'test'),
        current: 0,
        notified: false
    };
    
    tracks.push(track);
    bot.sendMessage(chatId, `✅ Tracking \`${track.contract.slice(0,10)}...\` → ${track.supply}`);
    console.log('➕ New track:', track.contract.slice(0,10));
});

bot.onText(/\/list/, (msg) => {
    if (tracks.length === 0) return bot.sendMessage(msg.chat.id, '📭 No tracks');
    const list = tracks.map(t => `\`${t.contract.slice(0,10)}...\` ${t.current}/${t.supply}`).join('\n');
    bot.sendMessage(msg.chat.id, `📋 **${tracks.length} tracks:**\n${list}`);
});

// Mint checker (safe)
async function checkMints() {
    console.log(`🔍 Checking ${tracks.length} tracks...`);
    for (let track of tracks) {
        try {
            const res = await axios.get(
                `https://api.opensea.io/api/v1/events?asset_contract_address=${track.contract}&limit=5`,
                { headers: { 'X-API-KEY': process.env.OPENSEA_API_KEY }, timeout: 5000 }
            );
            track.current = res.data.asset_events?.length || 0;
            
            if (track.current >= track.supply && !track.notified) {
                bot.sendMessage(track.channel, `🚨 **MINT ALERT!** \`${track.contract}\` ${track.current}/${track.supply}`);
                track.notified = true;
            }
        } catch (e) {
            // Silent fail
        }
    }
}

cron.schedule('*/30 * * * * *', checkMints);
console.log('🚀 Bot ready! Send /start to test');
