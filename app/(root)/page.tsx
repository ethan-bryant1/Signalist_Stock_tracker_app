import TradingViewWidget from "@/components/TradingViewWidget";
import {
    HEATMAP_WIDGET_CONFIG,
    MARKET_DATA_WIDGET_CONFIG,
    MARKET_OVERVIEW_WIDGET_CONFIG,
    TOP_STORIES_WIDGET_CONFIG,
    TRADINGVIEW_SCRIPT_URL,
} from "@/lib/constants";

// Each section title links to a page that shows that widget on its own, larger
const Home = () => {
    return (
        <div className="flex min-h-screen home-wrapper">
          <section className="grid w-full gap-8 home-section">
              <div className="md:col-span-1 xl:col-span-1">
                  <TradingViewWidget
                    title="Market Overview"
                    href="/market-overview"
                    scriptUrl={`${TRADINGVIEW_SCRIPT_URL}market-overview.js`}
                    config={MARKET_OVERVIEW_WIDGET_CONFIG}
                    className="custom-chart"
                    height={600}
                  />
              </div>
              <div className="md:col-span-1 xl:col-span-2">
                  <TradingViewWidget
                      title="Stock Heatmap"
                      href="/heatmap"
                      scriptUrl={`${TRADINGVIEW_SCRIPT_URL}stock-heatmap.js`}
                      config={HEATMAP_WIDGET_CONFIG}
                      height={600}
                  />
              </div>
          </section>
            <section className="grid w-full gap-8 home-section">
                <div className="h-full md:col-span-1 xl:col-span-1">
                    <TradingViewWidget
                        title="Top Stories"
                        href="/top-stories"
                        scriptUrl={`${TRADINGVIEW_SCRIPT_URL}timeline.js`}
                        config={TOP_STORIES_WIDGET_CONFIG}
                        height={600}
                    />
                </div>
                <div className="h-full md:col-span-1 xl:col-span-2">
                    <TradingViewWidget
                        title="Market Data"
                        href="/market-data"
                        scriptUrl={`${TRADINGVIEW_SCRIPT_URL}market-quotes.js`}
                        config={MARKET_DATA_WIDGET_CONFIG}
                        height={600}
                    />
                </div>
            </section>
        </div>
    )
}

export default Home;
