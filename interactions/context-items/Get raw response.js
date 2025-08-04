const Discord = require('discord.js');
const db = require('../../db');

module.exports = {
    // Build context entry
    builder: new Discord.ContextMenuCommandBuilder()
        .setType(Discord.ApplicationCommandType.Message)
        .setName('Get raw response'),
    // Handle usage
    handler: async interaction => {
        const msg = interaction.options.getMessage('message');
        let interactionId = db.prepare(`SELECT interaction_id FROM interaction_messages WHERE id = ?`).get(msg.id)?.interaction_id;
        if (!interactionId) {
            interactionId = db.prepare(`SELECT prompt_message_id FROM interactions WHERE prompt_message_id = ?`).get(msg.id)?.prompt_message_id;
        }
        if (!interactionId) {
            return interaction.reply({
                content: `This message isn't associated with a saved interaction.`,
                flags: Discord.MessageFlags.Ephemeral
            });
        }
        const json = db.prepare(`SELECT output_entries FROM interactions WHERE prompt_message_id = ?`).get(interactionId)?.output_entries;
        if (!json) {
            return interaction.reply({
                content: `No saved output found for this interaction.`,
                flags: Discord.MessageFlags.Ephemeral
            });
        }
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
        const outputEntries = JSON.parse(json);
        let content = '';
        console.log(outputEntries);
        for (const entry of outputEntries) {
            if (entry.type === 'function_call') {
                content += `\n\n[Used tool \`${entry.name}\`]`;
            }
            if (entry.type === 'message') {
                for (const part of entry.content) {
                    if (part.text) {
                        content += `\n\n${part.text}`;
                    }
                }
            }
        }
        content = content.trim();
        const attachment = new Discord.AttachmentBuilder(Buffer.from(content), {
            name: `response.md`
        });
        interaction.editReply({
            files: [attachment]
        });
    }
};