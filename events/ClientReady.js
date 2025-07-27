const Discord = require('discord.js');
const config = require('../config.json');
const { logInfo } = require('../utils');
const bot = require('../bot');

const updateStatus = () => {
    bot.user.setActivity({
        name: config.bot.status.text,
        type: Discord.ActivityType[config.bot.status.type]
    });
};

module.exports = () => {
    logInfo(`Logged in as ${bot.user.tag}`);
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${bot.user.id}&permissions=2048&scope=bot`;
    logInfo(`Invite URL: ${inviteUrl}`);
    updateStatus();
    setInterval(updateStatus, 60 * 1000);
};