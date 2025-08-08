const Discord = require('discord.js');
const db = require('../../db');

module.exports = {
    // Build context entry
    builder: new Discord.ContextMenuCommandBuilder()
        .setType(Discord.ApplicationCommandType.Message)
        .setName('View response reasoning'),
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
        for (const entry of outputEntries) {
            if (entry.type === 'reasoning') {
                for (const part of entry.summary) {
                    if (part.text) {
                        content += `\n\n${part.text}`;
                    }
                }
            }
        }
        content = content.trim();
        // Performs word wrapping to a max line length
        // Breaks at spaces first, then at characters
        const wordWrap = (input, maxLineLength) => {
            const lines = input.split('\n');
            const wrappedLines = [];
            for (const line of lines) {
                let currentLine = '';
                for (const word of line.split(' ')) {
                    if ((currentLine + word).length > maxLineLength) {
                        if (currentLine) wrappedLines.push(currentLine.trim());
                        currentLine = word + ' ';
                    } else {
                        currentLine += word + ' ';
                    }
                }
                if (currentLine) wrappedLines.push(currentLine.trim());
            }
            return wrappedLines.join('\n');
        };
        content = wordWrap(content, 80);
        if (!content) {
            return interaction.editReply({
                content: `No reasoning summary found for this interaction.`,
                flags: Discord.MessageFlags.Ephemeral
            });
        }
        const attachment = new Discord.AttachmentBuilder(Buffer.from(content), {
            name: `reasoning_summary.md`
        });
        interaction.editReply({
            files: [attachment]
        });
    }
};