const Discord = require('discord.js');
const db = require('../../db');
const bot = require('../../bot');

module.exports = {
    builder: new Discord.SlashCommandBuilder()
        .setName('memory')
        .setDescription(`Manage what information ${bot.user.username} knows about you.`)
        .addSubcommand(subcmd => subcmd
            .setName('edit')
            .setDescription(`Edit the persistent info ${bot.user.username} remembers about you.`)
        )
        .addSubcommand(subcmd => subcmd
            .setName('clear')
            .setDescription(`Clear everything ${bot.user.username} remembers about you.`)
        ),
    handler: async (interaction) => {
        switch (interaction.options.getSubcommand()) {
            case 'edit':
                const modal = new Discord.ModalBuilder()
                    .setCustomId('editMemory')
                    .setTitle('Edit persistent memory');
                const memoryInput = new Discord.TextInputBuilder()
                    .setCustomId('input')
                    .setLabel('Memory')
                    .setStyle(Discord.TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(2000);
                memoryInput.setPlaceholder(`Tell ${bot.user.username} anything you want it to remember about you.`);
                const memory = db.prepare(`SELECT memory FROM user_memory WHERE user_id = ?`).get(interaction.user.id)?.memory;
                memoryInput.setValue(memory || '');
                const row = new Discord.ActionRowBuilder().addComponents(memoryInput);
                modal.addComponents(row);
                await interaction.showModal(modal);
                break;
            case 'clear':
                db.prepare(`DELETE FROM user_memory WHERE user_id = ?`)
                    .run(interaction.user.id);
                await interaction.reply({
                    content: `Your saved memory has been cleared. To get a clean slate with ${bot.user.username}, use the \`/ignore above\` command.`,
                    ephemeral: true
                });
                break;
        }
    }
};