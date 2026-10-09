"use client";

import { OPEN_SEARCH_EVENT } from "@/components/SearchCommand";

// Opens the header's stock search (same as pressing Ctrl+K)
const OpenSearchButton = ({ label }: { label: string }) => (
  <button
    type="button"
    className="watchlist-btn px-6 w-fit!"
    onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
  >
    {label}
  </button>
);

export default OpenSearchButton;
