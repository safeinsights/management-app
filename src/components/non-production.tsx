'use server'

import { PROD_ENV, STAGING_ENV } from '@/server/config'
import { ReactNode } from 'react'


export async function NonProduction({ children }: { children: ReactNode}) {
    if (PROD_ENV || STAGING_ENV) return null

    return children
}
