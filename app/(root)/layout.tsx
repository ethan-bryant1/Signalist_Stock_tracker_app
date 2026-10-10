import Header from "@/components/Header";
import { LiveMarketProvider } from "@/components/LiveMarket";
import {getAuth} from "@/lib/better-auth/auth";
import {getMarketSnapshot} from "@/lib/actions/finnhub.actions";
import {headers} from "next/headers";
import {redirect} from "next/navigation";

const Layout = async ({ children }: { children : React.ReactNode }) => {
    // Read headers first so Next renders this per request instead of at build time
    const requestHeaders = await headers();
    const auth = await getAuth();
    const [session, snapshot] = await Promise.all([
        auth.api.getSession({ headers: requestHeaders }),
        getMarketSnapshot(),
    ]);

    if(!session?.user) redirect('/sign-in');

    const user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
    }

    // The header's market strip and the dashboard's index tiles share these live prices
    return (
        <LiveMarketProvider initial={snapshot}>
            <main className="min-h-screen text-gray-400">
                <Header user={user} />
                <div className="container py-10">
                    {children}
                </div>
            </main>
        </LiveMarketProvider>
    )
}
export default Layout
