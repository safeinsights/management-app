// Lambda needs a .js/.mjs handler file; Node strips the types from the .ts modules it imports.
export { handler } from './handler.ts'
