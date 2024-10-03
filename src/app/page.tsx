import { SignedIn, SignedOut } from "@clerk/nextjs"
import { LoginOrSignup } from "@/components/login-or-signup"
import { footerStyles, mainStyles, pageStyles } from './page.css'

export default function Home() {
    return (
        <div className={pageStyles}>
            <SignedOut>
                <LoginOrSignup />
            </SignedOut>
            <SignedIn>
                <main className={mainStyles}>Hello World</main>
                <footer className={footerStyles}>A SafeInsights production</footer>
            </SignedIn>
        </div>
    )
}
