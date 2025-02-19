import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // Nathan note: I'm undecided if having the roles expressed as booleans on the tables is a good idea or not.
    //
    // In the past I've setup user and member role" tables with joins or even used PG enums with array columns
    // in order to keep the code flexible.
    //
    // both of those worked fine but in practice we never really ended up changing the roles very much
    // and never benifited from the flexibility.
    //
    // This time i decided to go the simplest method and we can move to joined tables later if/when we
    // need to change the roles often
    await db.schema
        .createTable('user')
        .addColumn('id', 'uuid', (col) => col.defaultTo(sql`v7uuid()`).primaryKey())
        .addColumn('clerk_id', 'text', (col) => col.notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('email', 'text', (col) => col.notNull())
        .addColumn('is_researcher', 'boolean', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    db.schema.createIndex('user_clerk_id_indx').on('user').column('clerk_id').unique().execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('user').execute()
}
