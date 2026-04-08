require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');
const express = require('express');

// ─── ENV CHECK ──────────────────────────────────────────────
const token = process.env.TELEGRAM_BOT_TOKEN;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;
const PORT = process.env.PORT || 3000;

// FIX 1: RAILWAY_URL automatically Railway se milta hai
// Railway mein Environment Variable daalo: RAILWAY_URL = https://your-app-name.up.railway.app
const RAILWAY_URL = process.env.RAILWAY_URL;

if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN missing hai .env mein!');
    process.exit(1);
}
if (!RAILWAY_URL) {
    console.error('❌ RAILWAY_URL missing hai! Railway dashboard mein env variable add karo.');
    console.error('   Example: RAILWAY_URL=https://mint-bot-24x7.up.railway.app');
    process.exit(1);
}

console.log('🔧 Bot start ho raha hai...');
console.log(`🌐 Webhook URL: ${RAILWAY_URL}`);
console.log(`🔑 OpenSea API: ${OPENSEA_API_KEY ? 'Set ✅' : 'Missing ⚠️ (limited tracking)'}`);

// ─── BOT SETUP ──────────────────────────────────────────────
// FIX 2: Webhook mode Railway ke liye sahi hai
const bot = new TelegramBot(token, { webHook: { port: PORT } });

// FIX 3: Webhook set karo sahi URL se
const webhookUrl = `${RAILWAY_URL}/bot${token}`;
bot.setWebHook(webhookUrl)
    .then(() => console.log(`✅ Webhook set: ${webhookUrl}`))
    .catch(err => {
        console.error('❌ Webhook error:', err.message);
        console.error('   RAILWAY_URL sahi hai? Telegram token valid hai?');
    });

// ─── EXPRESS SERVER ─────────────────────────────────────────
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('🤖 NFT Mint Bot LIVE! Railway par chal raha hai.'));

// FIX 4: Webhook endpoint
app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Railway health check ke liye
app.get('/health', (req, res) => {
    res.json({ 
        status: 'alive', 
        tracks: tracks.length,
        uptime: Math.round(process.uptime()) + 's'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server live on port ${PORT}`);
});

// ─── DATA STORE ─────────────────────────────────────────────
let tracks = []; // { contract, supply, alertAt, chatId, current, notified, name }

// ─── OPENSEA API v2 (FIX 5: v1 dead hai!) ──────────────────
async function getContractNFTCount(contractAddress) {
    try {
        // FIX: OpenSea API v2 use karo
        const res = await axios.get(
            `https://api.opensea.io/api/v2/chain/ethereum/contract/${contractAddress}`,
            {
                headers: {
                    'X-API-KEY': OPENSEA_API_KEY || '',
                    'accept': 'application/json'
                },
                timeout: 8000
            }
        );
        
        // Total supply collection se
        return parseInt(res.data.total_supply) || 0;
    } catch (err) {
        // Fallback: Events count karo (recent mints)
        try {
            const res2 = await axios.get(
                `https://api.opensea.io/api/v2/events/chain/ethereum/contract/${contractAddress}?event_type=transfer&limit=50`,
                {
                    headers: { 
                        'X-API-KEY': OPENSEA_API_KEY || '',
                        'accept': 'application/json'
                    },
                    timeout: 8000
                }
            );
            // Total count header se
            return parseInt(res2.headers['x-total-count']) || res2.data.asset_events?.length || 0;
        } catch (err2) {
            console.error(`❌ API Error for ${contractAddress}:`, err2.message);
            return -1; // Error signal
        }
    }
}

// ─── COMMANDS ───────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
    const name = msg.from.first_name || 'User';
    bot.sendMessage(msg.chat.id, 
        `👋 Hello ${name}! NFT Mint Tracker Bot!\n\n` +
        `📋 Commands:\n` +
        `/track - Collection track karo\n` +
        `/list - Sab tracks dekhna\n` +
        `/status - Bot status\n` +
        `/stop - Tracking band karo\n\n` +
        `📌 Example:\n` +
        `/track 0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d 10000 500\n` +
        `(contract supply alertAt)\n\n` +
        `Jab alertAt mints hojaye, notification aayegi! 🚨`,
        { parse_mode: 'Markdown' }
    );
});

// FIX 6: /track command - channel hardcode nahi, chatId use karo
// Usage: /track <contract> <total_supply> <alert_at>
// Example: /track 0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d 10000 300
bot.onText(/\/track (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const parts = match[1].trim().split(/\s+/);
    
    const contract = parts[0]?.toLowerCase();
    const supply = parseInt(parts[1]);
    const alertAt = parseInt(parts[2]);
    
    // Validation
    if (!contract || !/^0x[0-9a-f]{40}$/i.test(contract)) {
        return bot.sendMessage(chatId, 
            '❌ Contract address galat hai!\n\n' +
            'Sahi format: `/track 0xbc4ca0... 10000 300`\n' +
            '(contract total_supply alert_threshold)',
            { parse_mode: 'Markdown' }
        );
    }
    
    if (isNaN(supply) || supply <= 0) {
        return bot.sendMessage(chatId, '❌ Total supply number hona chahiye! Example: `10000`', { parse_mode: 'Markdown' });
    }
    
    if (isNaN(alertAt) || alertAt <= 0 || alertAt > supply) {
        return bot.sendMessage(chatId, `❌ Alert threshold sahi nahi! 1 se ${supply} ke beech hona chahiye.`);
    }
    
    // Check duplicate
    if (tracks.find(t => t.contract === contract && t.chatId === chatId)) {
        return bot.sendMessage(chatId, '⚠️ Ye contract pehle se track ho raha hai!');
    }
    
    const loadMsg = await bot.sendMessage(chatId, '🔍 Contract check ho raha hai...');
    
    // Check current count
    const currentCount = await getContractNFTCount(contract);
    
    const track = {
        contract,
        supply,
        alertAt,
        chatId,
        current: currentCount < 0 ? 0 : currentCount,
        notified: currentCount >= alertAt, // Agar pehle se reach ho chuki
        addedAt: Date.now(),
        name: contract.slice(0, 8) + '...'
    };
    
    tracks.push(track);
    
    const status = currentCount < 0 ? '⚠️ Count check nahi hua (API issue)' : 
                   `📊 Current: **${currentCount.toLocaleString()}** minted`;
    const alertStatus = track.notified ? '⚠️ Already reached! Alert fire hoga agar count badhega.' : 
                        `🎯 Alert: ${alertAt.toLocaleString()} mints pe notification aayegi`;
    
    bot.editMessageText(
        `✅ Tracking start!\n\n` +
        `📋 Contract: \`${contract}\`\n` +
        `${status}\n` +
        `📦 Supply: ${supply.toLocaleString()}\n` +
        `${alertStatus}\n\n` +
        `Har 30 seconds mein check hoga! 🔄`,
        { chat_id: chatId, message_id: loadMsg.message_id, parse_mode: 'Markdown' }
    );
});

bot.onText(/\/list/, (msg) => {
    const chatId = msg.chat.id;
    const myTracks = tracks.filter(t => t.chatId === chatId);
    
    if (myTracks.length === 0) {
        return bot.sendMessage(chatId, 'ℹ️ Koi tracking nahi chal rahi.\n`/track` se start karo!', { parse_mode: 'Markdown' });
    }
    
    const list = myTracks.map((t, i) => {
        const pct = ((t.current / t.supply) * 100).toFixed(1);
        const remaining = t.alertAt - t.current;
        return `${i+1}. \`${t.contract.slice(0,10)}...\`\n` +
               `   📊 ${t.current.toLocaleString()}/${t.supply.toLocaleString()} (${pct}%)\n` +
               `   🎯 Alert at: ${t.alertAt.toLocaleString()} | ${remaining > 0 ? `${remaining} baki` : '✅ REACHED'}`
    }).join('\n\n');
    
    bot.sendMessage(chatId, `📋 **Tracked Contracts:**\n\n${list}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, (msg) => {
    const uptime = Math.round(process.uptime() / 60);
    bot.sendMessage(msg.chat.id, 
        `✅ **Bot LIVE hai!**\n\n` +
        `⏱️ Uptime: ${uptime} minutes\n` +
        `📋 Total tracks: ${tracks.length}\n` +
        `🌐 Webhook: Active\n` +
        `🔑 OpenSea: ${OPENSEA_API_KEY ? 'Connected' : 'No API key'}`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/stop (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const contractInput = match[1].trim().toLowerCase();
    
    const before = tracks.length;
    tracks = tracks.filter(t => !(t.chatId === chatId && t.contract.includes(contractInput)));
    
    if (tracks.length < before) {
        bot.sendMessage(chatId, `✅ Tracking stop ho gayi!`);
    } else {
        bot.sendMessage(chatId, `❌ Contract nahi mila! /list se check karo.`);
    }
});

bot.onText(/\/stopall/, (msg) => {
    const chatId = msg.chat.id;
    const count = tracks.filter(t => t.chatId === chatId).length;
    tracks = tracks.filter(t => t.chatId !== chatId);
    bot.sendMessage(chatId, `⏹️ ${count} tracking(s) stop ho gayi!`);
});

// ─── MINT CHECKER (FIX 7: Real mint count) ──────────────────
async function checkMints() {
    if (tracks.length === 0) return;
    
    console.log(`🔍 Checking ${tracks.length} tracks...`);
    
    for (let track of tracks) {
        try {
            const count = await getContractNFTCount(track.contract);
            
            if (count < 0) {
                console.log(`⚠️ Skip ${track.contract.slice(0,8)}: API error`);
                continue;
            }
            
            const prevCount = track.current;
            track.current = count;
            
            // New mints detected?
            if (count > prevCount) {
                console.log(`📈 ${track.contract.slice(0,8)}: ${prevCount} → ${count}`);
            }
            
            // Alert threshold reached?
            if (count >= track.alertAt && !track.notified) {
                const pct = ((count / track.supply) * 100).toFixed(1);
                
                bot.sendMessage(track.chatId,
                    `🚨 **MINT ALERT! Abhi Mint Karo!** 🚨\n\n` +
                    `📋 Contract: \`${track.contract}\`\n` +
                    `📊 Minted: **${count.toLocaleString()}** / ${track.supply.toLocaleString()}\n` +
                    `📈 Progress: ${pct}%\n` +
                    `🎯 Threshold: ${track.alertAt.toLocaleString()} reached!\n\n` +
                    `🔗 [OpenSea par check karo](https://opensea.io/assets/ethereum/${track.contract})\n\n` +
                    `⚡ **JALDI KARO!**`,
                    { parse_mode: 'Markdown' }
                ).catch(e => console.error('Alert send error:', e.message));
                
                track.notified = true;
                console.log(`🚨 ALERT sent for ${track.contract.slice(0,8)}!`);
            }
            
            // Reset notification agar supply reset ho
            if (count < track.alertAt && track.notified) {
                track.notified = false;
            }
            
        } catch (err) {
            console.error(`Error checking ${track.contract.slice(0,8)}:`, err.message);
        }
        
        // Rate limit avoid karne ke liye
        await new Promise(r => setTimeout(r, 1000));
    }
}

// Har 30 seconds mein check karo
cron.schedule('*/30 * * * * *', checkMints);

// ─── ERROR HANDLING ──────────────────────────────────────────
bot.on('polling_error', (err) => console.error('Polling error:', err));
bot.on('error', (err) => console.error('Bot error:', err.message));

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err.message);
});

console.log('✅ Bot ready! Waiting for messages...');
