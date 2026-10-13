import Link from "next/link";
import Image from "next/image";
import {getSession} from "@/lib/better-auth/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import Logo from "@/components/Logo";

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

            <section className="auth-right-section">
                <div className="z-10 relative lg:mt-4 lg:mb-16">
                    {/* What the app does, stated plainly: no testimonials or features it doesn't have */}
                    <p className="auth-blockquote">
                        A private market workstation: heatmaps, research and watchlists on free data, with every price labeled by its source and age.
                    </p>
                    <p className="max-md:text-xs text-gray-500">For the owner&apos;s personal use</p>
                </div>

                <div className="flex-1 relative">
                    <Image src="/assets/images/loops-dashboard.png" alt="Dashboard Preview" width={1440} height={1150} className="auth-dashboard-preview absolute top-0" />
                </div>
            </section>
        </main>
    )
}
export default Layout
