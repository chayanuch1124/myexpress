// index.js
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

// ตั้งค่าจาก LINE Developers Console
const config = {
  channelAccessToken: 'qlMGe6PrkUn/jVS362bpSFcZRhFz9jPKV13RHebiOx7gmpX6kTdHsw/6vXGCZKevQlMzwnFszLZsNjvQNO/nxTUMw9is8GXxr3LyAXDVmAFgHqhjqqwLCrBs9nD+s7yQ5BjL4NHnuAKUFiSotEYROAdB04t89/1O/w1cDnyilFU=',
  channelSecret: 'cc27dd71455bf408d944c949fe6cf028'
};

app.use('/webhook', line.middleware(config));

//รับขWebhook
app.post('/webhook', (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result));
});

// ตอบกลับข้อความ
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `คุณพิมพ์ว่า: ${event.message.text}`
      }
    ]
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
