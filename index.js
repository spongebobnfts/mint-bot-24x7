require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

const token = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const url = process.env.RAILWAY_URL || `https://your-app.railway.app`;

// Webhook bot (Railway friendly)
const bot = new TelegramBot(token, { webHook: true });

// Railway URL set (important!)
bot.setWebHook(`${url}/bot${token}`).then(() => {
    console.log('✅ Webhook set!');
}).catch(err => {
    console.log('Webhook error:', err.message);
});

let tracks = [];

// Express server for webhook
const express = require('express');
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('Mint Bot LIVE!'));

app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`🚀 Bot live on port ${PORT}`);
});

// Commands
bot.onText(/\/start/, (msg) => {
    console.log('✅ /start from:', msg.chat.username);
    bot.sendMessage(msg.chat.id, '🎉 **24/7 WEBHOOK BOT LIVE!**\n\n/track chain:eth contract:0x123 supply:300 channel:@yourchannel');
});

bot.onText(/\/track (.+)/, (msg, match) => {
    const params = match[1].toLowerCase();
    const contract = params.match(/contract:([0-9a-f]{40,})/i)?.[1];
    const supply = parseInt(params.match(/supply:(\d+)/)?.[1] || 0);
    
    if (!contract || !supply) {
        return bot.sendMessage(msg.chat.id, '❌ /track chain:eth contract:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d supply:10 channel:@sagar');
    }
    
    const track = {
        contract: contract.toLowerCase(),
        supply,
        channel: '@sagar',
        current: 0,
        notified: false
    };
    
    tracks.push(track);
    bot.sendMessage(msg.chat.id, `✅ Tracking \`${track.contract.slice(0,10)}...\` → ${track.supply} supply`);
});

bot.onText(/\/list/, (msg) => {
    const list = tracks.map(t => `\`${t.contract.slice(0,10)}...\` ${t.current}/${t.supply}`).join('\n') || 'No tracks';
    bot.sendMessage(msg.chat.id, `📋 Tracks:\n${list}`);
});

bot.onText(/\/status/, (msg) => {
    bot.sendMessage(msg.chat.id, `✅ **Railway LIVE**\nTracks: ${tracks.length}`);
});

// Mint checker
async function checkMints() {
    for (let track of tracks) {
        try {
            const res = await axios.get(
                `https://api.opensea.io/api/v1/events?asset_contract_address=${track.contract}&limit=5`,
                { headers: { 'X-API-KEY': process.env.OPENSEA_API_KEY }, timeout: 5000 }
            );
            track.current = res.data.asset_events?.length || 0;
            
            if (track.current >= track.supply && !track.notified) {
                bot.sendMessage(track.channel, `🚨 MINT! ${track.contract.slice(0,10)} ${track.current}/${track.supply}`);
                track.notified = true;
            }
        } catch (e) {}
    }
}

cron.schedule('*/30 * * * * *', checkMints);

console.log('🚀 Webhook Bot Ready!');
