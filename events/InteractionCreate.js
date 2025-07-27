const utils = require('../utils');

module.exports = async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const file = `../interactions/commands/${interaction.commandName}.js`;
        const cmd = require(file);
        await cmd.handler(interaction);
        utils.logInfo(`Handled ${interaction.user.tag}'s usage of /${interaction.commandName} in ${interaction.channel.id}`);
    }
    else if (interaction.isContextMenuCommand()) {
        const file = `../interactions/context-items/${interaction.commandName}.js`;
        const cmd = require(file);
        await cmd.handler(interaction);
        utils.logInfo(`Handled ${interaction.user.tag}'s usage of context item "${interaction.commandName}"`);
    }
};