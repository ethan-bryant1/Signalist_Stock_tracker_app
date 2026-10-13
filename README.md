# Loops Watch

A real-time stock market app: live charts and a market heatmap, company pages with news and key figures, a personal watchlist, and a daily market news email.

Built with Next.js 16, Better Auth, MongoDB, Inngest, Finnhub and TradingView widgets. It started from the [JavaScript Mastery Signalist tutorial](https://www.youtube.com/watch?v=gu4pafNCXng) and has been extended well beyond it.

## Features

- **Dashboard:** live S&P 500, Nasdaq 100, Dow 30 and Russell 2000 prices that refresh every minute, a market open/closed badge, a market overview, a heatmap of 54 large S&P 500 companies (hover, tap or use the arrow keys for each stock's quote, with the price time and a stale-price warning), top stories and quotes.
- **Workspace:** your own layouts of widgets, like IBKR Mosaic. Start from the Market Overview, Technical Analysis or Company Research template, then add, remove, drag and resize widgets (chart, quote, company news, watchlist, Market Snapshot, sector funds, indexes, technical rating, profile, financials, headlines, economic calendar, screener). One linked symbol per workspace: pick a stock in the watchlist or the Market Snapshot and every linked widget loads it. Saved to your account.
- **S&P 500 Heatmap:** TradingView's map of every S&P 500 company, colored by any period from 1 hour to 1 year (or pre-market and after hours) and sized by market cap, volume or dollar volume, with the sector funds' moves beside it. Clicking a stock opens its page here. The dashboard's Market Snapshot is our own live map of 54 of the largest companies. See [docs/heatmap.md](docs/heatmap.md) for where every figure comes from.
- **Market data:** every US stock in a screener, plus search and sector filters for the S&P 500.
- **Stock pages:** price, key figures (P/E, EPS, market cap, 52-week range and more; funds such as SPY show only the figures that apply to a fund), a chart that can go full screen, the latest news, profile, technical analysis and financials.
- **News:** market headlines and the week's US economic calendar.
- **Search:** press Ctrl+K (Cmd+K on a Mac) to find any US stock.
- **Watchlist:** star stocks to follow them, with live prices on the Watchlist page.
- **Emails:** a personal AI-written welcome email, and a daily summary of news about your watchlist.
- **Light and dark themes.**

## A private site

Loops Watch shows Finnhub prices and news, and Finnhub's free plan is licensed for personal use. So only the emails in `ALLOWED_EMAILS` can sign up, sign in or receive the news email. Anyone else who opens the site sees the sign-in page and is told it's private. Taking an email off the list also ends that person's sessions straight away. Opening it to other people needs Finnhub's written approval or a data provider licensed for it.

## Run it on your computer

1. Install [Node.js](https://nodejs.org) 22 or newer (the heatmap's live trade stream uses its built-in WebSocket).
2. Copy `.env.example` to `.env` and fill in each value. The comments in the file say where to get each key.
3. Install and start the app:

   ```bash
   npm install
   npm run dev
   ```

4. Open http://localhost:3000 and create an account with the email you put in `ALLOWED_EMAILS`.
5. To send emails while developing, run Inngest's local server in a second terminal:

   ```bash
   npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
   ```

6. Optional checks:

   ```bash
   npm test                     # unit tests for the market-data rules, heatmap layout, colors and sign-in rules
   npm run check:market-data    # checks the real Finnhub data behind the heatmaps with your key (about 4 minutes)
   npm run check:stream         # checks Finnhub's live trade stream with your key (20 seconds)
   ```

## Deploy to Vercel

You need the same accounts as for running locally (MongoDB Atlas, Finnhub, Gemini, a Gmail App Password), plus free [Vercel](https://vercel.com) and [Inngest](https://www.inngest.com) accounts.

1. **Let Vercel reach your database.** In MongoDB Atlas, open **Network Access**, click **Add IP Address**, choose **Allow access from anywhere** (0.0.0.0/0) and confirm. Vercel's servers don't have fixed addresses, so Atlas has to accept connections from any address. Your database password still protects it.
2. **Import the project.** Sign in to Vercel with GitHub, click **Add New… → Project**, and import this repository. Name the project `loops-watch` (or anything you like). The live address will be `https://<project-name>.vercel.app`.
3. **Add the environment variables.** Under **Environment Variables**, paste the contents of your `.env` file into the first **Key** box. Vercel splits it into one variable per line. Then make two changes:
   - delete `NODE_ENV`, because Vercel sets it itself
   - change `BETTER_AUTH_URL` to your live address, like `https://loops-watch.vercel.app`
   - check that `ALLOWED_EMAILS` holds your email, or nobody will be able to sign in
4. **Deploy.** Click **Deploy** and wait for the build to finish. If the address Vercel gives you differs from the one you used for `BETTER_AUTH_URL`, update the variable under **Settings → Environment Variables** and redeploy.
5. **Connect Inngest so emails send.** Install the [Inngest integration for Vercel](https://vercel.com/integrations/inngest) and pick this project. It adds `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` for you. Then redeploy: open **Deployments**, click **⋯** on the latest one and choose **Redeploy**. In the [Inngest dashboard](https://app.inngest.com), the app should list two functions: the welcome email and the daily news summary.
6. **Try it.** Open your live address and sign in. If you use a new database, sign up with your `ALLOWED_EMAILS` email and check that the welcome email arrives. New senders often land in spam at first.

Every push to `main` deploys again automatically.

While a heatmap is open during market hours, its live price stream keeps a Vercel function running. Each connection lasts under five minutes (the Hobby plan's limit) and then reconnects, and it closes when you switch tabs or the market closes. That counts toward Vercel's free function usage, which is plenty for one person.

## Project layout

- `app/(root)`: the signed-in pages (dashboard, heatmap, market data, stock pages, watchlist)
- `app/(auth)`: sign-in and sign-up
- `app/api/inngest`: background jobs for emails
- `components`: the page building blocks
- `lib/actions`: server code for Finnhub, the watchlist and auth
- `lib/data`: the bundled S&P 500 list, the heatmap's stocks, and the index and sector funds
- `lib/market-data.ts`, `lib/heatmap.ts`, `lib/treemap.ts`: the heatmaps' rules for prices, freshness, colors and layout (tested in `tests`)
