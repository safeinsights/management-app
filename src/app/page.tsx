import { footerStyles, mainStyles, pageStyles } from './page.css'
import { db } from '@/database'

async function getDB() {
    try {
        return await db.selectFrom('information_schema.tables').selectAll().execute()
    } catch (error) {
        console.warn(error)
        return 'Error getting users'
    }
}

export default async function Home() {
    const recs = await getDB()

    return (
        <div className={pageStyles}>
            <main className={mainStyles}>Hello World, found {recs.length} records</main>
            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
