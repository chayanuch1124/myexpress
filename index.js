// index.js
import express from 'express';
import * as line from '@line/bot-sdk';
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// สร้าง Express app
const app = express();
// create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
  // process.env.SUPABASE_KEY
);

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY 
});

// LINE Config สำหรับ middleware
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// สร้าง Messaging API Client (SDK รุ่นใหม่)
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});
// 1. สร้าง Blob Client สำหรับดึงข้อมูลไฟล์โดยเฉพาะ (ของ v9+)
const lineBlobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
});

const downloadLineContent = async (messageId) => {
  const stream = await lineBlobClient.getMessageContent(messageId);
  const chunks = [];
 
  // รองรับทั้งแบบ Blob (มี arrayBuffer) และแบบ Stream
  if (stream.arrayBuffer) {
    const arrayBuffer = await stream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: stream.type || 'image/jpeg'
      },
      buffer: buffer
    };
  } else {
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: 'image/jpeg'
      },
      buffer: buffer
    };
  }
};


// หน้าแรกสำหรับทดสอบ
app.get('/', (req, res) => {
  res.send('hello world, Chayanuch Kullanitbaworndech');
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


// 4. ฟังก์ชันหลักในการจัดการ Event และบันทึกข้อมูล
async function handleEvent(event) {
  // รองรับเฉพาะ Message Event
  if (event.message.type === 'image') {
  return await handleImage(event);
}

  const userId = event.source.userId || 'unknown';
  const replyToken = event.replyToken || '';
  const messageId = event.message.id;
  const messageType = event.message.type;

  // =========================
  // กรณีส่งรูปภาพ
  // =========================
  if (event.message.type === 'image') {
    return await handleImage(event, userId, replyToken);
  }

  // =========================
  // กรณีข้อความ Text
  // =========================
  if (event.message.type === 'text') {
    const userText = event.message.text;

    try {
      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userText,
      });

      const botReplyText =
        geminiResponse.text || 'ขออภัยครับ ระบบไม่สามารถสร้างคำตอบได้';

      // บันทึกลง Supabase
      await supabase.from('messages').insert([
        {
          user_id: userId,
          message_id: messageId,
          type: messageType,
          content: userText,
          reply_token: replyToken,
          reply_content: botReplyText,
        },
      ]);

      // ตอบกลับ
      return await client.replyMessage({
        replyToken,
        messages: [
          {
            type: 'text',
            text: botReplyText,
          },
        ],
      });
    } catch (error) {
      console.error('Gemini Error:', error);
    }
  }

  return null;
}
async function handleImage(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const messageId = event.message.id;

  try {
    // ===============================
    // 1) ตอบกลับทันที
    // ===============================
    await client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'text',
          text: 'ส่งรูปภาพสำเร็จ กำลังวิเคราะห์ภาพ...',
        },
      ],
    });

    // ===============================
    // 2) ดาวน์โหลดรูปภาพ
    // ===============================
    const imageContent = await downloadLineContent(messageId);

    if (!imageContent || !imageContent.buffer) {
      throw new Error('ไม่สามารถดาวน์โหลดรูปภาพได้');
    }

    // ===============================
    // 3) อัปโหลดไป Supabase Storage
    // ===============================
    const fileName = `${messageId}.jpg`;

    const { error: uploadError } = await supabase
      .storage
      .from('uploads')
      .upload(`bot-uploads/${fileName}`, imageContent.buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    // ===============================
    // 4) วิเคราะห์รูปด้วย Gemini
    // ===============================
    const geminiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          text: 'ภาพนี้เป็นสัตว์ชนิดอะไร ถ้าไม่ใช่สัตว์ให้ตอบว่า "ไม่ใช่สัตว์" ตอบสั้น ๆ เป็นภาษาไทยเท่านั้น',
        },
        {
          inlineData: {
            data: imageContent.inlineData.data,
            mimeType: imageContent.inlineData.mimeType,
          },
        },
      ],
    });

    const animalName =
      geminiResponse.text?.trim() ||
      geminiResponse.outputText?.trim() ||
      'ไม่สามารถระบุชนิดสัตว์ได้';

    const resultText = `สัตว์ในภาพคือ: ${animalName}`;

    // ===============================
    // 5) บันทึกลง Supabase
    // ===============================
    await supabase.from('messages').insert([
      {
        user_id: userId,
        message_id: messageId,
        type: 'image',
        content: '[Image Uploaded]',
        reply_token: replyToken,
        reply_content: resultText,
      },
    ]);

    // ===============================
    // 6) ส่งผลลัพธ์ด้วย pushMessage
    // ===============================
    await client.pushMessage({
      to: userId,
      messages: [
        {
          type: 'text',
          text: resultText,
        },
      ],
    });

    return null;
  } catch (error) {
    console.error('Image Processing Error:', error);

    // หากตอบ reply ไปแล้ว ต้องใช้ pushMessage เท่านั้น
    try {
      await client.pushMessage({
        to: userId,
        messages: [
          {
            type: 'text',
            text: `เกิดข้อผิดพลาดในการประมวลผลภาพ\n${error.message}`,
          },
        ],
      });
    } catch (pushError) {
      console.error('Push Error:', pushError);
    }

    return null;
  }
}

// async function handleEvent2(event) {
//   // รับเฉพาะข้อความ text
//   if (event.type !== 'message' || event.message.type !== 'text') {
//     return null;
//   }

//   // ตอบกลับข้อความ
//   return await client.replyMessage({
//     replyToken: event.replyToken,
//     messages: [
//       {
//         type: 'text',
//         text: `คุณพิมพ์ว่า: ${event.message.text}`,
//       },
//     ],
//   });
// }

// เริ่มต้น Server
const PORT = process.env.PORT || 3010;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});