# Bangkok Social Floor: how to put it online

Following these steps gives you a public website where anyone can see the dance timetable and map, dancers RSVP with Google or LINE, and organisers change dates and times that update on every open phone straight away.

It all runs on free plans. It takes about 30–40 minutes the first time, and you don't need to write any code.

**What's in this folder**

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js`, `i18n.js` | The website itself (English and Thai) |
| `config.js` | **The only file you edit**: your Supabase address and key |
| `supabase/schema.sql` | Sets up the database and its security rules, with 8 sample events |
| `supabase/make-organiser.sql` | Gives someone organiser rights |

> **Preview first:** open `index.html` in a browser as it is. With `config.js` still empty, the site runs in **demo mode** with sample events. "Sign in" makes you a demo organiser so you can try editing. Nothing is saved.

---

## Step 1: Put the code on GitHub (5 min)

1. Sign up at **github.com** (you can use your Google account).
2. Click **+ → New repository**. Name it `bkk-social-floor`, choose **Public** or **Private**, then click **Create repository**.
3. On the new page, click **"uploading an existing file"**. Drag in **everything in this folder**, including the `supabase` folder, then click **Commit changes**.

## Step 2: Create the database on Supabase (5 min)

1. Sign up at **supabase.com** → **New project**.
   - Name: `bkk-social-floor`
   - Database password: make a strong one and save it somewhere safe
   - **Region: Southeast Asia (Singapore)**, which is closest to Bangkok and so fastest
2. Wait about 2 minutes while it builds.
3. Left menu → **SQL Editor** → **New query**. Open `supabase/schema.sql`, copy all of it, paste it in, then click **Run**. You should see "Success". This creates the events, RSVPs and organiser rules, plus the 8 sample events.
4. Left menu → **Project Settings → API**. Keep this page open, because you'll need two things from it:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string)

## Step 3: Connect the site to the database (2 min)

1. On GitHub, open `config.js` → click the ✏️ pencil icon.
2. Paste in your two values:
   ```js
   SUPABASE_URL: "https://abcd1234.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",
   LINE_PROVIDER: "",          // leave empty until Step 6 is done
   ```
3. Click **Commit changes**.

> The anon key is meant to be public. The security rules in the database decide what each person can do. For example, dancers can't edit events or mark themselves as paid; this was tested.

## Step 4: Publish on Vercel (5 min)

1. Sign up at **vercel.com** → **Continue with GitHub**.
2. **Add New → Project** → pick `bkk-social-floor` → **Import**.
3. For Framework Preset choose **Other**. Leave the build settings empty, then click **Deploy**.
4. You'll get a public link like `https://bkk-social-floor.vercel.app`. **Copy it.**
5. Back in Supabase: **Authentication → URL Configuration**
   - **Site URL:** your Vercel link
   - **Redirect URLs:** add your Vercel link with `/**` on the end (e.g. `https://bkk-social-floor.vercel.app/**`)

From now on, every change you save on GitHub goes live on your site within about a minute.

## Step 5: Turn on Google login (10 min)

1. Go to **console.cloud.google.com** → create a project (e.g. "BKK Social Floor").
2. **APIs & Services → OAuth consent screen**: choose **External**, add the app name, your email and your Vercel link, then save. Click **Publish app** so anyone can sign in, not only test users.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**
   - **Authorized redirect URI:** `https://<your-project>.supabase.co/auth/v1/callback`. The exact address is shown in Supabase under **Authentication → Sign In / Providers → Google**.
4. Copy the **Client ID** and **Client secret**.
5. In Supabase: **Authentication → Sign In / Providers → Google** → turn it on, paste both values, then save.

Test it: open your site → **Sign in → Continue with Google**.

## Step 6: Turn on LINE login (10 min)

Most Thai dancers already have LINE, so this is worth doing.

1. Go to **developers.line.biz** → log in with your LINE account → **Create a provider** (e.g. your business name).
2. Inside it, **Create a new channel → LINE Login**
   - App type: **Web app**
   - Fill in the name, description and your email, then create it.
3. In the channel, open the **Basic settings** tab and copy the **Channel ID** and **Channel secret**.
4. In Supabase: **Authentication → Sign In / Providers → New Provider → Auto-discovery (OIDC)**
   - Identifier: `custom:line`
   - Client ID: your LINE **Channel ID**
   - Client secret: your LINE **Channel secret**
   - Issuer URL: `https://access.line.me`
   - Turn on **allow sign-in without an email** (LINE often doesn't share an email address)
   - Copy the **Callback URL** it shows you, then click **Create and enable provider**.
5. Back in LINE Developers: open the channel's **LINE Login** tab → paste that Callback URL into **Callback URL**, then save.
6. At the top of the channel page, switch the status from **Developing** to **Published**, so anyone can log in, not just you.
7. On GitHub, edit `config.js` → set `LINE_PROVIDER: "custom:line",` → **Commit**.

## Step 7: Make yourself (and other organisers) an organiser (2 min)

1. Sign in on your live site once, with Google or LINE.
2. In Supabase, go to **SQL Editor → New query**, open `supabase/make-organiser.sql`, run the first query, find your name, then run the second one with your name in it.
3. Reload your site. You'll now see **+ Add event**, **Change date / time** and the **guest list** with door check-in.

Do the same for any other organisers after they've signed in once.

## Step 8: Replace the sample events

Add your real nights with **+ Add event**. For the location, open Google Maps, long-press the venue, and copy the numbers that appear (e.g. `13.7262, 100.5801`) into **Coordinates**.

Then delete the samples: run `delete from public.events where is_sample = true;` in the SQL Editor.

---

## Everyday use

- **Moving a night:** Change date / time → new time → **Save for everyone**. Every open page updates immediately and shows a note like *"Latin Night moved to Fri 21:30"*. The event keeps a **"Moved · was 21:00"** tag for 5 days.
- **Cancelling:** set Status to **Cancelled**. It stays visible, crossed out, so nobody turns up.
- **Sharing:** the **Share** button on an event gives a link that opens straight to that night, which works well for LINE groups.
- **At the door:** open the event → guest list → tick **In** as people arrive.

## Your own domain (optional, about 350–500 THB/year)

Buy a domain (e.g. from Namecheap or Cloudflare), then go to Vercel → your project → **Settings → Domains** → add it and follow the DNS instructions. Afterwards, add the new address to Supabase **URL Configuration** (Step 4.5) and to Google's redirect settings if asked.

## Adding ticket sales later

Tickets are already built into the database: each event has `tickets_enabled`, `ticket_price_thb` and `capacity`, and each RSVP has `payment_status` (free / pending / paid / refunded). The site already shows a **"Tickets · 300 THB"** button when an event has tickets switched on. For now it says tickets are coming soon.

To go live with payments you'll need:
1. A **Stripe** (stripe.com/th) or **Opn Payments / Omise** (omise.co) account. Both take Thai cards and **PromptPay QR**. They'll ask for your business details and a Thai bank account.
2. Two small server functions, added to this project in an `api/` folder that Vercel runs automatically:
   - **checkout**: creates the payment for the chosen event and sends the dancer to pay.
   - **webhook**: when the payment provider confirms payment, marks the dancer's RSVP as **paid** using a secret server key. This is why dancers can't mark themselves paid.

When you've picked a provider and have the account, that part can be added in one session.

## Costs

| Service | Free plan covers | When you'd pay |
|---|---|---|
| Supabase | 50,000 monthly active users, 500 MB database | Pro is $25/month. Free projects pause after 1 week with no visitors (one click to wake up). |
| Vercel | Personal/hobby sites | Pro is $20/month if you run it as a commercial business with ticket sales |
| GitHub | Unlimited repositories | — |
| Stripe / Opn | No monthly fee | A percentage per payment (check their Thailand pricing page) |

## If something goes wrong

- **"Sign in" goes to an error page:** check Step 4.5 (Site URL and Redirect URLs) and the redirect URI in Google/LINE.
- **LINE login says the app isn't available:** the LINE channel is still in **Developing** mode (Step 6.6).
- **You can't see "+ Add event":** you're not an organiser yet (Step 7), or you need to reload the page.
- **The page says "Demo mode":** `config.js` still has empty values (Step 3).
