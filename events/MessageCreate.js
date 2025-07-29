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

const SPLIT_CODEBLOCKS = true;
const SPLIT_LISTS = true;
const SPLIT_PARAGRAPHS = true;
const SPLIT_BY_WORD = true;
const splitOutput = output => {
    const MAX_CHUNK = 2000;
    const lines = output.split('\n');
    const chunks = [];
    let buffer = [];
    let inCodeBlock = false;
    let codeLang = '';

    const flushBuffer = () => {
        if (!buffer.length) return;
        let chunk = buffer.join('\n');
        if (chunk.length <= MAX_CHUNK) {
            chunks.push(chunk);
        } else {
            // Split further by line
            let temp = [];
            let currLen = 0;
            for (let i = 0; i < buffer.length; i++) {
                let line = buffer[i];
                // If adding this line exceeds limit, flush temp
                if ((currLen + line.length + 1) > MAX_CHUNK) {
                    if (inCodeBlock && SPLIT_CODEBLOCKS) {
                        // End code block and restart in next chunk
                        if (temp.length && !temp[temp.length - 1].trim().startsWith('```')) {
                            temp.push('```');
                        }
                        chunks.push(temp.join('\n'));
                        // Start new code block with language
                        temp = ['```' + codeLang];
                        currLen = temp[0].length + 1;
                        // If line is code block end, skip adding it
                        if (line.trim().startsWith('```')) continue;
                    } else {
                        chunks.push(temp.join('\n'));
                        temp = [];
                        currLen = 0;
                    }
                }
                temp.push(line);
                currLen += line.length + 1;
            }
            if (temp.length) {
                // If in code block, ensure code block is closed
                if (inCodeBlock && SPLIT_CODEBLOCKS && !temp[temp.length - 1].trim().startsWith('```')) {
                    temp.push('```');
                }
                chunks.push(temp.join('\n'));
            }
        }
        buffer = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect code block start/end
        if (SPLIT_CODEBLOCKS && line.trim().startsWith('```')) {
            if (inCodeBlock) {
                buffer.push(line);
                flushBuffer();
                inCodeBlock = false;
                codeLang = '';
            } else {
                flushBuffer();
                buffer.push(line);
                // Get language if present
                codeLang = line.trim().slice(3).trim();
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            buffer.push(line);
            continue;
        }

        // Detect list
        if (SPLIT_LISTS && /^\s*([-*+]|\d+\.)\s+/.test(line)) {
            if (buffer.length && !/^\s*([-*+]|\d+\.)\s+/.test(buffer[0])) {
                flushBuffer();
            }
            buffer.push(line);
            // If next line is not a list, flush buffer
            if (!lines[i + 1] || !/^\s*([-*+]|\d+\.)\s+/.test(lines[i + 1])) {
                flushBuffer();
            }
            continue;
        }

        // Paragraphs (split on blank lines)
        if (SPLIT_PARAGRAPHS && line.trim() === '') {
            flushBuffer();
            continue;
        }

        buffer.push(line);
    }

    // Push any remaining buffer
    flushBuffer();

    // Final pass: if any chunk is still too long, split by word
    const finalChunks = [];
    for (const chunk of chunks) {
        if (chunk.length <= MAX_CHUNK) {
            finalChunks.push(chunk);
        } else if (SPLIT_BY_WORD) {
            // If code block, preserve code block markers and language
            if (chunk.startsWith('```')) {
                const lines = chunk.split('\n');
                let lang = lines[0].slice(3).trim();
                let codeLines = lines.slice(1, lines[lines.length - 1].trim() === '```' ? -1 : undefined);
                let temp = ['```' + lang];
                let currLen = temp[0].length + 1;
                for (let i = 0; i < codeLines.length; i++) {
                    let codeLine = codeLines[i];
                    if ((currLen + codeLine.length + 1 + 3) > MAX_CHUNK) { // +3 for closing ```
                        temp.push('```');
                        finalChunks.push(temp.join('\n'));
                        temp = ['```' + lang];
                        currLen = temp[0].length + 1;
                    }
                    temp.push(codeLine);
                    currLen += codeLine.length + 1;
                }
                if (temp.length > 1) {
                    temp.push('```');
                    finalChunks.push(temp.join('\n'));
                }
            } else {
                // Split by word
                let words = chunk.split(' ');
                let temp = [];
                let currLen = 0;
                for (let word of words) {
                    if ((currLen + word.length + 1) > MAX_CHUNK) {
                        finalChunks.push(temp.join(' '));
                        temp = [];
                        currLen = 0;
                    }
                    temp.push(word);
                    currLen += word.length + 1;
                }
                if (temp.length) finalChunks.push(temp.join(' '));
            }
        } else {
            finalChunks.push(chunk);
        }
    }

    return finalChunks;
};

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
    const reference = message.reference ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null) : null;
    const isRepliedTo = reference && reference.author.id === bot.user.id;
    const hasContent = message.content.trim().length > 0 || message.attachments.size > 0;
    if ((!isChannelDm && !isMentioned && !isRepliedTo) || !hasContent) return;
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
    const sendMessage = async (content = '-# *no content*') => {
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
                    reference = `Replying to ${refName} (Message ID ${referencedMsg.id}) - ${new Date(referencedMsg.createdTimestamp).toISOString()}:\n> ${content.split('\n').join('\n> ')}`;
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
                type: 'input_text', text: `${reference}\n\n${name} (Message ID: ${msg.id}) - ${new Date(msg.createdTimestamp).toISOString()}:\n${content}`.trim()
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
            // Get message entry
            const entry = await getMessageEntry(msg);
            if (entry) {
                input.push(entry);
            }
        }
    } while (messagesFetched.length > 0 && input.length < config.input.context.max_messages);
    // Reverse input to maintain chronological order
    input.reverse();
    // Create complete system prompt
    const systemLines = [
        `Current time: ${new Date().toISOString()}`,
        message.guild
            ? `Server: ${message.guild.name}\nChannel: #${message.channel.name}`
            : `Channel: DM with ${message.author.globalName || message.author.username}`,
        '',
        `You are a bot named ${bot.user.username} running ${config.ai.chat_model} chatting on Discord with one or more users. Their messages have a header with their name and ID, and may also include replies to previous messages. You should not include these headers in your responses. Additionally, markdown for tables and embedded images, as well as LaTeX expressions, are not supported, so do not use them in your responses.`,
        '',
        `Users have the ability to send you images, audio files, and text files. You analyze images yourself using Vision, while audio and text files are transcribed (using Whisper for audio) and embedded into the user's message as plain text. The user can't see transcribed audio unless you tell it to them.`,
        '',
        'Use tools as instructed in their descriptions, or if the user asks you to. The user can see when you use a tool.',
        '',
        config.ai.system_prompt
    ];
    input.unshift({
        role: 'developer',
        content: systemLines.join('\n')
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
    let res;
    let resend = false;
    let tries = 0;
    do {
        logInfo(`Sending request to OpenAI API with ${input.length} input entries`);
        try {
            res = await openai.responses.create({
                model: config.ai.chat_model,
                input,
                tools
            });
        } catch (error) {
            logError(`OpenAI API request failed: ${error.message}`);
            if (tries >= 3) {
                logError(`Max retries reached, aborting interaction.`);
                clearInterval(sendTypingInterval);
                await sendMessage(`Error: OpenAI API request failed after multiple attempts. Please try again later.`);
                return;
            }
            logError(`Retrying request...`);
            resend = true;
            tries++;
            await utils.sleep(2000);
            continue;
        }
        outputEntries.push(...res.output);
        input.push(...res.output);
        // Process API output
        for (const entry of res.output) {
            switch (entry.type) {
                // Handle function calls
                case 'function_call': {
                    let output;
                    try {
                        logInfo(`Model called tool ${entry.name}`);
                        const args = entry.arguments ? JSON.parse(entry.arguments) : {};
                        output = await toolHandlers[entry.name](args);
                        const msg = await sendMessage(`-# Used tool \`${entry.name}\` with arguments \`${JSON.stringify(args)}\``);
                        db.prepare(`INSERT INTO interaction_messages (id, interaction_id) VALUES (?, ?)`)
                            .run(msg.id, interactionId);
                        await message.channel.sendTyping();
                    } catch (error) {
                        logError(`Error occurred while executing tool ${entry.name}: ${error.message}`);
                        output = `Error during tool execution: ${error.message}`;
                    }
                    const toolOutput = {
                        type: 'function_call_output',
                        call_id: entry.call_id,
                        output: output.toString()
                    };
                    outputEntries.push(toolOutput);
                    input.push(toolOutput);
                    resend = true;
                    break;
                }
                default: {
                    resend = false;
                }
            }
        }
    } while (resend);
    // Save interaction to database
    db.prepare(`INSERT INTO interactions (prompt_message_id, time_created, user_id, channel_id, guild_id, output_entries) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(interactionId, Date.now(), message.author.id, message.channel.id, message.guild ? message.guild.id : null, JSON.stringify(outputEntries));
    // Split response output into chunks and send to Discord
    clearInterval(sendTypingInterval);
    const parts = splitOutput(res.output_text);
    for (let i = 0; i < parts.length; i++) {
        logInfo(`Sending output chunk in channel ${message.channel.id}`);
        const msg = await sendMessage(parts[i]);
        db.prepare(`INSERT INTO interaction_messages (id, interaction_id) VALUES (?, ?)`)
            .run(msg.id, interactionId);
        if (i < parts.length - 1) {
            await message.channel.sendTyping();
        }
        await utils.sleep(1000); // Avoid hitting rate limits
    }
    channelResponding[message.channel.id] = false;
};