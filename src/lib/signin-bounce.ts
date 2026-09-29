// The proxy redirects to signin only when the server refused the session, so it marks that redirect
// and the signin page reads the mark rather than guessing why it was loaded (OTTER-745). This lives
// in its own module because the middleware and the client page both need it, and the middleware runs
// on the edge where importing page code is not an option.
export const BOUNCE_PARAM = 'bounce'
export const BOUNCE_VALUE = '1'
