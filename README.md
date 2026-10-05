# GymBuddies 🏋️

A mobile-first web app for a group of friends (in different countries) to track workouts and daily calories, and see who has already hit the gym today.

- **For You**: weekly rings (workouts vs. goal, calories today, days under target), a week strip, and big **Record Workout** / **Log Meal** buttons. Tap any meal or workout to see its details; **History** shows every past day.
- **Record Workout**: **Start workout** logs each set's weight and reps live, with a timer, prefilled from last time (it survives closing the app); **Copy last session** loads the exact exercises, weights and reps from the previous session of that split. Cardio machines (treadmill, bike, rower, stair climber…) log minutes and km instead of kg × reps. **Quick log** just records the split.
- **Gym Progress**: per split, each exercise's top set over the last 8 weeks, its change vs. a week earlier, and weekly volume.
- **Groups & friends**: new users ask to join a group at sign-up (or skip); an admin approves. Admins get a **🛡 Admin** page on the Friends tab with join requests, members per group (add/remove), people without a group, and rename/delete/new group. You can also add individual people by display name or exact email; once they accept, you see each other's progress like group-mates. The Friends tab shows one box per group, then your friends from other groups.
- **Friends**: stories-style row (green ring = trained today, with the day type, e.g. *Push*), weekly leaderboard, and a status card per person with today's calorie total.
- **AI meal logging**: describe a meal, say it with the 🎤 (free browser speech-to-text), or snap a photo. Claude Haiku 4.5 estimates calories and macros, and you can correct it in chat ("it was 2 rotis"). Manual entry is also available.
- **Onboarding**: display name, photo, weight, height, workouts per week, goal and calorie target, split (PPL / Upper-Lower / Full Body / Bro / Arnold / Custom), then a suggested plan or your own built from a list of common exercises.
- **Privacy**: individual meals, weight and height are visible only to you (Postgres row-level security). Friends see only aggregates: workout status and day type, weekly count and daily calorie total.
- Apple Fitness look (black background, red/green/cyan rings, SF system font) using [Konsta UI](https://konstaui.com) iOS components. Installable on the iPhone home screen.

**Stack:** React + Vite + Tailwind v4 + Konsta UI · Supabase (auth, Postgres, storage) · Vercel (hosting + one serverless function) · Anthropic API (`claude-haiku-4-5`).

---

## Setup (about 15 minutes, one time)

### 1. Supabase (free)

1. Create a project at [supabase.com](https://supabase.com) (pick the region closest to most of you).
2. **SQL Editor → New query**: paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. **Authentication → Sign In / Providers → Email**: keep it enabled. Turning off **Confirm email** is optional and makes sign-up instant for friends.
4. **Authentication → URL Configuration**: set **Site URL** to your Vercel URL (after step 3) so confirmation emails link back to the app.
5. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
6. **Password reset emails**: Supabase's built-in sender only delivers to your own Supabase team. So that friends get reset emails, connect [Resend](https://resend.com) (free, 3,000 emails/month) under **Authentication → Emails → SMTP Settings**: host `smtp.resend.com`, port `465`, user `resend`, password = Resend API key, sender e.g. `noreply@ak97.in`. Also add `https://gymbuddies.ak97.in/**` under **Authentication → URL Configuration → Redirect URLs**. [`supabase/reset-password.sql`](supabase/reset-password.sql) remains as a manual fallback.

### 2. Anthropic API key

1. Create a key at [console.anthropic.com](https://console.anthropic.com) → API Keys.
2. **Recommended:** under **Limits**, set a monthly spend limit (e.g. $8) so the bill can never surprise you.

### 3. Vercel (free)

1. [vercel.com](https://vercel.com) → **Add New → Project** → import this GitHub repo. The Vite framework is detected automatically.
2. Add **Environment Variables**:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon public key |
   | `ANTHROPIC_API_KEY` | Your Anthropic key (server-only, never sent to the browser) |

3. **Deploy**. Share the `https://<name>.vercel.app` link with your friends.

**Custom domain:** the app lives at `https://gymbuddies.ak97.in` (CNAME in Squarespace DNS → Vercel). Opening the old `adwait97.vercel.app` address redirects there and carries the login over, so nobody has to log in again (`src/lib/domainRedirect.ts`). Preview deployments are unaffected.

On iPhone: open the link in Safari → Share → **Add to Home Screen**. It then opens full-screen like a native app.

---

## Monthly cost (target: under €10)

| Item | Cost |
|---|---|
| Supabase free tier (500 MB DB, 1 GB storage, 50k users) | €0 |
| Vercel Hobby (personal, non-commercial) | €0 |
| Claude Haiku 4.5 ($1 / M input, $5 / M output tokens) | ~€0.003 per meal analysis |

A photo is downscaled to 1024 px in the browser (~1.5k input tokens) and the reply is ~350 tokens, so one analysis costs about a third of a cent. **10 friends × 4 meals a day × 30 days ≈ 1,200 analyses ≈ €4/month.**

Guard rails built in:
- Each user is capped at **6 AI-analysed meals per day** (corrections in the same chat are free, with a hard limit of 30 AI calls a day) (`meal_limit` and `call_limit` in `consume_ai_credit()` in `schema.sql`). After that the app still works and asks for manual entry.
- Only signed-in users can call the AI endpoint. The key lives only on Vercel.
- Meal photos are **not stored**: they go to the AI once and are discarded. Profile pictures are shrunk to 320 px.
- Set the Anthropic Console spend limit as a hard ceiling.

Note: Supabase pauses free projects after **7 days with no activity**. Daily use keeps it awake; if it does pause, click **Restore** in the dashboard.

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run dev                  # UI at http://localhost:5173
```

`npm run dev` serves the UI only. To exercise the AI endpoint locally, use the Vercel CLI (`npx vercel dev`), which also runs `api/analyze-meal.ts`.

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Project layout

```
api/analyze-meal.ts       Vercel function: auth check → daily cap → Claude Haiku (structured JSON output)
supabase/schema.sql       Tables, row-level security, get_feed() aggregates, AI rate limit, avatar bucket
src/lib/                  Supabase client, data access, auth context, exercise library & split templates
src/pages/                AuthPage, Onboarding, Home (swipeable For You / Friends), MeFeed, FriendsFeed
src/components/           Record workout / log meal / profile sheets, plan editor, rings, avatar
```

## How "today" works across countries

Every workout and meal is saved with the logger's **own calendar date**, and each profile stores the phone's time zone (updated automatically when you travel). The Friends feed computes "trained today" and "this week" (Monday start) in each person's own time zone.
