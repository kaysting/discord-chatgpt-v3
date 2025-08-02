/**
 * Splits a markdown-formatted string into an array of chunks, each with a maximum length.
 * This function processes the markdown line-by-line, creating chunks from logical blocks
 * (a single paragraph line, a whole list, or a whole code block). It does NOT
 * combine separate blocks into a single chunk.
 *
 * @param {string} markdown The input string of markdown text.
 * @param {number} [maxLength=2000] The maximum character length for any given chunk.
 * @returns {string[]} An array of markdown chunks.
 */
function splitMarkdown(markdown, maxLength = 2000) {
    const chunks = [];
    const lines = markdown.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Ignore empty lines between blocks
        if (line.trim() === '') {
            i++;
            continue;
        }

        let block;
        // Check for the start of a code block
        if (line.startsWith('```')) {
            const closingFenceIndex = findClosingFence(lines, i);
            block = lines.slice(i, closingFenceIndex + 1).join('\n');
            i = closingFenceIndex + 1;
        }
        // Check for the start of a list
        else if (/^(?:\s*[*+-]|\s*\d+\.)\s/.test(line)) {
            const endOfListIndex = findEndOfList(lines, i);
            block = lines.slice(i, endOfListIndex + 1).join('\n');
            i = endOfListIndex + 1;
        }
        // Otherwise, it's a single paragraph line
        else {
            block = line;
            i++;
        }

        // Add the assembled block to the chunks array.
        // This function no longer tries to "pack" blocks together.
        addBlockAsChunk(block, chunks, maxLength);
    }

    return chunks;
}

/**
 * Adds a block of text to the chunks array. If the block is too long, it's
 * split into multiple chunks. Otherwise, it's added as a single new chunk.
 * @param {string} block The block of text (can be a single line, a list, or a code block).
 * @param {string[]} chunks The array of chunks to add to.
 * @param {number} maxLength The maximum length of a chunk.
 */
function addBlockAsChunk(block, chunks, maxLength) {
    // If the block itself is oversized, split it and add all its parts.
    if (block.length > maxLength) {
        const subChunks = splitSingleBlock(block, maxLength);
        chunks.push(...subChunks);
    }
    // Otherwise, push the block as its own new chunk.
    else {
        chunks.push(block);
    }
}

// Helper to find the closing fence of a code block
function findClosingFence(lines, startIndex) {
    for (let i = startIndex + 1; i < lines.length; i++) {
        if (lines[i].startsWith('```')) {
            return i;
        }
    }
    return lines.length - 1; // No closing fence found
}

// Helper to find the end of a list block
function findEndOfList(lines, startIndex) {
    let i = startIndex;
    while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        // A list ends with a blank line or a non-list line.
        if (nextLine.trim() === '' || !/^(?:\s*[*+-]|\s*\d+\.)\s/.test(nextLine)) {
            return i;
        }
        i++;
    }
    return i;
}

/**
 * Dispatches an oversized block to the correct splitting function based on its type.
 * @param {string} block - The oversized block string.
 * @param {number} maxLength - The maximum chunk length.
 * @returns {string[]} An array of smaller chunks from the split block.
 */
function splitSingleBlock(block, maxLength) {
    if (block.startsWith('```') && block.includes('\n') && block.endsWith('```')) {
        return splitCodeBlock(block, maxLength);
    } else {
        return splitGenericBlock(block, maxLength);
    }
}

/**
 * Splits an oversized code block, ensuring each new chunk is a valid code block.
 * @param {string} block - The oversized code block string.
 * @param {number} maxLength - The maximum chunk length.
 * @returns {string[]} An array of smaller, valid code blocks.
 */
function splitCodeBlock(block, maxLength) {
    const chunks = [];
    const lines = block.split('\n');
    const header = lines[0];
    const footer = '```';
    const contentLines = lines.slice(1, -1);
    const maxContentLength = maxLength - header.length - footer.length - 2;

    let currentSubChunkContent = [];
    for (const line of contentLines) {
        const currentLength = currentSubChunkContent.join('\n').length;
        if (currentLength + (currentLength > 0 ? 1 : 0) + line.length <= maxContentLength) {
            currentSubChunkContent.push(line);
        } else {
            if (currentSubChunkContent.length > 0) {
                chunks.push(`${header}\n${currentSubChunkContent.join('\n')}\n${footer}`);
            }
            currentSubChunkContent = line.length <= maxContentLength ? [line] : [];
            if (line.length > maxContentLength) {
                const splitLines = splitLineByWordThenChar(line, maxContentLength);
                splitLines.forEach(part => chunks.push(`${header}\n${part}\n${footer}`));
            }
        }
    }
    if (currentSubChunkContent.length > 0) {
        chunks.push(`${header}\n${currentSubChunkContent.join('\n')}\n${footer}`);
    }
    return chunks;
}

/**
 * Splits a generic block (paragraph or list) by lines, then words, then characters.
 * @param {string} block - The oversized block string.
 * @param {number} maxLength - The maximum chunk length.
 * @returns {string[]} An array of smaller chunks.
 */
function splitGenericBlock(block, maxLength) {
    const chunks = [];
    let currentChunk = "";
    const lines = block.split('\n');

    for (const line of lines) {
        if (line.length > maxLength) {
            if (currentChunk.length > 0) chunks.push(currentChunk);
            const splitLines = splitLineByWordThenChar(line, maxLength);
            chunks.push(...splitLines.slice(0, -1));
            currentChunk = splitLines.slice(-1)[0] || "";
            continue;
        }

        const separator = currentChunk.length > 0 ? '\n' : '';
        if (currentChunk.length + separator.length + line.length <= maxLength) {
            currentChunk += separator + line;
        } else {
            chunks.push(currentChunk);
            currentChunk = line;
        }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);
    return chunks;
}

/**
 * Splits a single line of text, prioritizing splits at spaces.
 * @param {string} line - The line of text to split.
 * @param {number} maxLength - The maximum length for any part.
 * @returns {string[]} An array of strings, each no longer than maxLength.
 */
function splitLineByWordThenChar(line, maxLength) {
    const parts = [];
    let remainingLine = line;
    while (remainingLine.length > maxLength) {
        const subString = remainingLine.substring(0, maxLength);
        let splitPos = subString.lastIndexOf(' ');
        if (splitPos <= 0) splitPos = maxLength;
        parts.push(remainingLine.substring(0, splitPos));
        remainingLine = remainingLine.substring(splitPos).trimStart();
    }
    if (remainingLine.length > 0) parts.push(remainingLine);
    return parts;
}

// Export the main function for use in other modules.
module.exports = splitMarkdown;
