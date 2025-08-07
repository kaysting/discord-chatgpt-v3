const db = require('../db');
module.exports = {
    definition: {
        type: 'function',
        name: 'write_user_memory',
        description: `Update your saved memory for a specific user. This will overwrite any existing memory for that user.`,
        parameters: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'The ID of the user whose saved memory to overwrite.'
                },
                memory: {
                    type: 'string',
                    description: 'The new memory string. Pass an empty string to clear saved memory. Must not exceed 2000 characters. Only keep important details and format it concisely to preserve space.'
                }
            },
            required: ['user_id', 'memory'],
            additionalProperties: false
        },
        strict: true
    },
    handler: args => {
        const { user_id, memory } = args;
        if (memory.length > 2000) {
            return `Memory string exceeds 2000 character limit. Shorten it and try again.`;
        }
        if (!user_id || !/^\d+$/.test(user_id)) {
            return `Invalid user ID provided. Please provide the numeric user ID from their message header.`;
        }
        if (memory.length === 0) {
            // Clear existing memory
            db.prepare(`DELETE FROM memory WHERE user_id = ?`).run(user_id);
            return `Memory successfully cleared for user ${user_id}.`;
        }
        db.prepare(`INSERT OR REPLACE INTO user_memory (user_id, memory) VALUES (?, ?)`)
            .run(user_id, memory);
        return `Memory successfully overwritten for user ${user_id}.`;
    }
};