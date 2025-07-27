const fs = require('fs');
const Discord = require('discord.js');
const bot = require('./bot');
const db = require('./db');
const utils = require('./utils');

const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const fileName of eventFiles) {
    const filePath = `./events/${fileName}`;
    const eventHandler = require(filePath);
    const eventName = fileName.split('.')[0];
    bot.on(Discord.Events[eventName], eventHandler);
    utils.logInfo(`Registered event ${eventName} to ${filePath}`);
}

process.on('exit', () => {
    db.close && db.close();
});

process.on('SIGINT', () => {
    db.close && db.close();
    process.exit();
});

process.on('uncaughtException', (err) => {
    utils.logError(`Uncaught Exception: ${err.stack || err}`);
    db.close && db.close();
    process.exit(1);
});