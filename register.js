const fs = require('fs');
const Discord = require('discord.js');
const bot = require('./bot');
const utils = require('./utils');
const config = require('./config.json');

(async () => {
    // Wait for bot to log in
    await new Promise(resolve => {
        bot.once('ready', resolve);
    });
    // Build commands
    const builders = [];
    const slashCommandFiles = fs.readdirSync('./interactions/commands').filter(file => file.endsWith('.js'));
    const contextMenuFiles = fs.readdirSync('./interactions/context-items').filter(file => file.endsWith('.js'));
    for (const file of slashCommandFiles) {
        const cmd = require(`./interactions/commands/${file}`);
        builders.push(cmd.builder);
    }
    for (const file of contextMenuFiles) {
        const cmd = require(`./interactions/context-items/${file}`);
        builders.push(cmd.builder);
    }
    // Register slash commands with Discord
    const api = new Discord.REST().setToken(config.credentials.discord_bot_token);
    await api.put(Discord.Routes.applicationCommands(config.credentials.discord_application_id), {
        body: builders
    });
    utils.logInfo(`Registered slash commands`);
    process.exit(0);
})();