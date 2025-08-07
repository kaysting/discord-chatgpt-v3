# Discord ChatGPT v3
A bot providing a relatively full-featured AI chatbot experience in the comfort of your Discord DMs.

## Features
- Works with all of OpenAI's recent `gpt` series [models](https://platform.openai.com/docs/models)
- Responses are sent in chunks to bypass Discord's character limits
- Chat with the bot in DMs or servers
  - Users are independent of one another and the AI can tell them apart
- Supports file processing for images, audio, and text files
  - Images use Vision
  - Audio uses the configured OpenAI transcription model (ideal for voice messages)
  - Text files are directly embedded into user messages
- Efficient attachment caching to avoid unnecessary network/API usage
- Per-user persistent memory storage allowing the AI to remember things between chats
- Built-in tools for random number and string generation (in addition to memory)
- Extensible tools system allowing additional capabilities to be added to the AI
- Slash commands and Apps menu items for...
  - Ignoring all existing messages or above a certain point
  - Getting an AI response as a raw text (markdown) file
  - Quickly deleting an entire AI response
- Zero-maintenance storage using SQLite

## Running the bot
1. [Download and install Node.js](https://nodejs.org/en/download/) if you don't have it
2. Clone (or download and unzip) the repository and `cd` into it with your terminal
3. Run `npm install`
4. Rename `config-example.json` to `config.json`
    * This prevents your config from being overwritten should you update your bot
5. [Create a new Discord application](https://discord.com/developers/applications)
    1. Set its name, description (about me), and picture as you see fit
    2. Copy the Application ID and paste it in the `credentials.discord_application_id` config field
    3. Go to the "Bot" tab and create a new bot if it's not created already
    4. Copy the bot token and paste it in the `credentials.discord_bot_token` config field
    5. Scroll down and make sure "Message content intent" is enabled
6. Set your Discord user ID in the `bot.owner_id` config field. Get this by turning on developer mode in settings and right-clicking on your profile.
7. [Get an OpenAI API key](https://platform.openai.com/account/api-keys) and paste it into the `credentials.openai_api_key` config field
8.  Make any other changes you see fit to the config file, then save it.
9.  Register the bot's commands by running `npm run register`
10. Start the bot with `npm start`
11. After logging in, an invite URL will be shown. Use this to invite the bot to a server.
12. Try it out by DMing or pinging the bot!

## Configuration
Most options are pretty self explanatory. Full docs will come soon.