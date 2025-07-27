const Discord = require('discord.js');
const db = require('../../db');

module.exports = {
    builder: new Discord.SlashCommandBuilder()
        .setName('ignore-above')
        .setDescription('Make the AI ignore all existing messages in this channel.'),
    handler: async (interaction) => {
        db.prepare(`INSERT OR REPLACE INTO channel_starts (channel_id, start_time) VALUES (?, ?)`)
            .run(interaction.channel.id, Date.now());
        await interaction.reply({
            content: `Got it! All messages above this one will be ignored.`
        });
    }
};