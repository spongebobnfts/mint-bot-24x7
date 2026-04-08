require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');

const token = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const webhookUrl = process.env.RAILWAY_URL || `https://mint-bot-24x7-production.up.railway.app`;

console.log('🤖 Starting Mint Bot...');
console.log('Token:', token ? '✅ OK' : '❌ MISSING');
console.log('Webhook URL:', webhookUrl);

// Initialize webhook bot
const bot = new TelegramBot(token);

// Set webhook
bot.setWebHook(`${webhookUrl}/bot${token}`).then(() => {
    console.log('✅ Webhook activated!');
}).catch(err => {
    console.error('❌ Webhook error:', err.message);
});

let tracks = [];

// Express server for webhooks
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ 
        status: 'Mint Bot 24/7 LIVE!', 
        tracks: tracks.length,
        uptime: new Date().toISOString()
    });
});

app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Webhook: ${webhookUrl}/bot${token}`);
});

// Commands
bot.onText(/\/start/, (msg) => {
    console.log('✅ /start from:', msg.chat.username || msg.chat.id);
    bot.sendMessage(msg.chat.id, 
        `🎉 **MINT BOT 24/7 LIVE!** 🎉\n\n` +
        `📝 **Commands:**\n` +
        `/track chain:eth contract:0x123... supply:300 channel:@yourchannel\n` +
        `/list\n` +
        `/status\n\n` +
        `🔥 Ready to snipe!`
    );
});

bot.onText(/\/track (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const params = match[1].toLowerCase();
    
    const contractMatch = params.match(/contract:([0-9a-f]{40,})/i);
    const supplyMatch = params.match(/supply:(\d+)/);
    const channelMatch = params.match(/channel:@?([a-z0-9_]+)/i);
    
    if (!contractMatch || !supplyMatch) {
        bot.sendMessage(chatId, 
            `❌ **Wrong format!**\n\n` +
            `✅ **Example:**\n` +
            `/track chain:eth contract:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d supply:500 channel:@sagar`
        );
        return;
    }
    
    const track = {
        id: Date.now(),
        contract: contractMatch[1].toLowerCase(),
        supply: parseInt(supplyMatch[1]),
        channel: '@' + (channelMatch?.[1] || 'sagar'),
        current: 0,
        notified: false
    };
    
    // Remove duplicate
    tracks = tracks.filter(t => t.contract !== track.contract);
    tracks.push(track);
    
    bot.sendMessage(chatId, 
        `✅ **TRACKING STARTED!** 🎯\n\n` +
        `⛓️ Chain: ETH\n` +
        `📜 Contract: \`${track.contract.slice(0,10)}...\`\n` +
        `🎯 Target Supply: ${track.supply}\n` +
        `📢 Channel: ${track.channel}\n\n` +
        `⏱️ Checking every 30s...`
    );
    
    console.log(`➕ Track added: ${track.contract.slice(0,10)}`);
});

bot.onText(/\/list/, (msg) => {
    if (tracks.length === 0) {
        return bot.sendMessage(msg.chat.id, '📭 **No active tracks**');
    }
    
    const list = tracks.map((t, i) => 
        `${i+1}. \`${t.contract.slice(0,10)}...\` **${t.current}/${t.supply}**`
    ).join('\n');
    
    bot.sendMessage(msg.chat.id, `📋 **Active Tracks (${tracks.length})**\n\n${list}`);
});

bot.onText(/\/status/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        `✅ **Bot Status**\n\n` +
        `⏰ **Uptime:** 24/7 LIVE\n` +
        `📊 **Tracks:** ${tracks.length}\n` +
        `🔄 **Check Interval:** 30s\n` +
        `🌐 **Platform:** Railway`
    );
});

// Mint monitoring
async function checkMints() {
    console.log(`🔍 Scanning ${tracks.length} contracts...`);
    
    for (let track of tracks) {
        try {
            const response = await axios.get(
                `https://api.opensea.io/api/v1/events?asset_contract_address=${track.contract}&event_type=successful&limit=20`,
                {
                    headers: {
                        'X-API-KEY': process.env.OPENSEA_API_KEY,
                        'User-Agent': 'MintBot-Railway/1.0'
                    },
                    timeout: 10000
                }
            );
            
            const mints = response.data.asset_events || [];
            track.current = mints.length;
            
            console.log(`📊 ${track.contract.slice(0,10)}: ${track.current}/${track.supply}`);
            
            // Alert
            if (track.current >= track.supply && !track.notified) {
                const alertMsg = 
                    `🚨 **MINT ALERT!!** 🚨\n\n` +
                    `📜 **Contract:** \`${track.contract}\`\n` +
                    `✅ **Minted:** ${track.current}\n` +
                    `🎯 **Target:** ${track.supply}\n\n` +
                    `⚡ **MINT NOW!!**`;
                
                await bot.sendMessage(track.channel, alertMsg);
                track.notified = true;
                console.log('🔔 ALERT SENT!');
            }
        } catch (error) {
            console.log(`⚠️ ${track.contract.slice(0,10)}: ${error.message.slice(0,50)}`);
        }
    }
}

// Check every 30 seconds
cron.schedule('*/30 * * * * *', checkMints);

console.log('🎉 Mint Bot fully operational!');
