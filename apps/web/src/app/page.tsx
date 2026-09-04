import { redirect } from 'next/navigation';

// middleware.ts already sends unauthenticated requests to /login before
// this ever renders — an authenticated visit to "/" just continues into
// the app. /home decides for itself whether that's /change-password
// (first sign-in) or the placeholder landing.
export default function Home() {
  redirect('/home');
}
