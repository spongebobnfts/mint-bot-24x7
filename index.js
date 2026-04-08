require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

const token = process.env.TELEGRAM_BOT_TOKEN;
console.log('🤖 Bot token:', token ? 'LOADED' : 'MISSING');

// Initialize bot
const bot = new TelegramBot(token, { polling: true });
let tracks = [];

// Log all messages
bot.on('message', (msg) => {
    console.log(`📨 Message from ${msg.chat.username}: ${msg.text}`);
});

// /start - IMMEDIATE REPLY
bot.onText(/\/start/, (msg) => {
    console.log('✅ /start received!');
    bot.sendMessage(msg.chat.id, 
        `🎉 **BOT LIVE!** 🎉\n\n` +
        `🚀 24/7 Mint Tracker\n` +
        `📝 /track chain:eth contract:0x123 supply:300 channel:@yourchannel\n` +
        `📋 /list\n` +
        `📊 /status`
    );
});

// /track command
bot.onText(/\/track (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    console.log('📝 Track command:', match[1]);
    
    const params = match[1].toLowerCase();
    const contract = params.match(/contract:([0-9a-f]{40,})/i)?.[1];
    const supply = parseInt(params.match(/supply:(\d+)/)?.[1] || 0);
    const channel = params.match(/channel:@?([a-z0-9_]+)/i)?.[1] ? '@' + params.match(/channel:@?([a-z0-9_]+)/i)[1] : '@sagar';
    
    if (!contract || !supply) {
        bot.sendMessage(chatId, `❌ Wrong format!\n✅ /track chain:eth contract:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d supply:10 channel:@sagar`);
        return;
    }
    
    const track = {
        contract: contract.toLowerCase(),
        supply: supply,
        channel: channel,
        current: 0,
        notified: false
    };
    
    tracks.push(track);
    bot.sendMessage(chatId, 
        `✅ **TRACKING ACTIVE!**\n\n` +
        `📜 \`${track.contract.slice(0,10)}...\`\n` +
        `🎯 Target: ${track.supply}\n` +
        `📢 ${track.channel}\n` +
        `⏱️ Live monitoring...`
    );
    console.log('➕ Added track:', track.contract.slice(0,10));
});

// /list
bot.onText(/\/list/, (msg) => {
    if (tracks.length === 0) {
        bot.sendMessage(msg.chat.id, '📭 No active tracks');
        return;
    }
    const list = tracks.map((t, i) => `${i+1}. \`${t.contract.slice(0,10)}...\` ${t.current}/${t.supply}`).join('\n');
    bot.sendMessage(msg.chat.id, `📋 **Active Tracks (${tracks.length}):\n\n${list}`);
});

// /status
bot.onText(/\/status/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        `✅ **Bot Status**\n` +
        `⏰ 24/7 LIVE\n` +
        `📊 Tracks: ${tracks.length}\n` +
        `🔄 Auto-check: 30s`
    );
});

// Mint monitoring
async function checkMints() {
    console.log(`🔍 Scanning ${tracks.length} contracts...`);
    for (let track of tracks) {
        try {
            const response = await axios.get(
                `https://api.opensea.io/api/v1/events?asset_contract_address=${track.contract}&event_type=successful&limit=10`,
                {
                    headers: { 
                        'X-API-KEY': process.env.OPENSEA_API_KEY || 'test',
                        'User-Agent': 'MintBot/1.0'
                    },
                    timeout: 8000
                }
            );
            
            const mintCount = response.data.asset_events?.length || 0;
            track.current = mintCount;
            
            console.log(`📊 ${track.contract.slice(0,10)}: ${mintCount}/${track.supply}`);
            
            if (mintCount >= track.supply && !track.notified) {
                const alert = `🚨 **MINT ALERT!** 🚨\n\n📜 \`${track.contract}\`\n✅ ${mintCount}/${track.supply}\n\n⚡ **MINT NOW!!**`;
                bot.sendMessage(track.channel, alert);
                track.notified = true;
            }
        } catch (error) {
            console.log(`⚠️ ${track.contract.slice(0,10)}: API error`);
        }
    }
}

// Auto check every 30 seconds
cron.schedule('*/30 * * * * *', checkMints);

console.log('🚀 Mint Bot 24/7 LIVE! Send /start');
