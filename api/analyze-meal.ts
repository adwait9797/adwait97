import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'

// Vercel serverless function: POST /api/analyze-meal
// Estimates calories/macros for a meal from a text description and/or a photo using
// Claude Haiku 4.5 (cheap + vision). The API key never leaves the server.

const MODEL = 'claude-haiku-4-5'
const MAX_TURNS = 8
const MAX_TEXT = 1000
const MAX_IMAGE_BASE64 = 2_500_000 // ~1.8 MB decoded; the app sends ~150 KB

const MealItem = z.object({
  name: z.string(),
  quantity: z.string(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
})

const MealEstimate = z.object({
  is_food: z.boolean(),
  reply: z.string(),
  meal_name: z.string(),
  items: z.array(MealItem),
  total: z.object({
    calories: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
  }),
  confidence: z.enum(['low', 'medium', 'high']),
})

const SYSTEM = `You are the nutrition assistant inside a gym-buddies tracking app. The user describes a meal in text and/or sends a photo of it, and you estimate its calories and macros.

Guidelines:
- Identify each food item and estimate a realistic portion. If the user gives quantities, use them exactly.
- Users live in different countries; recognise regional dishes (e.g. Indian, European, East Asian) and use typical home or restaurant portions for that dish.
- When the user corrects you ("it was 2 rotis", "no sauce", "that was a half portion"), update the previous estimate instead of starting over.
- Round calories to the nearest 5 and grams to whole numbers. "total" must equal the sum of the items.
- "reply" is one or two short, friendly sentences for the chat bubble: say what you counted and mention the biggest assumption so the user can correct it. No markdown.
- "meal_name" is a short title such as "Chicken rice bowl".
- If the message or photo is not food, set is_food to false, items to [], totals to 0, and use reply to ask for a meal.
- Set confidence to "low" when the portion or dish is genuinely unclear.`

interface Turn {
  role: 'user' | 'assistant'
  text: string
  image?: string
}

function parseTurns(body: unknown): Turn[] | null {
  const turns = (body as { turns?: unknown })?.turns
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > MAX_TURNS) return null
  const out: Turn[] = []
  for (const t of turns) {
    if (!t || (t.role !== 'user' && t.role !== 'assistant')) return null
    const text = typeof t.text === 'string' ? t.text.slice(0, MAX_TEXT) : ''
    const image = t.role === 'user' && typeof t.image === 'string' ? t.image : undefined
    if (image && (image.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image))) return null
    if (!text && !image) return null
    out.push({ role: t.role, text, image })
  }
  if (out[0].role !== 'user' || out[out.length - 1].role !== 'user') return null
  return out
}

function toMessages(turns: Turn[]): Anthropic.MessageParam[] {
  // Only the most recent photo is sent, so a long correction chat doesn't re-bill old images.
  let lastImageIdx = -1
  turns.forEach((t, i) => {
    if (t.image) lastImageIdx = i
  })
  return turns.map((t, i): Anthropic.MessageParam => {
    if (t.role === 'assistant') return { role: 'assistant', content: t.text }
    const content: Anthropic.ContentBlockParam[] = []
    if (t.image && i === lastImageIdx) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: t.image } })
    }
    content.push({ type: 'text', text: t.text || 'Estimate this meal.' })
    return { role: 'user', content }
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey || !process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server is not configured' })
  }

  // 1. Only signed-in users may call the AI.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in' })
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return res.status(401).json({ error: 'Not signed in' })

  const turns = parseTurns(req.body)
  if (!turns) return res.status(400).json({ error: 'Invalid request' })

  // 2. Daily caps keep the monthly bill predictable: 6 new meals per day (follow-up
  //    corrections in the same chat are free), plus a hard cap on total AI calls.
  const newMeal = turns.filter((t) => t.role === 'user').length === 1
  let { data: credit, error: creditError } = await supabase.rpc('consume_ai_credit', { new_meal: newMeal })
  if (creditError?.code === 'PGRST202') {
    // Database not updated yet: fall back to the older single counter (returns a boolean).
    const legacy = await supabase.rpc('consume_ai_credit')
    creditError = legacy.error
    credit = legacy.data === true ? 'ok' : 'call_limit'
  }
  if (creditError) return res.status(500).json({ error: 'Could not check usage limit' })
  if (credit === 'meal_limit') {
    return res.status(429).json({ error: "You've logged 6 AI meals today. You can still add more manually." })
  }
  if (credit !== 'ok') {
    return res.status(429).json({ error: "You've hit today's AI limit. You can still add the meal manually." })
  }

  // 3. Ask Claude for a structured estimate.
  const client = new Anthropic()
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      messages: toMessages(turns),
      output_config: { format: zodOutputFormat(MealEstimate) },
    })
    if (!response.parsed_output) {
      return res.status(502).json({ error: "Couldn't read that meal, try describing it in words." })
    }
    return res.status(200).json(response.parsed_output)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(503).json({ error: 'The AI is busy right now, try again in a minute.' })
    }
    if (err instanceof Anthropic.BadRequestError) {
      return res.status(400).json({ error: "Couldn't process that photo, try another one or describe it in words." })
    }
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error', err.status, err.message)
      return res.status(502).json({ error: 'The AI service had a problem, try again.' })
    }
    console.error(err)
    return res.status(500).json({ error: 'Something went wrong' })
  }
}
