module.exports = {
    definition: {
        type: 'function',
        name: 'generate_random_number',
        description: 'Generates a random integer between the specified min and max values. This must be used when randomness is requested.',
        parameters: {
            type: 'object',
            properties: {
                min: {
                    type: 'integer',
                    description: 'The minimum value of the random number (inclusive).'
                },
                max: {
                    type: 'integer',
                    description: 'The maximum value of the random number (inclusive).'
                },
                n: {
                    type: 'integer',
                    description: 'The number of ints to generate. Defaults to 1.'
                }
            },
            required: ['min', 'max', 'n'],
            additionalProperties: false
        },
        strict: true
    },
    handler: args => {
        let { min, max, n = 1 } = args;
        if (min > max) {
            [min, max] = [max, min]; // Swap if min is greater than max
        }
        const getRandomInt = () => Math.floor(Math.random() * (max - min + 1)) + min;
        if (n === 1) {
            return getRandomInt();
        }
        return Array.from({ length: n }, getRandomInt);
    }
};