//(c) 2024
//Beejay Urzo
//Vonage

require('dotenv').config();
const { FileClient } = require('@vonage/server-client');
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const app = express();
const fs = require('fs');
const https = require('https');
const {process_audio} = require('./audio_processor');
var WebSocketServer = require('ws').Server;
const server = require('http').createServer();
const port = process.env.PORT;
const url = process.env.URL;
const Vonage_API_KEY = process.env.API_KEY;
const Vonage_APPLICATION_ID = process.env.APPLICATION_ID;
const Vonage_PRIVATE_KEY = process.env.PRIVATE_KEY;
const credentials = {
  applicationId: Vonage_APPLICATION_ID,
  privateKey: Vonage_PRIVATE_KEY,
};
var fileClient = new FileClient(credentials, {})


// app.use(logger('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));



var wss = new WebSocketServer({ server: server });
wss.on('connection', function connection(ws) {
  process_audio(ws, "uuid", "int") //Audio Processor will handle the websocket audio
  ws.send('something');

  ws.on('close', (data)=>{
    console.log("close")
    console.log(data)
  });
});


//create recordings directory if not present
var dir = './recordings';
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}


app.get('/', (req, res) => {
  res.json(200);
});

app.get('/webhooks/answer', (req, res) => {
  uuid = req.query["conversation_uuid"]
  console.log("ANSWER: ",`wss://${req.hostname}`)
  ncco = [
    {
        "action": "talk",
        "text": "Loading Demo",
    },
    {
        "action": "record",
        "eventMethod": "GET",
        "eventUrl": [
        `https://${req.hostname}/webhooks/record-event`
        ]
    },
    {
        "action": "connect",
        "from": "Vonage",
        "endpoint": [
            {
                "type": "websocket",
                "uri": `wss://${req.hostname}`,
                "content-type": "audio/l16;rate=16000",
                "headers": {
                    "uuid": uuid,
                    "tts-barge-in-on-dtmf-key":"any" //TTS stops if DTMF key received. Can be 0,1,2,3,4,5,6,7,8,9,*,# or any. Any means any key
                }
            }
        ],
    }
  ]
  res.json(ncco).status(200);
});

app.post('/webhooks/call-event', (req, res) => {
  //console.dir(req.body , {depth:9})
  res.json("events").status(200);
});

app.post('/webhooks/rtc-event', (req, res) => {
  res.json("events").status(200);
});



app.get('/webhooks/record-event', async (req, res) => {
  //get recording URL from body
  recording_url = req.query.recording_url;
  
  //save using SDK
  await fileClient.downloadFile(recording_url, "./recordings/"+Date.now()+".mp3")
})

server.on('request', app)

server.listen(port, () => {
  console.log(`Answering Machine Demo app listening on port ${port}`)
  console.log(``)
});




