const Discord = require('discord.js');
const db = require('../../db');

module.exports = {
    // Build context entry
    builder: new Discord.ContextMenuCommandBuilder()
        .setType(Discord.ApplicationCommandType.Message)
        .setName('Delete response'),
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
        const interactionUserId = db.prepare(`SELECT user_id FROM interactions WHERE prompt_message_id = ?`).get(interactionId)?.user_id;
        if (interactionUserId !== interaction.user.id) {
            return interaction.reply({
                content: `You can only delete responses that you prompted.`,
                flags: Discord.MessageFlags.Ephemeral
            });
        }
        const responseMessageIds = db.prepare(`SELECT id FROM interaction_messages WHERE interaction_id = ?`).all(interactionId).map(row => row.id);
        for (const msgId of responseMessageIds) {
            const message = await interaction.channel.messages.fetch(msgId).catch(() => null);
            if (message) {
                try {
                    await message.delete();
                } catch (error) {
                    console.error(`Failed to delete message ${msgId}:`, error);
                }
            }
        }
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
        interaction.editReply({
            content: `Deleted all response messages.`
        });
    }
};