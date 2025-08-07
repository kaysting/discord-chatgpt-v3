const fs = require('fs');
const Discord = require('discord.js');
const bot = require('./bot');
const db = require('./db');
const utils = require('./utils');
const config = require('./config.json');

// Check config version
const CURRENT_CONFIG_VERSION = 1;
if (config.config_version !== CURRENT_CONFIG_VERSION) {
    utils.logError(`Config version mismatch: expected ${CURRENT_CONFIG_VERSION}, got ${config.config_version}`);
    utils.logError(`Please replace your current config.json with config-example.json and transfer your settings.`);
    process.exit(1);
}

// Register events
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const fileName of eventFiles) {
    const filePath = `./events/${fileName}`;
    const eventHandler = require(filePath);
    const eventName = fileName.split('.')[0];
    bot.on(Discord.Events[eventName], eventHandler);
    utils.logInfo(`Registered event ${eventName} to ${filePath}`);
}

// Close db on exit
process.on('exit', () => {
    db.close && db.close();
});
process.on('SIGINT', () => {
    db.close && db.close();
    process.exit();
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    utils.logError(`Uncaught Exception: ${err.stack || err}`);
    db.close && db.close();
    process.exit(1);
});