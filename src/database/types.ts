

export interface Database {
    'information_schema.tables': SchemaTable
}

export interface SchemaTable {

    table_name: string
    table_type: string

}
