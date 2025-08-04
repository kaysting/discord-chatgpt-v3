const db = require('../db');
module.exports = {
    definition: {
        type: 'function',
        name: 'write_user_knowledge',
        description: `Update your saved knowledge for a specific user. This will overwrite any existing knowledge for that user.`,
        parameters: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'The ID of the user whose saved knowledge to overwrite.'
                },
                knowledge: {
                    type: 'string',
                    description: 'The new knowledge string. Pass an empty string to clear saved knowledge. Must not exceed 2000 characters. Only keep important details and format it concisely to preserve space.'
                }
            },
            required: ['user_id', 'knowledge'],
            additionalProperties: false
        },
        strict: true
    },
    handler: args => {
        const { user_id, knowledge } = args;
        if (knowledge.length > 2000) {
            return `Knowledge string exceeds 2000 character limit. Shorten it and try again.`;
        }
        if (!user_id || !/^\d+$/.test(user_id)) {
            return `Invalid user ID provided. Please provide the numeric user ID from their message header.`;
        }
        if (knowledge.length === 0) {
            // Clear existing knowledge
            db.prepare(`DELETE FROM knowledge WHERE user_id = ?`).run(user_id);
            return `Knowledge successfully cleared for user ${user_id}.`;
        }
        db.prepare(`INSERT OR REPLACE INTO knowledge (user_id, knowledge) VALUES (?, ?)`)
            .run(user_id, knowledge);
        return `Knowledge successfully overwritten for user ${user_id}.`;
    }
};