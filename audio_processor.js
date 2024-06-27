let name="audio_processor"
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const axios = require('axios');
var fs = require('fs'),

SAMPLE_RATE = 16000
CHUNK_SIZE = 640
Threshold = 10
TIMEOUT_LENGTH = 0.5 //The silent length we allow before cutting recognition
DTMF_TIMEOUT_LENGTH = 1 //The silent length we allow before we process the DTMF
SHORT_NORMALIZE = (1.0/32768.0)
swidth = 2

DEEPGRAM_URL = "https://api.deepgram.com/v1/speak?encoding=linear16&model=aura-asteria-en&sample_rate="+SAMPLE_RATE
DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY

DEEPGRAM_HEADERS = {
  "Authorization": `Token ${DEEPGRAM_API_KEY}`,
  "Content-Type": "application/json"
}

//Create a Deepgram client using the API key
const deepgram = createClient(DEEPGRAM_API_KEY);


//handle your Deepgram trancripts here
var transcriptHandler = (data) => {
  var sentence = data.channel.alternatives[0].transcript
  if (data.is_final){
    if (sentence.length<1) return ""
    console.log("Speaker:",sentence);  
  }
}

function speak(text, extra_audio = null) {
  return new Promise(resolve => {
    const payload = {
      text: text
    };

    axios.post(DEEPGRAM_URL, payload,{
      responseType: 'stream',
      headers: DEEPGRAM_HEADERS,
    })
    .then(response => {
      var rec = []
      response.data.on('data', (chunk) => {
        rec.push(chunk);
      });
    
      response.data.on('end', () => {
        if(extra_audio) rec.push(extra_audio)
        resolve(Buffer.concat(rec))
      });
    
    }); 
  });
}

async function stream_audio(ws, audio) {
  //When Devs can't name variables
  i = 0
  //send Ding
  //Chunk out the output audio in 640 bytes and send to socket

  while (i <= audio.length) {
    try{
      chunk = audio.slice(i, i + CHUNK_SIZE);
      await ws.send(chunk)
      i += CHUNK_SIZE
    }catch(error){
      console.log("error")
      console.log(error)
    }
    
  }
}

function rms(frame) { //Root mean Square: a function to check if the audio is silent. Commonly used in Audio stuff
  count = frame.byteLength / swidth
  //unpack a frame into individual Decimal Value
  shorts = new Int16Array(frame.buffer, frame.byteOffset, frame.length / Int16Array.BYTES_PER_ELEMENT)
  sum_squares = 0.0
  for (const sample of shorts) {
    n = sample * SHORT_NORMALIZE //get the level of a sample and normalize it a bit (increase levels)
    sum_squares += n * n //get square of level
  }
  rms_val = Math.pow(sum_squares / count, 0.5) //summ all levels and get mean
  //console.log(rms_val*10);
  return rms_val * 1000 //raise value a bit so it's easy to read 
}

module.exports = {
  process_audio: async (ws, session_id, intent_handler)=> {
    var rec = [];
    var current = 1;
    var end = 0;
    uuid = ''

    //DTMF
    dtmf_stack = new Array()
    dtmf_current = 1
    dtmf_end = 0
    dtmf_received = null
    
    //do not start until deepgram is running
    var deepgram_started = false;

    // STEP 2: Create a live transcription connection
    const connection = deepgram.listen.live({
      model:"nova-2",
      punctuate:true,
      language:"en-US", //en-US. ja-JP
      encoding:"linear16",
      channels:1,
      sample_rate:SAMPLE_RATE,
      // To get UtteranceEnd, the following must be set:
      interim_results:true,
      utterance_end_ms:"1000",
      vad_events: true,
      smart_format: true,
    });


    // STEP 3: Listen for events from the live transcription connection
    connection.on(LiveTranscriptionEvents.Open, () => {
      deepgram_started = true;
      connection.keepAlive()
      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("Connection closed.");
      });

      connection.on(LiveTranscriptionEvents.Transcript, transcriptHandler);

      connection.on(LiveTranscriptionEvents.Metadata, (data) => {
        console.log(data);
      });

      connection.on(LiveTranscriptionEvents.Error, (err) => {
        console.error(err);
      });
    });

    //function to to check until deepgram has strted
    async function waitDeepgramStart() {
      return new Promise(resolve => {
        let timerId = setInterval(checkState, 1000);
        function checkState() {
          if (deepgram_started == true) {
            clearInterval(timerId);
            resolve(deepgram_started);
          }
        }
      });
    }

    //send out greetings
    var audio_to_send = await speak("This is a Deepgram Speech to Text and Text to Speech with Voice Echo demo. Please speak after the ding.",ding())
    await stream_audio(ws, audio_to_send)
    
    ws.on('message', async function message(received) {
      connection.keepAlive() //deepgram keepalive

      //if deepgram hasn't started yet, then do nothing
      if( !(await waitDeepgramStart())) return;

      rms_val = 0;
      var audio = received;
      if(Object.prototype.toString.call(received)){
        
        if(received.toString().includes("event")){
          data = JSON.parse(received.toString())
          if(data["event"] == "websocket:connected"){
            uuid = data["uuid"]
          }
          else if(data["event"] == "websocket:dtmf"){
            dtmf_received = data["digit"].replace("#","hash key").replace("*","star");
            console.log("DTMF_RECEIVED", dtmf_received)
          } 
        }
        else rms_val = rms(audio);
      }

      if(rms_val > Threshold &&  !(current <= end)){
          console.log("Heard Something")
          current = (Date.now() / 1000);
          end = (Date.now() / 1000) + TIMEOUT_LENGTH
      }

      if(current <= end){ 
        if(rms_val >= Threshold) end = (Date.now() / 1000) + TIMEOUT_LENGTH
        current = (Date.now() / 1000);
        connection.send(audio)
        rec.push(audio);
      }

      else{
        if (rec.length > 0){
          var output_audio = Buffer.concat(rec)
          rec = [];
          output_audio = await speak("I heard you say...", output_audio)
          stream_audio(ws, output_audio)
          
        } 
      }

      //This parts handles DTMF input from users
      //If there is a DTMF input, set the current dtmf timeout to now and dtmf end timeout to now + DTMF_TIMEOUT_LENGTH
      //This will start the next part that stores the DTMF until no input is detected
      if(dtmf_received &&  !(dtmf_current <= dtmf_end)){
          dtmf_current = (Date.now() / 1000);
          dtmf_end = (Date.now() / 1000) + DTMF_TIMEOUT_LENGTH
      }

      if(dtmf_current <= dtmf_end){
        if(dtmf_received){
          dtmf_end = (Date.now() / 1000) + DTMF_TIMEOUT_LENGTH;
          dtmf_stack.push(dtmf_received)
        }
        dtmf_current = (Date.now() / 1000);
        dtmf_received = null;
      }

      else{
        if (dtmf_stack.length > 0){
          console.log("DTMF STACK",dtmf_stack)
          dtmf = dtmf_stack.join(", ")
          dtmf_stack = [];
          console.log("DTMF",dtmf)
          var output_audio = await speak("You put in, " + dtmf)
          stream_audio(ws, output_audio)
        } 
      }

    });
  }
  
};

//gets the DING buffer
var ding = () => {
  return fs.readFileSync('./ding.wav');
}