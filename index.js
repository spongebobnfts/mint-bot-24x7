require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
let tracks = [];

console.log('🤖 Railway Mint Bot Starting...');

// Commands
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, '🚀 **24/7 Mint Bot LIVE!**\nUse /track chain:eth contract:0x123 supply:300 channel:@yourchannel'));
bot.onText(/\/help/, (msg) => bot.sendMessage(msg.chat.id, '/track chain:eth contract:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d supply:10 channel:@yourname'));

// Track
bot.onText(/\/track (.+)/, (msg, match) => {
    const params = match[1].toLowerCase();
    const contract = params.match(/contract:([0-9a-f]{40,})/)?.[1];
    const supply = parseInt(params.match(/supply:(\d+)/)?.[1] || 0);
    const channel = params.match(/channel:@?([a-z0-9_]+)/i)?.[1] ? '@' + params.match(/channel:@?([a-z0-9_]+)/i)[1] : '@test';
    
    if (!contract || !supply) {
        return bot.sendMessage(msg.chat.id, '❌ /track chain:eth contract:0x123... supply:300 channel:@yourname');
    }
    
    tracks.push({ contract: contract.toLowerCase(), supply, channel, current: 0, notified: false });
    bot.sendMessage(msg.chat.id, `✅ Tracking \`${contract.slice(0,10)}...\` → ${supply} supply`);
});

// List
bot.onText(/\/list/, (msg) => {
    const list = tracks.map(t => `\`${t.contract.slice(0,10)}...\` ${t.current}/${t.supply}`).join('\n') || 'Empty';
    bot.sendMessage(msg.chat.id, `📋 Tracks:\n${list}`);
});

// Mint checker
async function checkMints() {
    for (let track of tracks) {
        try {
            const res = await axios.get(`https://api.opensea.io/api/v1/events?asset_contract_address=${track.contract}&limit=10`, {
                headers: { 'X-API-KEY': process.env.OPENSEA_API_KEY }
            });
            track.current = res.data.asset_events?.length || 0;
            
            if (track.current >= track.supply && !track.notified) {
                bot.sendMessage(track.channel, `🚨 MINT LIVE! ${track.contract} ${track.current}/${track.supply}`);
                track.notified = true;
            }
        } catch (e) {}
    }
}

cron.schedule('*/30 * * * * *', checkMints);
console.log('🚀 Railway Bot LIVE!');
