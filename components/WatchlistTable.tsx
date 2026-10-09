"use client";

import { useRouter } from "next/navigation";
import WatchlistButton from "@/components/WatchlistButton";
import { getChangeColorClass } from "@/lib/utils";

const COLUMNS = ["", "Company", "Symbol", "Price", "Change", "Market Cap", "P/E Ratio"];

const WatchlistTable = ({ watchlist }: { watchlist: StockWithData[] }) => {
  const router = useRouter();

  return (
    <div className="watchlist-table overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="table-header-row">
            {COLUMNS.map((label, i) => (
              <th key={label || i} className="table-header px-4 py-3 text-sm whitespace-nowrap">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {watchlist.map((stock) => (
            <tr
              key={stock.symbol}
              className="table-row"
              onClick={() => router.push(`/stocks/${encodeURIComponent(stock.symbol)}`)}
            >
              {/* Clicking the star removes the stock without opening its page */}
              <td className="table-cell pl-4 py-3" onClick={(e) => e.stopPropagation()}>
                <WatchlistButton
                  symbol={stock.symbol}
                  company={stock.company}
                  isInWatchlist
                  type="icon"
                  onWatchlistChange={() => router.refresh()}
                />
              </td>
              <td className="table-cell px-4 py-3">{stock.company}</td>
              <td className="table-cell px-4 py-3 text-gray-400">{stock.symbol}</td>
              <td className="table-cell px-4 py-3">{stock.priceFormatted}</td>
              <td className={`table-cell px-4 py-3 ${getChangeColorClass(stock.changePercent)}`}>
                {stock.changeFormatted}
              </td>
              <td className="table-cell px-4 py-3">{stock.marketCap}</td>
              <td className="table-cell px-4 py-3">{stock.peRatio}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default WatchlistTable;
