import { redirect } from "next/navigation";

// TradingView widgets link here as /stocks?tvwidgetsymbol=NASDAQ:AAPL when a stock is clicked.
// Send the visitor to that stock's page on this site.
export default async function StocksRedirect({ searchParams }: PageProps<"/stocks">) {
  const { tvwidgetsymbol } = await searchParams;
  const raw = Array.isArray(tvwidgetsymbol) ? tvwidgetsymbol[0] : tvwidgetsymbol;
  const symbol = raw?.split(":").pop()?.trim().toUpperCase();

  redirect(symbol ? `/stocks/${encodeURIComponent(symbol)}` : "/");
}
