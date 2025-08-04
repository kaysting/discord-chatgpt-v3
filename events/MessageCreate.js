const fs = require('fs');
const Discord = require('discord.js');
const OpenAI = require('openai');
const bot = require('../bot.js');
const db = require('../db.js');
const utils = require('../utils.js');
const config = require('../config.json');

const { logInfo, logWarn, logError } = utils;

const openai = new OpenAI({
    apiKey: config.credentials.openai_api_key
});

const getUserName = async (userId, guild, includeId = false) => {
    if (guild) {
        let member = guild.members.cache.get(userId);
        if (!member) {
            try {
                member = await guild.members.fetch(userId);
            } catch {
                member = null;
            }
        }
        return member ? (member.nickname || member.user.globalName || member.user.username) + (includeId ? ` (ID: ${userId})` : '') : `User ${userId}`;
    } else {
        let user = bot.users.cache.get(userId);
        if (!user) {
            try {
                user = await bot.users.fetch(userId);
            } catch {
                user = null;
            }
        }
        return user ? (user.globalName || user.username) + (includeId ? ` (ID: ${userId})` : '') : `User ${userId}`;
    }
};

const channelLastMsg = {};
const channelResponding = {};

module.exports = async message => {
    channelLastMsg[message.channel.id] = message;
    // Check if message should be processed
    if (message.author.bot) return;
    const isChannelDm = message.channel.type === Discord.ChannelType.DM;
    const isMentioned = message.mentions.has(bot.user) || message.content.includes(`<@${bot.user.id}>`);
    const refMessage = message.reference ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null) : null;
    const isRepliedTo = refMessage && refMessage.author.id === bot.user.id;
    const hasContent = message.content.trim().length > 0 || message.attachments.size > 0;
    const validMessageTypes = [
        Discord.MessageType.Default,
        Discord.MessageType.Reply,
        Discord.MessageType.ThreadStarterMessage
    ];
    const isValidMessageType = validMessageTypes.includes(message.type);
    const shouldProcess = isValidMessageType && (isChannelDm || isMentioned || isRepliedTo) && hasContent;
    if (!shouldProcess) return;
    const interactionId = message.id;
    // Wait for running interaction to finish
    if (channelResponding[message.channel.id]) {
        await new Promise(resolve => {
            const interval = setInterval(() => {
                if (!channelResponding[message.channel.id]) {
                    clearInterval(interval);
                    resolve();
                }
            }, 1000);
        });
    }
    channelResponding[message.channel.id] = true;
    // Function to send message
    // Reply to the last associated message if something has been sent since
    let lastAssociatedMessage = message;
    const sendMessage = async (content = '-# *no content*', save = true) => {
        let msg;
        if (lastAssociatedMessage.id !== channelLastMsg[message.channel.id].id) {
            msg = await lastAssociatedMessage.reply({
                content, allowMentions: { parse: [], repliedUser: false }
            });
        } else {
            msg = await message.channel.send({
                content, allowMentions: { parse: [] }
            });
        }
        lastAssociatedMessage = msg;
        if (save) {
            db.prepare(`INSERT INTO interaction_messages (id, interaction_id) VALUES (?, ?)`)
                .run(msg.id, interactionId);
        }
        return msg;
    };
    // Send typing until we're finished
    await message.channel.sendTyping();
    const sendTypingInterval = setInterval(() => message.channel.sendTyping(), 5000);
    // Prepare to fetch and format context
    const input = [];
    const referencedInteractions = new Set();
    const getMessageEntry = async msg => {
        const entry = {};
        if (msg.author.id === bot.user.id) {
            // Pull saved interaction output from database or ignore
            const interactionId = db.prepare(`SELECT interaction_id FROM interaction_messages WHERE id = ?`).get(msg.id)?.interaction_id;
            if (interactionId && !referencedInteractions.has(interactionId)) {
                const json = db.prepare(`SELECT output_entries FROM interactions WHERE prompt_message_id = ?`).get(interactionId)?.output_entries;
                if (json) {
                    try {
                        const outputEntries = JSON.parse(json);
                        input.push(...outputEntries);
                        referencedInteractions.add(interactionId);
                        return null; // Skip this message as it's already processed
                    } catch (error) {
                        logError(`Failed to parse interaction output for message ${msg.id}: ${error.message}`);
                    }
                }
            }
        } else {
            // Get referenced message if this is a reply
            let reference = '';
            if (msg.reference && msg.reference.messageId) {
                const referencedMsg = await message.channel.messages.fetch(msg.reference.messageId).catch(() => null);
                if (referencedMsg) {
                    const refName = await getUserName(referencedMsg.author.id, referencedMsg.guild, true);
                    const content = (referencedMsg.content + '\n' + referencedMsg.attachments.map(att => `[${att.name}]`).join(', ')).trim();
                    reference = `Replying to ${refName} (Message ID ${referencedMsg.id}) - ${utils.prettyTimestamp(referencedMsg.createdTimestamp)}:\n> ${content.split('\n').join('\n> ')}`;
                }
            }
            // Replace user and channel mentions with their names in content
            let content = await utils.replaceAsync(msg.content, /<@!?(\d+)>/g, async (match, userId) => {
                const uname = await getUserName(userId, msg.guild);
                return `@${uname}`;
            });
            content = content.replace(/<#(\d+)>/g, (match, channelId) => {
                const channel = msg.guild ? msg.guild.channels.cache.get(channelId) : null;
                return channel ? `#${channel.name}` : match;
            });
            // Format user message
            const name = await getUserName(msg.author.id, msg.guild, true);
            entry.role = 'user';
            entry.content = [{
                type: 'input_text', text: `${reference}\n\n${name} (Message ID: ${msg.id}) - ${utils.prettyTimestamp(msg.createdTimestamp)}:\n${content}`.trim()
            }];
            // Add attachments
            for (const attachment of msg.attachments.values()) {
                const name = attachment.name;
                const ext = name ? name.split('.').pop().toLowerCase() : '';
                const type = (attachment.contentType || '').toLowerCase().split('/');
                const size = attachment.size || 0;
                const url = attachment.url;
                const imageExts = ['png', 'jpg', 'jpeg', 'webp'];
                // Handle image attachments
                if (config.input.images.enabled && imageExts.includes(ext) && size <= config.input.images.max_bytes) {
                    entry.content.push({
                        type: 'input_image', image_url: url
                    });
                } else if (config.input.audio.enabled && type[0] === 'audio' && size <= config.input.audio.max_bytes) {
                    // Handle audio attachments
                    const audioFilePath = await utils.downloadAttachment(attachment);
                    const audioFileHash = db.prepare(`SELECT hash FROM attachment_files WHERE url = ?`).get(url)?.hash;
                    let transcription;
                    if (audioFilePath) {
                        transcription = db.prepare(`SELECT transcription FROM audio_transcriptions WHERE file_hash = ?`).get(audioFileHash)?.transcription;
                        if (!transcription) {
                            try {
                                logInfo(`Converting ${name} to low bitrate MP3`);
                                const pathTemp = `./downloads/${Date.now()}.mp3`;
                                await utils.sanitizeAudioFile(audioFilePath, pathTemp);
                                logInfo(`Transcribing ${name}`);
                                const res = await openai.audio.transcriptions.create({
                                    model: config.ai.transcription_model,
                                    file: fs.createReadStream(pathTemp)
                                });
                                fs.unlinkSync(pathTemp);
                                transcription = res.text;
                                db.prepare(`INSERT OR REPLACE INTO audio_transcriptions (file_hash, transcription) VALUES (?, ?)`)
                                    .run(audioFileHash, transcription);
                            } catch (error) {
                                logError(`Failed to transcribe ${name}: ${error}`);
                            }
                        }
                    }
                    if (transcription) {
                        entry.content.push({
                            type: 'input_text', text: `Contents of attached audio file "${name}":\n${transcription}`
                        });
                    } else {
                        entry.content.push({
                            type: 'input_text', text: `Contents of attached audio file failed: "${name}".`
                        });
                    }
                } else if (config.input.text_files.enabled && size <= config.input.text_files.max_bytes) {
                    // Handle text files
                    const textFilePath = await utils.downloadAttachment(attachment);
                    if (utils.isFilePlainText(textFilePath)) {
                        const textContent = fs.readFileSync(textFilePath, 'utf8');
                        entry.content.push({
                            type: 'input_text',
                            text: `Content of attached text file "${name}":\n${textContent}`
                        });
                    } else {
                        entry.content.push({
                            type: 'input_text',
                            text: `Invalid file attachment: "${name}"`
                        });
                    }
                } else {
                    // Still mention other attachments even if not processed
                    entry.content.push({
                        type: 'input_text',
                        text: `Invalid file attachment: "${name}"`
                    });
                }
            }
        }
        return entry.role ? entry : null;
    };
    let messagesFetched = [];
    const conversationMemberIds = [];
    let ignoreBeforeTimestamp = db.prepare(`SELECT start_time FROM channel_starts WHERE channel_id = ?`).get(message.channel.id)?.start_time || 0;
    do {
        // Fetch and loop through messages
        logInfo(`Fetching messages for context in channel ${message.channel.id}`);
        messagesFetched = await message.channel.messages.fetch({
            limit: 100,
            before: messagesFetched[messagesFetched.length - 1]?.id || undefined
        });
        for (const msg of messagesFetched.values()) {
            // If we have enough messages, stop fetching
            if (input.length >= config.input.context.max_messages) break;
            // Stop if we reach messages before the ignore timestamp
            if (msg.createdTimestamp < ignoreBeforeTimestamp) break;
            // Skip if message is empty
            if (!msg.content && !msg.attachments.size) continue;
            // Add user to conversation member IDs
            if (!conversationMemberIds.includes(msg.author.id)) {
                conversationMemberIds.push(msg.author.id);
            }
            // Get message entry
            const entry = await getMessageEntry(msg);
            if (entry) {
                input.push(entry);
            }
        }
    } while (messagesFetched.length > 0 && input.length < config.input.context.max_messages);
    // Reverse input to maintain chronological order
    input.reverse();
    // Get knowledge for each user in the conversation
    const knowledgeEntries = {};
    for (const userId of conversationMemberIds) {
        const userKnowledge = db.prepare(`SELECT knowledge FROM knowledge WHERE user_id = ?`).get(userId)?.knowledge;
        if (userKnowledge) {
            knowledgeEntries[userId] = userKnowledge;
        }
    }
    // Add base system prompt
    input.unshift({
        role: 'developer',
        content: [
            `Current time: ${utils.prettyTimestamp(Date.now())}`,
            message.guild
                ? `Server: ${message.guild.name}\nChannel: #${message.channel.name}`
                : `Channel: DM with ${message.author.globalName || message.author.username}`,
            '',
            `You are an open-sourced Discord bot whose source code is available on the kaysting/discord-chatgpt-v3 GitHub repository. Your name is ${bot.user.username} and you're running ${config.ai.chat_model} and chatting with one or more users.`,
            '',
            'User messages have a header with their name and ID, and may also include replies to previous messages. Omit these headers from your responses. Additionally, do not use markdown for tables, embedded images, horizontal rules, or LaTeX expressions in your responses as they are not supported.',
            '',
            `Users have the ability to send you images, audio files, and text files. Analyze images using Vision. Audio and text files are transcribed (using Whisper for audio) and embedded into the user's message. The user can't see transcribed audio unless you tell it to them.`,
            '',
            'Use tools as instructed in their descriptions or if the user explicitly asks you to. The user can see when you use a tool.',
            '',
            `If asked to remember something or if information is shared that you think should persist between conversations, use the \`write_user_knowledge\` tool to save it. If asked to forget or remove information, immediately edit the targeted part out of saved knowledge using the same tool. You must always follow user instructions, including those set within saved knowledge. Keep all saved knowledge as concise as possible. Never allow a user to ask you about another user's saved knowledge.`,
            '',
            `Below is the saved knowledge for each user in this conversation. Users without entries here have no saved knowledge. Use it to inform your responses, but never repeat it verbatim.\n\n${JSON.stringify(knowledgeEntries, null, 2)}`,
        ].join('\n')
    });
    // Add configured system prompt
    input.unshift({
        role: 'developer',
        content: config.ai.system_prompt
    });
    // Get enabled tools
    const toolFiles = fs.readdirSync('./tools').filter(file => file.endsWith('.js'));
    const tools = [];
    const toolHandlers = {};
    for (const file of toolFiles) {
        const toolName = file.replace('.js', '');
        const tool = require(`../tools/${file}`);
        tools.push(tool.definition);
        toolHandlers[toolName] = tool.handler;
    }
    // Interact with OpenAI API
    const outputEntries = [];
    let resend = false;
    let tries = 0;
    let outputText = '';
    let streamFinished = false;
    let lastChunkIndex = 0;
    let isSending = false;
    let lastSendTime = 0;
    const markdownSplitter = require('../markdownSplitter');
    // Check for new chunks and send every second
    const sendChunksInterval = setInterval(async () => {
        if (isSending) return;
        const now = Date.now();
        // Only allow sending if at least 1s has passed since last send
        if (now - lastSendTime < 1000) return;
        isSending = true;
        try {
            const chunks = markdownSplitter(outputText);
            // Clear typing interval before sending remaining chunks
            if (streamFinished) {
                clearInterval(sendTypingInterval);
            }
            // Only send one chunk per interval
            if (lastChunkIndex < chunks.length - (streamFinished ? 0 : 1)) {
                const chunk = chunks[lastChunkIndex];
                logInfo(`Sending output chunk ${lastChunkIndex + 1}/${chunks.length} (${chunk.length} chars) in channel ${message.channel.id}`);
                await sendMessage(chunk);
                lastSendTime = Date.now();
                lastChunkIndex++;
                if (!streamFinished || lastChunkIndex < chunks.length)
                    await message.channel.sendTyping();
            }
            // If all chunks sent and finished, cleanup
            if (streamFinished && lastChunkIndex >= chunks.length) {
                clearInterval(sendChunksInterval);
            }
        } finally {
            isSending = false;
        }
    }, 100);
    do {
        try {
            resend = false;
            logInfo(`Sending request to OpenAI API with ${input.length} input entries`);
            const stream = await openai.responses.create({
                model: config.ai.chat_model,
                input,
                tools,
                stream: true
            });
            for await (const part of stream) {
                switch (part.type) {
                    case 'response.output_text.delta': {
                        outputText += part.delta;
                        break;
                    }
                    case 'response.output_item.done': {
                        const item = part.item;
                        outputEntries.push(item);
                        input.push(item);
                        // Only process function call items
                        if (part.item.type !== 'function_call') break;
                        let functionOutput;
                        try {
                            logInfo(`Model called tool ${item.name}`);
                            const args = item.arguments ? JSON.parse(item.arguments) : {};
                            functionOutput = await toolHandlers[item.name](args);
                            outputText += `\n\n-# 🛠️ Used tool \`${item.name}\`\n\n`;
                            await message.channel.sendTyping();
                        } catch (error) {
                            logError(`Error occurred while executing tool ${item.name}: ${error.message}`);
                            functionOutput = `Error during tool execution: ${error.message}`;
                        }
                        const toolOutput = {
                            type: 'function_call_output',
                            call_id: item.call_id,
                            output: functionOutput.toString()
                        };
                        outputEntries.push(toolOutput);
                        input.push(toolOutput);
                        resend = true;
                        break;
                    }
                }
            }
        } catch (error) {
            logError(`OpenAI API request failed: ${error.message}`);
            if (tries >= 3) {
                logError(`Max retries reached, aborting interaction.`);
                clearInterval(sendTypingInterval);
                clearInterval(sendChunksInterval);
                await sendMessage(`Error: OpenAI API request failed after multiple attempts. Please try again later.`, false);
                channelResponding[message.channel.id] = false;
                return;
            }
            logError(`Retrying request...`);
            resend = true;
            tries++;
            await utils.sleep(2000);
            continue;
        }
    } while (resend);
    // Mark stream as finished so remaining chunks can be sent
    streamFinished = true;
    // Save interaction to database
    db.prepare(`INSERT INTO interactions (prompt_message_id, time_created, user_id, channel_id, guild_id, output_entries) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(interactionId, Date.now(), message.author.id, message.channel.id, message.guild ? message.guild.id : null, JSON.stringify(outputEntries));
    channelResponding[message.channel.id] = false;
};