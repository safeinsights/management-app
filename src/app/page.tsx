import { SignedIn, SignedOut } from "@clerk/nextjs"
import { LoginOrSignup } from "@/components/login-or-signup"
import { footerStyles, mainStyles, pageStyles } from './page.css'
import { NavAuthMenu } from "@/components/nav-auth-menu"

export default function Home() {
    return (
        <div className={pageStyles}>
            <SignedOut>
                <LoginOrSignup />
            </SignedOut>
            <SignedIn>
                <main className={mainStyles}>
                    <p>Hello World</p>
                    <NavAuthMenu />
                </main>
                <footer className={footerStyles}>A SafeInsights production</footer>
            </SignedIn>
        </div>
    )
}
