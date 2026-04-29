import { z } from 'zod'

const dataSourceDocumentSchema = z.object({
    id: z.uuid().optional(),
    url: z.url(),
    description: z.string().trim().nonempty(),
})

const dataSourceFieldsSchema = z.object({
    name: z.string().nonempty(),
    description: z.string().optional().or(z.literal('')),
    documents: z.array(dataSourceDocumentSchema),
})

const newDocumentFieldsSchema = z.object({
    newDocumentUrl: z.string(),
    newDocumentDescription: z.string(),
})

export const createOrgDataSourceSchema = dataSourceFieldsSchema

export const editOrgDataSourceSchema = dataSourceFieldsSchema

export const dataSourceFormSchema = z.object({
    ...dataSourceFieldsSchema.shape,
    ...newDocumentFieldsSchema.shape,
})
