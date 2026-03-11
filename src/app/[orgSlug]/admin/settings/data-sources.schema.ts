import { z } from 'zod'

const dataSourceFieldsSchema = z.object({
    name: z.string().nonempty(),
    description: z.string().optional().or(z.literal('')),
    documentationUrl: z.string().url().optional().or(z.literal('')),
    codeEnvId: z.string().uuid(),
})

export const createOrgDataSourceSchema = dataSourceFieldsSchema

export const editOrgDataSourceSchema = dataSourceFieldsSchema
