import { redirect } from 'next/navigation'

// Home: the dashboard, with what to set up next for a new account.

export default function AppHome() {
  redirect('/app/dashboard')
}
