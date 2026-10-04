import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { BadGatewayError } from 'src/model/error';

// Required, with no hard-coded default: the id is pinned on the stack
// (template.yaml) so that changing models is a parameter change, and a
// fallback here would quietly undo that -- a run without the variable
// would use some other model than prod while looking fine. Which model
// and why is documented beside the parameter, not here, so there is one
// place to read and one place to edit.
const model = () => process.env.GEMINI_MODEL;

// MEDIUM (the model default) rather than LOW: one question's worth of
// transcription has room inside API Gateway's 29s cut-off, so the budget
// is better spent on getting MathJax, tables and option layout right than
// on latency that nobody is waiting on.
//
// This is also what replaced `temperature: 0`: the whole Gemini 3.x
// family ignores temperature/top_p/top_k at the backend, so setting them
// bought nothing.
const THINKING_LEVEL = ThinkingLevel.MEDIUM;

// Set GEMINI_FALLBACK_MODEL to send the final attempt to a different
// model. 503 is per-model capacity, so re-asking the model that just
// refused is the weakest retry available -- a second model is a much
// better bet. Left unset by default because only the operator knows
// which ids this key is actually served.
const fallbackModel = () => process.env.GEMINI_FALLBACK_MODEL;

// API Gateway severs the connection at 29s and the Lambda dies at 30, so
// retries have to fit in what is left once the handler's own DB work is
// paid for. The deadline, not the attempt count, is what really stops the
// loop: a refusal returns in 3-5s but a slow success can take far longer,
// and overrunning would turn a recoverable 503 into a 504 with no body.
const RETRY_DEADLINE_MS = 23_000;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 400;

// 503 UNAVAILABLE is what an overloaded model returns and is the case
// this retry exists for; 429 is a throttled key and 500/502/504 are
// transient faults. Anything else -- 400 malformed request, 403 bad key,
// 404 unknown model -- fails identically however often it is sent, so it
// propagates immediately instead of burning the budget.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// Pulled out of the generic failure path because this is the shape a
// model retirement takes: the id stops resolving and every call 404s
// forever. Reported as its own code so the admin is told the
// configuration is stale, instead of being invited to "try again" at a
// model that is never coming back.
const MODEL_NOT_FOUND_STATUS = 404;

/** The SDK hangs the HTTP status off the ApiError it throws. */
const statusOf = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' ? status : undefined;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Full jitter rather than plain exponential: several admins hitting the
// same capacity dip would otherwise retry in lockstep and re-create it.
const backoffFor = (attempt: number) =>
  Math.round(BASE_BACKOFF_MS * 2 ** (attempt - 1) * (0.5 + Math.random()));

export type InlineImage = {
  mimeType: string;
  /** Raw base64, no `data:` prefix. */
  data: string;
};

/**
 * Multimodal call that asks for a JSON document back, retried while the
 * provider says it is busy.
 *
 * The retry is not belt-and-braces: the configured flash model refuses
 * with 503 often enough that a single attempt fails most of the time,
 * while succeeding often enough that another attempt usually lands. The
 * loop is bounded by a wall-clock deadline because it sits inside an
 * API Gateway request, not a background job.
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

  const primaryModel = model();
  if (primaryModel === undefined || primaryModel === '')
    throw new BadGatewayError('GEMINI_MODEL is not configured', 'AI_NOT_CONFIGURED');

  const ai = new GoogleGenAI({ apiKey });

  const startedAt = Date.now();
  const primary = primaryModel;
  const fallback = fallbackModel();

  let response;
  for (let attempt = 1; ; attempt++) {
    // The last attempt goes to the fallback model when one is set -- by
    // then the primary has already refused at least once.
    const useModel =
      attempt === MAX_ATTEMPTS && fallback !== undefined && fallback !== '' ? fallback : primary;
    const attemptStartedAt = Date.now();
    try {
      response = await ai.models.generateContent({
        model: useModel,
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
      // Logged on every attempt, not just retries, so the per-model
      // outcome counts are complete: with a fallback in play, a
      // request-level success rate no longer says anything about how
      // often the *primary* model refuses. One line per attempt tagged
      // with its model is what makes that still countable.
      console.log(
        `Gemini generateContent ok (model=${useModel} attempt=${attempt} elapsedMs=${Date.now() - startedAt})`
      );
      break;
    } catch (error) {
      const status = statusOf(error);
      // An undefined status is a transport-level failure (DNS, reset,
      // timeout) far more often than a bug, so it is treated as worth
      // one more try.
      const retryable = status === undefined || RETRYABLE_STATUSES.has(status);
      const backoff = backoffFor(attempt);
      // Budget for another attempt as slow as this one was, so a retry
      // is never started that cannot finish before the gateway gives up.
      const projected = Date.now() - startedAt + backoff + (Date.now() - attemptStartedAt);
      const outOfBudget = projected >= RETRY_DEADLINE_MS;

      if (!retryable || attempt >= MAX_ATTEMPTS || outOfBudget) {
        console.error(
          `Gemini generateContent failed (model=${useModel} attempt=${attempt} status=${status ?? 'none'} retryable=${retryable} outOfBudget=${outOfBudget} elapsedMs=${Date.now() - startedAt})`,
          error
        );
        // Worth distinguishing: a provider that was busy for the whole
        // budget should tell the admin to try again, not imply their
        // screenshot was at fault.
        if (status === MODEL_NOT_FOUND_STATUS)
          throw new BadGatewayError(`AI model ${useModel} not found`, 'AI_MODEL_NOT_FOUND');
        if (retryable) throw new BadGatewayError('AI provider is unavailable', 'AI_UNAVAILABLE');
        throw new BadGatewayError('AI request failed', 'AI_REQUEST_FAILED');
      }

      console.warn(
        `Gemini generateContent retrying (model=${useModel} attempt=${attempt} status=${status ?? 'none'} backoffMs=${backoff})`
      );
      await sleep(backoff);
    }
  }

  // `.text` concatenates every non-thought text part, unlike the legacy
  // PreviewService's `parts[0].text` -- on a thinking model the first
  // part can be a thought summary rather than the answer.
  const text = response.text;
  if (text === undefined || text.trim() === '')
    throw new BadGatewayError('AI returned an empty response', 'AI_EMPTY_RESPONSE');

  return text;
};
