"use client"

import { useEffect, useRef, useState } from "react"
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {Button} from "@/components/ui/button";
import {Loader2, TrendingUp} from "lucide-react";
import {useRouter} from "next/navigation";
import {searchStocks} from "@/lib/actions/finnhub.actions";
import {useDebounce} from "@/hooks/useDebounce";

// Other triggers (like the mobile menu) open the search dialog by dispatching this event
export const OPEN_SEARCH_EVENT = "open-stock-search";

export default function SearchCommand({ renderAs = 'button', label = 'Add stock', initialStocks }: SearchCommandProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [stocks, setStocks] = useState<StockWithWatchlistStatus[]>(initialStocks);
  const latestTermRef = useRef("");
  const router = useRouter();

  const isSearchMode = !!searchTerm.trim();
  const displayStocks = isSearchMode ? stocks : stocks?.slice(0, 10);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    const onOpenSearch = () => setOpen(true)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenSearch)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenSearch)
    }
  }, [])

  const handleSearch = async () => {
    const term = searchTerm.trim();
    latestTermRef.current = term;

    if(!term) {
      setLoading(false);
      return setStocks(initialStocks);
    }

    setLoading(true)
    try {
        const results = await searchStocks(term);
        // Ignore results for a term the user has already changed
        if(latestTermRef.current === term) setStocks(results);
    } catch {
      if(latestTermRef.current === term) setStocks([])
    } finally {
      if(latestTermRef.current === term) setLoading(false)
    }
  }

  const debouncedSearch = useDebounce(handleSearch, 300);

  useEffect(() => {
    debouncedSearch();
  }, [searchTerm, debouncedSearch]);

  const handleSelectStock = (symbol: string) => {
    router.push(`/stocks/${symbol}`);
    setOpen(false);
    setSearchTerm("");
    setStocks(initialStocks);
  }

  return (
    <>
      {renderAs === 'text' ? (
          <button type="button" onClick={() => setOpen(true)} className="search-text">
            {label}
          </button>
      ): (
          <Button onClick={() => setOpen(true)} className="search-btn">
            {label}
          </Button>
      )}
      <CommandDialog open={open} onOpenChange={setOpen} className="search-dialog" title="Search stocks" description="Search for a stock by name or symbol">
        {/* Results come from Finnhub, so turn off the built-in filtering */}
        <Command shouldFilter={false} className="!bg-gray-800">
          <div className="search-field">
            <CommandInput value={searchTerm} onValueChange={setSearchTerm} placeholder="Search stocks..." className="search-input" />
            {loading && <Loader2 className="search-loader" />}
          </div>
          <CommandList className="search-list">
            {loading ? (
                <CommandEmpty className="search-list-empty">Loading stocks...</CommandEmpty>
            ) : displayStocks?.length === 0 ? (
                <div className="search-list-indicator">
                  {isSearchMode ? 'No results found' : 'No stocks available'}
                </div>
              ) : (
              <div>
                <div className="search-count">
                  {isSearchMode ? 'Search results' : 'Popular stocks'}
                  {` `}({displayStocks?.length || 0})
                </div>
                {displayStocks?.map((stock) => (
                    <CommandItem
                        key={stock.symbol}
                        value={stock.symbol}
                        onSelect={() => handleSelectStock(stock.symbol)}
                        className="search-item"
                    >
                      <div className="search-item-link">
                        <TrendingUp className="h-4 w-4 text-gray-500" />
                        <div className="flex-1">
                          <div className="search-item-name">
                            {stock.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {stock.symbol} | {stock.exchange} | {stock.type}
                          </div>
                        </div>
                      </div>
                    </CommandItem>
                ))}
              </div>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
