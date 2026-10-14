# Deploy Loops Watch to Vercel

A step-by-step guide for putting Loops Watch online at your own `https://<name>.vercel.app` address. Everything here
is free: Vercel Hobby, MongoDB Atlas free tier, Inngest free tier, and the free Finnhub, FRED and Alpaca keys you
already use. You do every step yourself, in your own accounts. Never paste a key or password into a chat, an issue
or a screenshot; they only go into your `.env` file and Vercel's settings.

## 0. Before you start

1. Merge the latest pull requests on GitHub, then bring your computer up to date in PowerShell:

   ```powershell
   cd C:\Users\Loops\Documents\Signalist_Stock_tracker_app
   git checkout main
   git pull
   npm install
   ```

   If `git checkout` or `git pull` complains about `package-lock.json`, run `git checkout -- package-lock.json` and
   try again (`npm install` sometimes changes that file).

2. Make sure the app works locally first: `npm run dev`, open http://localhost:3000, sign in, open a few pages.
   Then stop it with Ctrl+C. Optional but useful: `npm run build` must finish without errors, because Vercel runs
   the same command.

3. Keep your `.env` open in VS Code. You'll copy its values into Vercel in step 3.

## 1. Let Vercel reach your database (MongoDB Atlas)

Vercel's servers don't have fixed addresses, so Atlas has to accept connections from anywhere. Your database
username and password still protect it.

1. Sign in at https://cloud.mongodb.com and open your project.
2. Left menu: **Security → Network Access** (in some layouts: **Database & Network Access → IP Access List**).
3. Click **Add IP Address**, choose **Allow access from anywhere** (`0.0.0.0/0`), then **Confirm**.
4. Wait until the new entry shows **Active** (a minute or two).

Use the same `MONGODB_URI` as on your computer (the one ending in `/loops-watch?...`). Then the live site and your
computer share one account, the same watchlists, workspaces and portfolios, and the same price cache.

## 2. Create the Vercel project

1. Go to https://vercel.com and **Sign up / Log in with GitHub** (the account `ethan-bryant1`). Choose the free
   **Hobby** plan.
2. Click **Add New… → Project**. Find `Signalist_Stock_tracker_app` in the list and click **Import**. If it isn't
   listed, click **Adjust GitHub App Permissions** and give Vercel access to that repository.
3. On the setup screen:
   - **Project Name:** `loops-watch` (your address becomes `https://loops-watch.vercel.app`; if that name is taken,
     Vercel adds a suffix, and you'll use whatever it shows).
   - **Framework Preset:** Next.js (detected automatically). Leave **Root Directory**, **Build Command** and
     **Output Directory** as they are.
   - Node.js version: nothing to do. `package.json` asks for Node 22 or newer, which the live price stream needs.
4. Don't click **Deploy** yet: open **Environment Variables** on the same screen first (step 3).

## 3. Add the environment variables

The quickest way: in VS Code select everything in your `.env`, copy it, and paste it into the first **Key** box.
Vercel splits it into one variable per line. Then fix the list so it matches this table:

| Variable | Value on Vercel | Needed for |
|---|---|---|
| `MONGODB_URI` | same as your `.env` | everything (sign-in, saved data, cache) |
| `BETTER_AUTH_SECRET` | same as your `.env` (keeps it simple), or a new long random string | sign-in |
| `BETTER_AUTH_URL` | **your live address**, like `https://loops-watch.vercel.app` (no slash at the end) | sign-in, links in emails |
| `ALLOWED_EMAILS` | your email, like on your computer | who can sign in (empty = nobody) |
| `FINNHUB_API_KEY` | same as your `.env` | prices, heatmap, news, stock pages |
| `FRED_API_KEY` | same as your `.env` | Economy page |
| `ALPACA_API_KEY_ID` | same as your `.env` | Portfolio page backtests |
| `ALPACA_API_SECRET_KEY` | same as your `.env` | Portfolio page backtests |
| `GEMINI_API_KEY` | same as your `.env` | welcome and daily news emails |
| `NODEMAILER_EMAIL` | same as your `.env` | sending emails |
| `NODEMAILER_PASSWORD` | your Gmail **App Password**, same as your `.env` | sending emails |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | **don't add them by hand**: the Inngest integration adds them (step 5) | emails |

Delete these if they came in with the paste:

- `NODE_ENV`: Vercel sets it itself.
- `NEXT_PUBLIC_FINNHUB_API_KEY`: the old name of the Finnhub key. The `NEXT_PUBLIC_` prefix tells Next.js a value
  may be sent to browsers. Use `FINNHUB_API_KEY` instead.

Set each variable's environment to **Production** only (untick Preview and Development). Preview deployments are
built from pull request branches before you've merged them, so they shouldn't get your real database and keys; they
simply won't be able to sign you in, which is fine because you test pull requests on your computer. If you want a
fresh secret instead of reusing yours, this PowerShell line prints one (copy it straight into Vercel; changing it
only signs you out):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))
```

If you forget `BETTER_AUTH_URL`, links in emails still point at your project's main `.vercel.app` address, but set
it anyway so sign-in and emails always use the address you chose.

## 4. Deploy

1. Click **Deploy** and wait for the build (a few minutes). A "Congratulations" screen means it worked.
2. Look at the address Vercel shows under **Domains**. If it differs from what you typed into `BETTER_AUTH_URL`
   (for example `loops-watch-abc123.vercel.app`), fix the variable: **Settings → Environment Variables →**
   `BETTER_AUTH_URL` **→ ⋯ → Edit**, save, then redeploy (step 4.3).
3. To redeploy after changing any variable: **Deployments**, click **⋯** next to the newest one, **Redeploy**.
   Variables only take effect in deployments made after the change.

If the build fails, open the failed deployment and read the red lines under **Build Logs**. The most common cause is
a typo in a variable name; the build itself doesn't need any key.

## 5. Connect Inngest (emails)

Inngest runs the welcome email and the daily news summary (every day at 12:00 UTC, which is 8 AM New York in
summer and 7 AM in winter).

1. Open https://vercel.com/integrations/inngest (or in Vercel: **Integrations → Browse Marketplace → Inngest**) and
   click **Install** / **Add Integration**.
2. Sign in to (or create) a free Inngest account when asked, and pick the `loops-watch` project.
3. The integration adds `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to the project. Redeploy once (step 4.3) so
   the app picks them up.
4. Open https://app.inngest.com → **Apps**. You should see the app (its id is `signalist`, a leftover from the
   tutorial, which is fine) with two functions: `sign-up-email` and `daily-news-summary`. If the app isn't
   there, click **Sync new app** / **Resync**, and enter `https://<your-address>/api/inngest`.

Inngest's dashboard can also run the daily news email right away: open `daily-news-summary` and click **Invoke**. It emails
every account in the database, which is only you.

## 6. Check that everything works

Open your live address in a normal browser window and go through this list:

1. **Sign in** with your `ALLOWED_EMAILS` email and the same password as on your computer (same database). If you
   used a new database, sign up instead, then check the welcome email arrives (look in spam the first time and mark
   it "Not spam").
2. **Private site:** in a private/incognito window, try to sign up with another email. It must say Loops Watch is
   private.
3. **Dashboard:** index prices and the Market Snapshot fill in, each price with a time. During market hours the
   snapshot shows live trades.
4. **Pages:** open Heatmap, Markets, News, Economy, Portfolio, Watchlist, Workspace and one stock page (for example
   `/stocks/AAPL`). Economy needs `FRED_API_KEY` and Portfolio needs the Alpaca keys; without them each page shows a
   setup notice instead of figures.
5. **Data status** (account menu): Finnhub calls stay under 50 a minute while you click around.
6. **Email links:** the "Visit Loops Watch" button in an email opens your live address, not localhost.
7. **Errors:** in Vercel open **Logs** (or the project's **Observability** tab). A few lines like "Connected to
   database production" are normal; red errors are worth reading.

## Good to know

- **Updates:** every merge into `main` on GitHub deploys again automatically. Each pull request also gets its own
  preview address. Previews don't have your keys (step 3), so they show the sign-in page and nothing more; test pull
  requests on your computer with `npm run dev`.
- **Undo a bad deploy:** **Deployments**, pick the last good one, **⋯ → Promote to Production** (or **Instant
  Rollback**).
- **Live prices on two machines:** Finnhub allows one live trade stream per key. If the deployed site and
  `npm run dev` on your computer stream at the same time, one of them may lose live trades and fall back to
  refreshed prices. Close one of them and the other recovers.
- **Call counts:** each Vercel server instance counts its own Finnhub calls, so the Data status page shows the
  instance that answered. For one person Vercel almost always uses a single instance, and the MongoDB cache is shared,
  so repeated pages still don't call Finnhub again.
- **Free limits:** the open heatmap's live stream keeps one function running in market hours (each connection lasts
  under five minutes, then reconnects; it closes when you switch tabs or the market closes). That fits comfortably in
  Vercel Hobby's free usage for one person. Vercel's **Usage** tab shows where you stand.
- **Keys stay private:** keys are only read on the server; none of them is sent to the browser. If you ever think a
  key leaked, create a new one at the provider, update it in `.env` and in Vercel, and redeploy.

## Troubleshooting

| What you see | Likely cause and fix |
|---|---|
| "Loops Watch is a private site" for your own email | `ALLOWED_EMAILS` missing or misspelled on Vercel; fix it and redeploy |
| Sign-in spins or errors, logs mention MongoDB or "timed out" | Atlas **Network Access** doesn't have `0.0.0.0/0` yet (step 1), or `MONGODB_URI` is wrong |
| Logs say `BETTER_AUTH_SECRET must be set` | add `BETTER_AUTH_SECRET` and redeploy |
| Prices show "—" everywhere | `FINNHUB_API_KEY` missing (or still named `NEXT_PUBLIC_FINNHUB_API_KEY`) |
| No welcome email | Inngest not connected or not redeployed after (step 5); check spam; check `NODEMAILER_PASSWORD` is the App Password |
| Inngest shows the app but no functions | resync the app in Inngest (step 5.4) after the latest deploy |
| Changed a variable and nothing changed | redeploy (step 4.3) |
