import { createHmac } from 'node:crypto'

// Shared by instrumentation (which calls the tick route) and the route.
export const cronSecret = () => createHmac('sha256', `cron:${process.env.KHMA_ENCRYPTION_KEY}`).update('tick').digest('hex')
