module.exports = {
    definition: {
        type: 'function',
        name: 'generate_random_string',
        description: 'Generates a random string of the specified length.',
        parameters: {
            type: 'object',
            properties: {
                length: {
                    type: 'integer',
                    description: 'The length of the random string to generate.'
                },
                charset: {
                    type: 'string',
                    description: 'The character set to use for the random string. Defaults to alphanumeric characters.'
                },
                n: {
                    type: 'integer',
                    description: 'The number of strings to generate. Defaults to 1.'
                }
            },
            required: ['length', 'charset', 'n'],
            additionalProperties: false
        }
    },
    handler: args => {
        let { length, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', n = 1 } = args;
        const getRandomChar = () => charset.charAt(Math.floor(Math.random() * charset.length));
        if (n === 1) {
            return Array.from({ length }, getRandomChar).join('');
        }
        return Array.from({ length: n }, () => Array.from({ length }, getRandomChar).join(''));
    }
};