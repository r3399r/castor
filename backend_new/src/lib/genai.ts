import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { BadGatewayError } from 'src/model/error';

// A GA model rather than the gemini-3-flash-preview the legacy backend's
// PreviewService pins: previews get retired (gemini-3-pro-preview already
// has been), and this one is on the request path of an admin workflow.
// 3.6 is the flash tier Google describes as balancing speed against
// multimodal capability -- 3.7/3.8 are tuned for long-horizon coding,
// which is not what reading an exam paper needs.
const model = () => process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';

// MEDIUM (the model default) rather than LOW: one question's worth of
// transcription has room inside API Gateway's 29s cut-off, so the budget
// is better spent on getting MathJax, tables and option layout right than
// on latency that nobody is waiting on.
//
// This is also what replaced `temperature: 0`: the whole Gemini 3.x
// family ignores temperature/top_p/top_k at the backend, so setting them
// bought nothing.
const THINKING_LEVEL = ThinkingLevel.MEDIUM;

export type InlineImage = {
  mimeType: string;
  /** Raw base64, no `data:` prefix. */
  data: string;
};

/**
 * One-shot multimodal call that asks for a JSON document back.
 *
 * `responseJsonSchema` is what actually constrains the reply's shape --
 * `responseMimeType` alone only guarantees *some* JSON, which is why the
 * caller still validates what comes back. Note the API requires the mime
 * type to be set alongside the schema, not instead of it.
 *
 * Kept free of any question-shaped knowledge (the schema is the caller's
 * to supply) so this stays a thin transport module.
 */
export const generateJsonFromImages = async (
  systemInstruction: string,
  prompt: string,
  images: InlineImage[],
  responseJsonSchema: unknown
): Promise<string> => {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (apiKey === undefined || apiKey === '')
    throw new BadGatewayError('GOOGLE_GENAI_API_KEY is not configured', 'AI_NOT_CONFIGURED');

  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: model(),
      contents: [
        ...images.map((image) => ({
          inlineData: { mimeType: image.mimeType, data: image.data },
        })),
        { text: prompt },
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema,
        thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      },
    });
  } catch (error) {
    console.error('Gemini generateContent failed', error);
    throw new BadGatewayError('AI request failed', 'AI_REQUEST_FAILED');
  }

  // `.text` concatenates every non-thought text part, unlike the legacy
  // PreviewService's `parts[0].text` -- on a thinking model the first
  // part can be a thought summary rather than the answer.
  const text = response.text;
  if (text === undefined || text.trim() === '')
    throw new BadGatewayError('AI returned an empty response', 'AI_EMPTY_RESPONSE');

  return text;
};
