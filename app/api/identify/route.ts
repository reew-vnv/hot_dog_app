import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { FREE_LIMIT, getPhotoCount, incrementPhotoCount, isPaid } from "@/lib/kv";

export const runtime = "nodejs";
export const maxDuration = 30;

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an image classifier with one job: decide whether the user's photo contains a croissant.

Any croissant variant counts as a croissant: plain butter, almond, pain au chocolat, ham & cheese, savory, mini, etc. The crescent or curl shape is not required — laminated viennoiserie pastries (rectangular pains au chocolat, almond croissants, etc.) all count.

Respond with ONLY a single line of JSON, no markdown, no prose:
{"isCroissant": true, "label": "almond croissant"}
or
{"isCroissant": false, "label": "banana"}

The "label" is your best 1-3 word guess of what's actually in the photo. If you can't tell (blurry, dark, no clear subject), return {"isCroissant": false, "label": "unclear"}.`;

type IdentifyResponse =
  | { success: true; isCroissant: boolean; label: string; count: number }
  | { success: false; error: string; paywall?: true; count?: number };

function parseDataUrl(input: string): { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } | null {
  const match = input.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!match) return null;
  return { mediaType: match[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: match[2] };
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ success: false, error: "Sign in required" } satisfies IdentifyResponse, { status: 401 });
  }

  let body: { image?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body" } satisfies IdentifyResponse, { status: 400 });
  }

  if (typeof body.image !== "string" || body.image.length < 100) {
    return Response.json({ success: false, error: "Missing or invalid 'image' field" } satisfies IdentifyResponse, { status: 400 });
  }

  const parsed = parseDataUrl(body.image);
  if (!parsed) {
    return Response.json(
      { success: false, error: "Image must be a base64 data URL (image/jpeg, png, webp, or gif)" } satisfies IdentifyResponse,
      { status: 400 },
    );
  }

  const [count, paid] = await Promise.all([
    getPhotoCount(session.user.email),
    isPaid(session.user.email),
  ]);
  if (!paid && count >= FREE_LIMIT) {
    return Response.json(
      { success: false, error: "Free limit reached", paywall: true, count } satisfies IdentifyResponse,
      { status: 402 },
    );
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
            },
            { type: "text", text: "Is this a croissant?" },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ success: false, error: "Model returned no text" } satisfies IdentifyResponse, { status: 502 });
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ success: false, error: "Model response was not JSON" } satisfies IdentifyResponse, { status: 502 });
    }

    const result = JSON.parse(jsonMatch[0]) as { isCroissant?: unknown; label?: unknown };
    if (typeof result.isCroissant !== "boolean" || typeof result.label !== "string") {
      return Response.json({ success: false, error: "Model response had unexpected shape" } satisfies IdentifyResponse, { status: 502 });
    }

    const newCount = await incrementPhotoCount(session.user.email);

    return Response.json({ success: true, isCroissant: result.isCroissant, label: result.label, count: newCount } satisfies IdentifyResponse);
  } catch (error) {
    console.error("identify error:", error);
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ success: false, error: "ANTHROPIC_API_KEY missing or invalid" } satisfies IdentifyResponse, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ success: false, error: "Rate limited — try again in a moment" } satisfies IdentifyResponse, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ success: false, error: `Anthropic API error: ${error.message}` } satisfies IdentifyResponse, { status: 502 });
    }
    return Response.json({ success: false, error: "Unexpected server error" } satisfies IdentifyResponse, { status: 500 });
  }
}
