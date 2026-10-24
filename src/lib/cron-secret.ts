import { createHmac } from 'node:crypto'
import { purposeKey } from './crypto'

// Shared by instrumentation (which calls the tick route) and the route.
export const cronSecret = () => createHmac('sha256', purposeKey('cron')).update('tick').digest('hex')
