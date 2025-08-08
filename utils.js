const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { isText } = require('istextorbinary');
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/utc'));

const stripAnsi = input => {
    return input.replace(/\x1B\[[0-9;]*m/g, '');
};

const log = (level, ...message) => {
    const ts = new Date().toISOString();
    let f = console.log;
    let msg = `[${ts}] [${level.toUpperCase()}]`;
    for (const arg of message) {
        if (typeof arg === 'string')
            msg += ` ${arg}`;
        else
            msg += ` ${util.inspect(arg, { depth: null, colors: true })}`;
    }
    if (level === 'debug') {
        f = console.debug;
    }
    switch (level) {
        case 'warn':
            f = console.warn;
            break;
        case 'error':
            f = console.error;
            break;
    }
    f(msg);
    if (!fs.existsSync('./logs')) {
        fs.mkdirSync('./logs', { recursive: true });
    }
    const logFile = path.join('./logs', `${dayjs().format('YYYY-MM-DD')}.log`);
    fs.appendFileSync(logFile, `${stripAnsi(msg)}\n`, 'utf8');
};
const logInfo = message => log('info', message);
const logDebug = message => log('debug', message);
const logWarn = message => log('warn', message);
const logError = message => log('error', message);

const downloadFile = async (url, filePath) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const writer = fs.createWriteStream(filePath);
    const res = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    res.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};

const hashFile = async (filePath) => {
    const hash = crypto.createHash('sha256');
    const fileStream = fs.createReadStream(filePath);
    return new Promise((resolve, reject) => {
        fileStream.on('data', data => hash.update(data));
        fileStream.on('end', () => resolve(hash.digest('hex')));
        fileStream.on('error', err => reject(err));
    });
};

const downloadAttachment = async (attachment) => {
    const db = require('./db.js');
    const url = attachment.url;
    const name = attachment.name;
    const existingFile = db.prepare(`SELECT * FROM attachment_files WHERE url = ?`).get(url);
    if (existingFile && fs.existsSync(existingFile.path)) {
        return existingFile.path;
    }
    const tempFilePath = `./downloads/${Date.now()}`;
    try {
        logInfo(`Downloading file from ${url}`);
        await downloadFile(url, tempFilePath);
    } catch (error) {
        logError(`Failed to download file from ${url}: ${error.message}`);
        return null;
    }
    const hash = await hashFile(tempFilePath);
    const filePath = path.join(__dirname, `./downloads/${hash.substring(0, 8)}-${name}`);
    fs.renameSync(tempFilePath, filePath);
    db.prepare(`INSERT OR REPLACE INTO attachment_files (url, hash, path, time_created) VALUES (?, ?, ?, ?)`)
        .run(url, hash, filePath, Date.now());
    logInfo(`File cached at ${filePath}`);
    return filePath;
};

const isFilePlainText = (filePath) => {
    const buffer = fs.readFileSync(filePath);
    return isText(null, buffer);
};

function sanitizeAudioFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioCodec('libmp3lame')
            .audioChannels(1)
            .audioFrequency(16000)
            .outputOptions('-b:a 64k') // Bitrate, adjust if needed
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .save(outputPath);
    });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function replaceAsync(str, regex, asyncFn) {
    const matches = [];
    str.replace(regex, (...args) => {
        matches.push(args);
        return '';
    });
    const results = await Promise.all(matches.map(args => asyncFn(...args)));
    let i = 0;
    return str.replace(regex, () => results[i++]);
}

// Returns a prettily formatted timestamp string in UTC
const prettyTimestamp = parsableTs => {
    return dayjs(parsableTs).utc().format('YYYY-MM-DD HH:mm:ss UTC');
};

const getUserName = async (userId, guild, includeId = false) => {
    const bot = require('./bot.js');
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

module.exports = {
    logInfo,
    logWarn,
    logError,
    replaceAsync,
    downloadFile,
    hashFile,
    downloadAttachment,
    isFilePlainText,
    sanitizeAudioFile,
    sleep,
    prettyTimestamp,
    getUserName
};