const fs = require('fs');
const Discord = require('discord.js');
const config = require('./config.json');

(async () => {
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
    console.log(`Registered slash commands`);
})();