import { GoogleGenAI } from '@google/genai';
import { Category, WardrobeItem } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Using flash for faster vision responses
const MODEL_NAME = 'gemini-2.5-flash';

export interface ParsedItem {
  name: string;
  category: Category | string;
  color: string;
  styleTags: string[];
  box: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

export async function enhanceClothingImage(base64DataUrl: string, category: string, name: string): Promise<string> {
  try {
    const matches = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 image data");
    }
    const [, mimeType, base64Data] = matches;
    
    const editPrompt = `这是一件${category}（${name}）。请执行高精度抠图（Background Removal），将原图中的这件物品原封不动地提取出来。必须 100% 忠实保留原图中物品的真实褶皱、轮廓、材质、颜色和光影，绝对禁止对物品本身进行失真、替换或AI幻想重绘！只消除原本的环境杂物和人物肢体，并将提取出的主体直接放置在纯净无瑕的纯白背景（#FFFFFF）上。保持原始摆放视角和外观。`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: editPrompt,
          },
        ],
      },
    });

    let newImageBase64 = null;
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        newImageBase64 = `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
        break;
      }
    }

    return newImageBase64 || base64DataUrl;
  } catch (error: any) {
    console.warn("Could not enhance image via AI, falling back to original", error);
    if (error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("quota")) {
        console.warn("Quota exceeded, skipping background removal.");
    }
    return base64DataUrl; 
  }
}

export async function detectFaceInImage(imageB64: string): Promise<boolean> {
  try {
    const matches = imageB64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 image data");
    }
    const [, mimeType, base64Data] = matches;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          { text: "Analyze this image. Is there a clearly visible human face in it? Reply strictly and only with 'YES' or 'NO'." }
        ]
      }
    });

    const text = response.text?.trim().toUpperCase() || "";
    return text.includes("YES");
  } catch (error: any) {
    console.error("Face detection error:", error);
    if (error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("quota")) {
       throw new Error("AI 服务的请求次数已超限，请稍等片刻再试。");
    }
    // Default to true if the model couldn't parse the face check properly
    // but not blocking a potential valid image due to internal error instead of "NO"
    return true; 
  }
}

export async function processSingleItemImage(base64DataUrl: string): Promise<string> {
  try {
    const matches = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 image data");
    }
    const [, mimeType, base64Data] = matches;
    
    const editPrompt = `请执行高精度抠图（Background Removal），将原图中的这件服饰/物品原封不动地提取出来。必须 100% 忠实保留原图中物品的真实褶皱、轮廓、材质、颜色和光影。消除原本的环境杂物和人物肢体，并将提取出的主体直接放置在纯净无瑕的纯白背景（#FFFFFF）上。打上明亮、均匀的影棚灯光，保持原始摆放视角和外观。如果不确定是什么，请尽量提取视野中最核心的物品。`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: editPrompt,
          },
        ],
      },
    });

    let newImageBase64 = null;
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        newImageBase64 = `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
        break;
      }
    }

    return newImageBase64 || base64DataUrl;
  } catch (error: any) {
    console.warn("Could not process single item via AI, falling back to original", error);
    return base64DataUrl; 
  }
}

export async function analyzeSingleClothingItem(base64DataUrl: string): Promise<ParsedItem> {
  try {
    // Extract base64 part and mime type
    const matches = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 image data");
    }
    const [, mimeType, base64Data] = matches;

    const prompt = `
    你是一个专业的时尚单品识别助手。
    请识别出图片中主要展示的一件单品（包括但不限于帽子、上装、下装、连衣裙、袜子、鞋子、包包、配饰等）。
    请仅以JSON格式输出，不要包含任何Markdown标记（例如 \`\`\`json ）。
    返回的JSON必须严格遵循以下结构格式：
    {
      "name": "物品名称（简短描述，如：复古方领碎花裙，白色棒球帽，运动长袜等）",
      "category": "类别，必须是以下之一：'上装', '下装', '连衣裙', '鞋子', '包包', '配饰'",
      "color": "主要颜色分类（如：白色、浅蓝色、卡其色等）",
      "styleTags": ["词语1", "词语2"], // 1-3个形容风格的词语
      "box": [0, 0, 1000, 1000] // 默认全图
    }
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        { text: prompt },
        { inlineData: { mimeType, data: base64Data } }
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const responseText = response.text || "{}";
    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanText);
    
    return {
      name: result.name || '未知单品',
      category: result.category || '配饰',
      color: result.color || '未知颜色',
      styleTags: Array.isArray(result.styleTags) ? result.styleTags : [],
      box: [0, 0, 1000, 1000]
    };
  } catch (error: any) {
    console.error("Error analyzing clothing image:", error);
    if (error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("quota")) {
       throw new Error("AI 服务的请求次数已超限，请稍等片刻再试。");
    }
    throw new Error("无法识别衣物，请重试");
  }
}

export async function generateOutfit(
  wardrobe: WardrobeItem[], 
  scenario: string, 
  weather: string,
  recentlyWornItemIds: string[] = []
): Promise<{ title: string, description: string, itemIds: string[], score?: number }> {
  try {
    if (wardrobe.length === 0) {
      throw new Error("你的衣柜还是空的哦");
    }

    // Prepare wardrobe data for the prompt (stripping large image strings)
    const wardrobeMin = wardrobe.map(w => ({
      id: w.id,
      name: w.name,
      category: w.category,
      color: w.color,
      styleTags: w.styleTags
    }));

    let historyPromptInfo = "";
    if (recentlyWornItemIds.length > 0) {
      const uniqueWorn = Array.from(new Set(recentlyWornItemIds));
      historyPromptInfo = `\n    注意：用户近期（包含今天）已经穿戴过以下衣服ID：[${uniqueWorn.join(", ")}]。为了保证每天的穿衣新鲜感，请尽可能**避免**再次选中这些已被穿过的衣服，去挑选衣柜中别的合适衣物。如果衣柜里确实没有其他合适的替代品，再考虑从里面挑选百搭的基础款。`;
    }

    const prompt = `
    你是一个专业的穿搭造型师。请为用户搭配一套穿搭。
    用户当前的衣柜单品如下（JSON格式）：
    ${JSON.stringify(wardrobeMin, null, 2)}
    
    用户的出行场景要求：
    场合/场景：${scenario}
    天气情况：${weather}${historyPromptInfo}

    请挑选最合适的几件单品（通常是上装+下装，或者连衣裙，加上配饰/包包/鞋子，也可以视情况加减）。
    请仅以JSON格式输出，不要包含任何Markdown标记（例如 \`\`\`json ）。
    返回的JSON必须严格遵循以下结构：
    {
      "title": "搭配的主题名称（如：春日出游甜美风）",
      "description": "搭配思路（为什么这么搭，以及一些穿着建议。并在最后加上给出评分的依据。请保持非常简短，总字数绝对不要超过100字！！！语气请务必幽默搞笑）",
      "score": 95, // 穿搭打分，满分100分。综合考虑衣服和场景、天气的匹配程度，以及整体造型的美感。
      "itemIds": ["id1", "id2"] // 被选中单品的 id 数组
    }
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const responseText = response.text || "{}";
    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanText);

    return {
      title: result.title || '推荐穿搭',
      description: result.description || '这是为你推荐的搭配。',
      score: result.score,
      itemIds: Array.isArray(result.itemIds) ? result.itemIds : []
    };
  } catch (error: any) {
    console.error("Error generating outfit:", error);
    if (error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("quota")) {
       throw new Error("AI 服务的请求次数已超限或过于频繁，请稍等片刻再试，这通常是一时的高峰拥堵。");
    }
    throw new Error("搭配生成失败，请重试");
  }
}

export async function generateFaceSwap(
  baseModelImageB64: string,
  userFaceImageB64: string
): Promise<string> {
  try {
    const baseMatches = baseModelImageB64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!baseMatches || baseMatches.length !== 3) {
      throw new Error("Invalid base model base64 image data");
    }
    const [, baseMimeType, baseData] = baseMatches;

    const userMatches = userFaceImageB64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!userMatches || userMatches.length !== 3) {
      throw new Error("Invalid user face base64 image data");
    }
    const [, userMimeType, userData] = userMatches;

    const faceSwapPrompt = `这是两张模特的参考照片。图1是正在展示服装的源模特，图2是想要参考的面容特征。
请对图1的模特执行高精度的面容适配调整，生成一张全新的模特展示图：
1. 参考图2中人物的五官特征。
2. 修改图1（原图）中模特的五官，使其长相与图2的人物一致，但必须完全保留图1原本的发型、头发颜色和边缘轮廓。
3. 维持图1中人物完全相同的头部和身体比例，匹配原始头部大小。
4. 将模特的脸部角度微调至面向正前方，目光直视前方。
5. 精准调色：调整面部肤色及环境光照，使其彻底融入图1的场景，必须与图中四肢的冷白肤色严密统一。
6. 最后也是最重要的一点：图1的服装搭配、身体姿势、四肢动作、背景画面绝对不可更改。`;

    const parts: any[] = [
      {
        inlineData: {
          data: baseData,
          mimeType: baseMimeType,
        },
      },
      {
        inlineData: {
          data: userData,
          mimeType: userMimeType,
        },
      },
      { text: faceSwapPrompt }
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: parts as any,
      },
    });

    let newImageBase64 = null;
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        newImageBase64 = `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!newImageBase64) {
      throw new Error("模型未返回图像数据");
    }
    
    return newImageBase64;
  } catch (error: any) {
    console.error("Face Swap error:", error);
    if (error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("quota")) {
       throw new Error("换脸生成失败：AI 服务的请求次数已超限，请稍等片刻再试。");
    }
    throw new Error("换脸生成失败: " + (error?.message || JSON.stringify(error)));
  }
}

export async function generateVirtualTryOn(
  baseModelImageB64: string,
  outfitDescription: string,
  garmentImagesB64: string[] = []
): Promise<string> {
  try {
    const matches = baseModelImageB64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 image data");
    }
    const [, mimeType, base64Data] = matches;

    const editPrompt = `请精准生成原模特穿上附件中衣物和配饰之后的照片。`;

    const parts: any[] = [
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
    ];

    // Append garment images as reference parts
    for (const garmentB64 of garmentImagesB64) {
      const gMatch = garmentB64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (gMatch && gMatch.length === 3) {
        parts.push({
          inlineData: {
            mimeType: gMatch[1],
            data: gMatch[2]
          }
        });
      }
    }

    // Append the text prompt instruction at the end
    parts.push({ text: editPrompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: parts as any,
      },
    });

    let newImageBase64 = null;
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        newImageBase64 = `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!newImageBase64) {
      throw new Error("模型未返回图像数据");
    }
    
    return newImageBase64;
  } catch (error: any) {
    console.error("Virtual Try-On error:", error);
    if (error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("quota")) {
       throw new Error("试穿效果生成失败：AI 服务的请求次数已超限，请稍等片刻再试。");
    }
    throw new Error("试穿效果生成失败");
  }
}
