import { SignedIn, SignedOut } from '@clerk/nextjs'
import { LoginOrSignup } from '@/components/login-or-signup'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import { db } from '@/database'
import { unstable_noStore as noStore } from 'next/cache'

async function getDB() {
    noStore()
    return await db.selectFrom('study').select('title').execute()
}

export default async function Home() {
    const studies = await getDB()
    return (
        <div className={pageStyles}>
            <SignedOut>
                <LoginOrSignup />
            </SignedOut>
            <SignedIn>
                <main className={mainStyles}>
                    Hello World, found {studies.length} records
                </main>
            </SignedIn>
            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
