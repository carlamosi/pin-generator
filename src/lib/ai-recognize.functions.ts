import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// NOTE: when AI recognition is re-enabled/revisited, the prompt MUST explicitly
// request Spanish names for both `city` and `country` (e.g. "Japón" not
// "Japan", "Nueva York" not "New York"). The `country` value must match one of
// the names in `src/lib/countries-es.ts` so the País combobox accepts it as-is;
// if the model returns an English or local-language name, map it to the
// Spanish canonical form before returning.


const Input = z.object({
  imageDataUrl: z.string().min(20),
});

export const recognizePin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { ok: false as const, error: "missing_key" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "Eres un experto en pins turísticos y de colección. Analiza la imagen del pin recortado (sin fondo) e identifica la ciudad y país que representa. Responde ÚNICAMENTE con JSON válido, sin prosa ni markdown. Formato exacto: {\"city\": string|null, \"country\": string|null, \"country_code\": string|null, \"confidence\": \"high\"|\"low\"}. country_code debe ser ISO 3166-1 alpha-2 (ej: ES, FR, US). Si no estás seguro, usa null y confidence \"low\". Nunca inventes datos.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Identifica este pin turístico." },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
        }),
      });

      clearTimeout(timer);

      if (!res.ok) {
        return { ok: false as const, error: `status_${res.status}` };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return { ok: false as const, error: "no_json" };

      const parsed = JSON.parse(match[0]) as {
        city: string | null;
        country: string | null;
        country_code: string | null;
        confidence: "high" | "low";
      };

      const clean = (v: unknown) =>
        typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null"
          ? v.trim()
          : null;

      const confidence = parsed.confidence === "high" ? "high" : "low";
      const result =
        confidence === "low"
          ? { city: null, country: null, country_code: null, confidence }
          : {
              city: clean(parsed.city),
              country: clean(parsed.country),
              country_code: clean(parsed.country_code)?.toUpperCase() ?? null,
              confidence,
            };

      return { ok: true as const, result };
    } catch (e) {
      clearTimeout(timer);
      return { ok: false as const, error: e instanceof Error ? e.message : "unknown" };
    }
  });
