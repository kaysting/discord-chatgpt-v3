const Discord = require('discord.js');
const db = require('../../db');
const bot = require('../../bot');
const config = require('../../config.json');

module.exports = {
    builder: new Discord.SlashCommandBuilder()
        .setName('access')
        .setDescription(`Manage who can talk to ${bot.user.username}.`)
        .addSubcommand(subcmd => subcmd
            .setName('list')
            .setDescription(`View users whose access permissions have been overridden.`)
        )
        .addSubcommand(subcmd => subcmd
            .setName('allow')
            .setDescription(`Explicitly allow a user to talk to ${bot.user.username}.`)
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user to allow.')
                .setRequired(true)
            )
        )
        .addSubcommand(subcmd => subcmd
            .setName('block')
            .setDescription(`Explicitly block a user from talking to ${bot.user.username}.`)
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user to block.')
                .setRequired(true)
            )
        )
        .addSubcommand(subcmd => subcmd
            .setName('default')
            .setDescription(`Reset a user's access permissions to the configured public access setting.`)
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user whose access permissions to reset.')
                .setRequired(true)
            )
        ),
    handler: async (interaction) => {
        const caller = interaction.user;
        if (caller.id !== config.permissions.owner_id) {
            return interaction.reply({
                content: `Only the bot owner can manage ${bot.user.username}'s access permissions.`,
                flags: Discord.MessageFlags.Ephemeral
            });
        }
        const user = interaction.options.getUser('user');
        switch (interaction.options.getSubcommand()) {
            case 'list': {
                const format = (arr) => {
                    let removed = [];
                    let str = arr.join(', ') || '*None*';
                    while (str.length > 1024) {
                        removed.push(arr.pop());
                        str = [...arr, `and ${removed.length} more...`].join(', ');
                    }
                    return str;
                };
                const allowedUserMentions = db.prepare(`SELECT user_id FROM user_access WHERE can_access = 1`).all().map(row => `<@${row.user_id}>`);
                const blockedUserMentions = db.prepare(`SELECT user_id FROM user_access WHERE can_access = 0`).all().map(row => `<@${row.user_id}>`);
                const defaultAccess = config.permissions.allow_public_access ? 'enabled' : 'disabled';
                const embed = new Discord.EmbedBuilder()
                    .setFields(
                        {
                            name: 'Explicitly allowed users',
                            value: format(allowedUserMentions)
                        },
                        {
                            name: 'Explicitly blocked users',
                            value: format(blockedUserMentions)
                        },
                        {
                            name: 'Everyone else',
                            value: `**Is ${defaultAccess ? 'allowed to talk' : 'blocked from talking'} to ${bot.user.username}**, as per the public access setting.`
                        }
                    )
                    .setColor(config.bot.embed_color);
                return await interaction.reply({
                    embeds: [embed],
                    flags: Discord.MessageFlags.Ephemeral
                });
            }
            case 'allow': {
                db.prepare(`INSERT OR REPLACE INTO user_access (user_id, can_access) VALUES (?, ?)`).run(user.id, 1);
                return await interaction.reply({
                    content: `${user} is now explicitly allowed to talk to ${bot.user.username}.`
                });
            }
            case 'block': {
                db.prepare(`INSERT OR REPLACE INTO user_access (user_id, can_access) VALUES (?, ?)`).run(user.id, 0);
                return await interaction.reply({
                    content: `${user} is now explicitly blocked from talking to ${bot.user.username}.`
                });
            }
            case 'default': {
                db.prepare(`DELETE FROM user_access WHERE user_id = ?`).run(user.id);
                return await interaction.reply({
                    content: `${user}'s access has been reset to follow the public access setting, which is currently **${config.permissions.allow_public_access ? 'true' : 'false'}**.`
                });
            }
        }
    }
};