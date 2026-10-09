import Link from "next/link";
import Image from "next/image";
import {getAuth} from "@/lib/better-auth/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {Star} from "lucide-react";
import Logo from "@/components/Logo";

const Layout = async ({ children }: { children : React.ReactNode }) => {
    // Read headers first so Next renders this per request instead of at build time
    const requestHeaders = await headers();
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: requestHeaders })

    if(session?.user) redirect('/')

    return (
        <main className="auth-layout">
            <section className="auth-left-section scrollbar-hide-default">
                <Link href="/" className="auth-logo">
                    <Logo className="h-16" />
                </Link>

                <div className="pb-6 lg:pb-8 flex-1">{children}</div>
            </section>

            <section className="auth-right-section">
                <div className="z-10 relative lg:mt-4 lg:mb-16">
                    <blockquote className="auth-blockquote">
                        Loops Watch turned my watchlist into a winning list. The alerts are spot-on, and I feel more confident making moves in the market
                    </blockquote>
                    <div className="flex items-center justify-between">
                        <div>
                            <cite className="auth-testimonial-author">- Ethan R.</cite>
                            <p className="max-md:text-xs text-gray-500">Retail Investor</p>
                        </div>
                        {/* Drawn as icons so the stars follow the theme's text color */}
                        <div className="flex items-center gap-0.5" role="img" aria-label="Rated 5 out of 5 stars">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <Star key={star} aria-hidden className="w-5 h-5 fill-current text-gray-400" />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex-1 relative">
                    <Image src="/assets/images/loops-dashboard.png" alt="Dashboard Preview" width={1440} height={1150} className="auth-dashboard-preview absolute top-0" />
                </div>
            </section>
        </main>
    )
}
export default Layout
