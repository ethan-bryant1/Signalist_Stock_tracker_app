# Loops Watch

A real-time stock market app: live charts and a market heatmap, company pages with news and key figures, a personal watchlist, and a daily market news email.

Built with Next.js 16, Better Auth, MongoDB, Inngest, Finnhub and TradingView widgets. It started from the [JavaScript Mastery Signalist tutorial](https://www.youtube.com/watch?v=gu4pafNCXng) and has been extended well beyond it.

## Features

- **Dashboard:** live S&P 500, Nasdaq 100, Dow 30 and Russell 2000 prices that refresh every minute, a market open/closed badge, a market overview, a heatmap, top stories and quotes.
- **Stock heatmap:** the whole S&P 500 colored by any time frame from 1 hour to 1 year (or pre-market and after hours), sized by market cap or volume, with full screen mode and live sector performance.
- **Market data:** every US stock in a screener, plus search and sector filters for the S&P 500.
- **Stock pages:** price, key figures (P/E, EPS, market cap, 52-week range and more), a full chart, the company's latest news, profile, technical analysis and financials.
- **Search:** press Ctrl+K (Cmd+K on a Mac) to find any US stock.
- **Watchlist:** star stocks to follow them, with live prices on the Watchlist page.
- **Emails:** a personal AI-written welcome email, and a daily summary of news about your watchlist.
- **Light and dark themes.**

## Run it on your computer

1. Install [Node.js](https://nodejs.org) 20.9 or newer.
2. Copy `.env.example` to `.env` and fill in each value. The comments in the file say where to get each key.
3. Install and start the app:

   ```bash
   npm install
   npm run dev
   ```

4. Open http://localhost:3000 and create an account.
5. To send emails while developing, run Inngest's local server in a second terminal:

   ```bash
   npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
   ```

## Deploy to Vercel

You need the same accounts as for running locally (MongoDB Atlas, Finnhub, Gemini, a Gmail App Password), plus free [Vercel](https://vercel.com) and [Inngest](https://www.inngest.com) accounts.

1. **Let Vercel reach your database.** In MongoDB Atlas, open **Network Access**, click **Add IP Address**, choose **Allow access from anywhere** (0.0.0.0/0) and confirm. Vercel's servers don't have fixed addresses, so Atlas has to accept connections from any address. Your database password still protects it.
2. **Import the project.** Sign in to Vercel with GitHub, click **Add New… → Project**, and import this repository. Name the project `loops-watch` (or anything you like). The live address will be `https://<project-name>.vercel.app`.
3. **Add the environment variables.** Under **Environment Variables**, paste the contents of your `.env` file into the first **Key** box. Vercel splits it into one variable per line. Then make two changes:
   - delete `NODE_ENV`, because Vercel sets it itself
   - change `BETTER_AUTH_URL` to your live address, like `https://loops-watch.vercel.app`
4. **Deploy.** Click **Deploy** and wait for the build to finish. If the address Vercel gives you differs from the one you used for `BETTER_AUTH_URL`, update the variable under **Settings → Environment Variables** and redeploy.
5. **Connect Inngest so emails send.** Install the [Inngest integration for Vercel](https://vercel.com/integrations/inngest) and pick this project. It adds `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` for you. Then redeploy: open **Deployments**, click **⋯** on the latest one and choose **Redeploy**. In the [Inngest dashboard](https://app.inngest.com), the app should list two functions: the welcome email and the daily news summary.
6. **Try it.** Open your live address, sign up with a new email and check that the welcome email arrives. New senders often land in spam at first.

Every push to `main` deploys again automatically.

## Project layout

- `app/(root)`: the signed-in pages (dashboard, heatmap, market data, stock pages, watchlist)
- `app/(auth)`: sign-in and sign-up
- `app/api/inngest`: background jobs for emails
- `components`: the page building blocks
- `lib/actions`: server code for Finnhub, the watchlist and auth
- `lib/data`: the bundled S&P 500 list and the index and sector funds
