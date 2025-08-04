const db = require('../db');
module.exports = {
    definition: {
        type: 'function',
        name: 'read_user_knowledge',
        description: 'Read all of the knowledge that you have previously saved for a specific user.',
        parameters: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'The ID of the user whose saved knowledge to read.'
                }
            },
            required: ['user_id'],
            additionalProperties: false
        },
        strict: true
    },
    handler: args => {
        const { user_id } = args;
        const row = db.prepare(`SELECT knowledge FROM knowledge WHERE user_id = ?`).get(user_id);
        if (!row) {
            return `You haven't saved any knowledge for user ${user_id}.`;
        }
        return row.knowledge;
    }
};