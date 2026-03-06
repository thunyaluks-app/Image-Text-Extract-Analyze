import { GoogleGenAI, Chat } from "@google/genai";

// Utility function to convert a File object to a base64 encoded string part for the API.
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // The result includes the data URL prefix (e.g., "data:image/jpeg;base64,"), which needs to be removed.
      const base64Data = (reader.result as string).split(',')[1];
      resolve(base64Data);
    };
    reader.readAsDataURL(file);
  });
  const base64EncodedData = await base64EncodedDataPromise;
  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: file.type,
    },
  };
};

export const analyzeImage = async (imageFile: File, apiKey: string, model: string = 'gemini-2.5-flash'): Promise<string> => {
    if (!apiKey) {
        throw new Error("API Key is missing. Please provide a valid API key.");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    const imagePart = await fileToGenerativePart(imageFile);
    const textPart = {
        text: "วิเคราะห์ภาพนี้และดึงข้อความและตัวเลขทั้งหมดที่มองเห็นออกมา นำเสนอข้อมูลที่ดึงออกมาอย่างชัดเจนและถูกต้อง"
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [imagePart, textPart] },
        });
        return response.text;
    } catch (error) {
        console.error("Error analyzing image with Gemini:", error);
        if (error instanceof Error) {
            throw new Error(`เกิดข้อผิดพลาดในการวิเคราะห์ภาพ: ${error.message}`);
        }
        throw new Error("เกิดข้อผิดพลาดที่ไม่รู้จักในการวิเคราะห์ภาพ");
    }
};

export const analyzeTextAndStartChat = async (text: string, apiKey: string, model: string = 'gemini-2.5-pro', imageFile: File | null = null): Promise<{ chat: Chat, initialResponse: string }> => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please provide a valid API key.");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const chat = ai.chats.create({
    model: model,
    config: {
      systemInstruction: "คุณคือผู้เชี่ยวชาญด้านการวิเคราะห์ข้อมูลและรูปภาพ คุณจะได้รับข้อมูลที่ดึงมาจากรูปภาพ และตัวรูปภาพเอง (ถ้ามี) หน้าที่ของคุณคือวิเคราะห์ข้อมูลเหล่านี้อย่างละเอียด ตอบคำถามของผู้ใช้อย่างแม่นยำโดยอ้างอิงจากทั้งข้อความและรูปภาพที่เห็น",
    }
  });

  const promptParts: any[] = [
    { text: `นี่คือข้อมูลที่ดึงมาจากรูปภาพ:\n\n${text}\n\nกรุณาวิเคราะห์ข้อมูลนี้และรูปภาพที่แนบมา (ถ้ามี) เพื่อให้คำแนะนำเบื้องต้นแก่ผู้ใช้` }
  ];

  if (imageFile) {
    const imagePart = await fileToGenerativePart(imageFile);
    promptParts.push(imagePart);
  }

  try {
    const response = await chat.sendMessage({ message: promptParts });
    return { chat, initialResponse: response.text };
  } catch (error) {
    console.error("Error starting chat and analyzing text:", error);
    if (error instanceof Error) {
      throw new Error(`เกิดข้อผิดพลาดในการวิเคราะห์ข้อความ: ${error.message}`);
    }
    throw new Error("เกิดข้อผิดพลาดที่ไม่รู้จักในการวิเคราะห์ข้อความ");
  }
};

export const continueChat = async (chat: Chat, message: string): Promise<string> => {
  try {
    const response = await chat.sendMessage({ message });
    return response.text;
  } catch (error) {
    console.error("Error continuing chat:", error);
    if (error instanceof Error) {
      throw new Error(`เกิดข้อผิดพลาดในการส่งข้อความ: ${error.message}`);
    }
    throw new Error("เกิดข้อผิดพลาดที่ไม่รู้จักในการส่งข้อความ");
  }
};

export const generateFilenameFromText = async (textContent: string, apiKey: string, model: string = 'gemini-2.5-flash'): Promise<string> => {
    if (!apiKey) {
        throw new Error("API Key is missing. Please provide a valid API key.");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    const prompt = `จากข้อความต่อไปนี้ ให้สร้างชื่อไฟล์ที่สั้น กระชับ และสื่อความหมาย (ไม่เกิน 5 คำ) สำหรับบันทึกเป็นไฟล์ .txt: "${textContent.substring(0, 500)}..."
    
    กฎการตั้งชื่อไฟล์:
    1. ใช้ตัวอักษรภาษาอังกฤษหรือภาษาไทย
    2. แทนที่ช่องว่างด้วยขีดกลาง (-)
    3. ห้ามใช้อักขระพิเศษที่ใช้ในชื่อไฟล์ไม่ได้ (เช่น / \\ : * ? " < > |)
    4. ไม่ต้องใส่นามสกุลไฟล์ (.txt)
    5. ตอบกลับมาเฉพาะชื่อไฟล์เท่านั้น`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });
        
        let filename = response.text.trim();
        // Sanitize the response to ensure it's a valid filename component
        filename = filename.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9ก-๙_-]/g, '');
        
        return filename || "untitled-analysis";

    } catch (error) {
        console.error("Error generating filename with Gemini:", error);
        return "gemini-analysis-result";
    }
};