// index.js
import express from 'express';
import * as line from '@line/bot-sdk';
import dotenv from 'dotenv';

dotenv.config();

// สร้าง Express app
const app = express();

// LINE Config สำหรับ middleware
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// สร้าง Messaging API Client (SDK รุ่นใหม่)
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// หน้าแรกสำหรับทดสอบ
app.get('/', (req, res) => {
  res.send('LINE Bot is running');
});

// ใช้ LINE middleware ตรวจสอบลายเซ็นและ parse body
app.use('/webhook', line.middleware(config));

// รับ Webhook จาก LINE
app.post('/webhook', async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error('Webhook Error:', err);
    res.status(500).end();
  }
});

// ฟังก์ชันจัดการ Event
async function handleEvent(event) {
  // รับเฉพาะข้อความ text
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  // ตอบกลับข้อความ
  return await client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `คุณพิมพ์ว่า: ${event.message.text}`,
      },
    ],
  });
}

// เริ่มต้น Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});