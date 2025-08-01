const Discord = require('discord.js');
const db = require('../../db');

module.exports = {
    // Build context entry
    builder: new Discord.ContextMenuCommandBuilder()
        .setType(Discord.ApplicationCommandType.Message)
        .setName('Ignore above'),
    // Handle usage
    handler: async interaction => {
        const msg = interaction.options.getMessage('message');
        db.prepare(`INSERT OR REPLACE INTO channel_starts (channel_id, start_time) VALUES (?, ?)`)
            .run(interaction.channel.id, msg.createdTimestamp - 1);
        await interaction.reply({
            content: `Got it! All messages above this one will be ignored.`
        });
    }
};