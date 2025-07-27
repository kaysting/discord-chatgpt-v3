const Discord = require('discord.js');
const utils = require('./utils');
const config = require('./config.json');

const bot = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.DirectMessages,
        Discord.GatewayIntentBits.MessageContent
    ],
    partials: [
        Discord.Partials.User,
        Discord.Partials.Channel,
        Discord.Partials.Message
    ]
});

utils.logInfo(`Logging into Discord...`);
bot.login(config.credentials.discord_bot_token);

module.exports = bot;