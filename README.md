
# NodeJS STT and TTS via VAPI websocket using Deepgram with recording

A sample app that shows how to use Deepgram for TTS and STT and how to record it.

This sample also shows how to handle DTMF signals via Websocket.


## Setup and Running

### Private Key
- Generate a private key for you Vonage app and put it inside `private.key`

### For Deepgram
1. Register at [Deepgram](https://deepgram.com/) for a free account
2. Generate an API Key
3. Put your API Key Inside `.env`
4. Set the desired Speech-to-text language inisde `audio_processor.py` line 113
  
### Node
1. Populate your `.env` file with yout configurarion
1. `npm install`
2. `node app.js`
     

Set your Vonage callbacks to the following

- Answer callback URL: GET {APP_URL}/webhooks/answer

- Event URL: GET {APP_URL}/webhooks/call-event


## Tunneling

- [Ngrok](https://ngrok.com/) would be a good option.
