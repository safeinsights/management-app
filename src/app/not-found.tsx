import type { Metadata } from 'next'
import { NotFoundView } from './not-found-view'

// Next reads metadata from this file directly, so the 404 screen retitles the tab like a page.
export const metadata: Metadata = { title: 'Page not found' }

export default function NotFound() {
    return <NotFoundView />
}
