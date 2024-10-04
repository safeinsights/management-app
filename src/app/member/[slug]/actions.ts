'use server'

import { FormSchemaType, schema } from './schema'

export const onSubmitAction = async (data: FormSchemaType) => {
    schema.parse(data)

    const loggedContent = `entered name: ${data.title}`

    return loggedContent
}
