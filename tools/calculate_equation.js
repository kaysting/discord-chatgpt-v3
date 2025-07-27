const math = require('mathjs');
module.exports = {
    definition: {
        type: 'function',
        name: 'calculate_equation',
        description: 'Evaluates a complex mathematical equation using mathjs. Not required for simple arithmetic.',
        parameters: {
            type: 'object',
            properties: {
                equation: {
                    type: 'string',
                    description: 'The mathematical equation to evaluate.'
                }
            },
            required: ['equation'],
            additionalProperties: false
        },
        strict: true
    },
    handler: args => {
        const { equation } = args;
        try {
            return math.evaluate(equation);
        } catch (e) {
            return { error: 'Invalid equation', details: e.message };
        }
    }
};