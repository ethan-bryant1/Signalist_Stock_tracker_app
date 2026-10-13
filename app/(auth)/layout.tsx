import Link from "next/link";
import { Activity, CandlestickChart, LayoutDashboard, LayoutTemplate, Search } from "lucide-react";
import {getSession} from "@/lib/better-auth/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import Logo from "@/components/Logo";

const FEATURES = [
    { icon: LayoutDashboard, title: "Market overview", text: "Index funds, a Market Snapshot of the largest S&P 500 companies, sector funds and headlines." },
    { icon: LayoutTemplate, title: "Workspaces", text: "Your own layouts of charts, quotes, news and market panels, with one linked symbol." },
    { icon: CandlestickChart, title: "Stock research", text: "TradingView charts, key figures, news, profiles and financials for any US stock or fund." },
    { icon: Search, title: "Search and watchlist", text: "Find any US listing with Ctrl+K and keep the ones you follow in one place." },
    { icon: Activity, title: "Honest data", text: "Every price shows its source and time; delayed and stale figures are labeled." },
];

const Layout = async ({ children }: { children : React.ReactNode }) => {
    // Read headers first so Next renders this per request instead of at build time
    const requestHeaders = await headers();
    const session = await getSession(requestHeaders);

    if(session?.user) redirect('/')

    return (
        <main className="auth-layout">
            <section className="auth-left-section scrollbar-hide-default">
                <Link href="/" className="auth-logo">
                    <Logo className="h-16" />
                </Link>

                <div className="pb-6 lg:pb-8 flex-1">{children}</div>
            </section>

            <section className="auth-right-section max-lg:hidden">
                <div className="z-10 relative lg:mt-4 lg:mb-16">
                    {/* What the app does, stated plainly: no testimonials or features it doesn't have */}
                    <p className="auth-blockquote">
                        A private market workstation: heatmaps, research and watchlists on free data, with every price labeled by its source and age.
                    </p>
                    <p className="max-md:text-xs text-gray-500">For the owner&apos;s personal use</p>
                </div>

                {/* The app's parts, stated plainly. No screenshot: a picture of prices would show figures that aren't live. */}
                <ul className="relative z-10 grid max-w-xl gap-px overflow-hidden rounded-xl border border-gray-600 bg-gray-600">
                    {FEATURES.map(({ icon: Icon, title, text }) => (
                        <li key={title} className="flex gap-4 bg-gray-800 p-5">
                            <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                            <div>
                                <p className="text-sm font-semibold text-gray-100">{title}</p>
                                <p className="mt-1 text-sm leading-relaxed text-gray-500">{text}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>
        </main>
    )
}
export default Layout
