import React from 'react'
import { MantineProvider } from '@mantine/core'
import { theme } from '../theme'
import { ModalsProvider } from '@mantine/modals'

// if using Clerk for authentication:
//    * add the Clerk keys to the .env file,
//    * uncomment the following import line
//      import { ClerkProvider } from "@clerk/nextjs";
//    * add the ClerkProvider component to the tree below

type Props = {
    children: React.ReactNode
}

export const Providers: React.FC<Props> = ({ children }) => {
    return (
        <MantineProvider theme={theme}>
            <ModalsProvider>{children}</ModalsProvider>
        </MantineProvider>
    )
}
