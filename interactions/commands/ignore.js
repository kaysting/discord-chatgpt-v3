const Discord = require('discord.js');
const db = require('../../db');
const bot = require('../../bot');

module.exports = {
    builder: new Discord.SlashCommandBuilder()
        .setName('ignore')
        .setDescription('Manage existing message ignores in this channel.')
        .addSubcommand(subcmd => subcmd
            .setName('above')
            .setDescription(`Make ${bot.user.username} ignore all existing messages in this channel.`)
        )
        .addSubcommand(subcmd => subcmd
            .setName('undo')
            .setDescription(`Allow ${bot.user.username} to read all recent messages in this channel, if they were previously ignored.`)
        ),
    handler: async (interaction) => {
        switch (interaction.options.getSubcommand()) {
            case 'above':
                db.prepare(`INSERT OR REPLACE INTO channel_starts (channel_id, start_time) VALUES (?, ?)`)
                    .run(interaction.channel.id, Date.now());
                await interaction.reply({
                    content: `Got it! ${bot.user.username} will ignore all messages above this one.`,
                });
                break;
            case 'undo':
                db.prepare(`DELETE FROM channel_starts WHERE channel_id = ?`)
                    .run(interaction.channel.id);
                await interaction.reply({
                    content: `Got it! ${bot.user.username} can now read all recent messages.`
                });
                break;
        }
    }
};