const Discord = require('discord.js');
const db = require('../../db');

module.exports = async interaction => {
    const input = interaction.fields.getTextInputValue('input');
    db.prepare(`INSERT OR REPLACE INTO user_memory (user_id, memory) VALUES (?, ?)`)
        .run(interaction.user.id, input);
    await interaction.reply({
        content: `Your saved memory has been updated!`,
        flags: Discord.MessageFlags.Ephemeral
    });
};