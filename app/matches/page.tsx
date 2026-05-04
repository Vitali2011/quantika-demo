import { redirect } from 'next/navigation';

/**
 * γ-cleanup-4 F3: /matches list page is not implemented (only /match/[id]).
 * Users hitting /matches directly are redirected to /dashboard where
 * they can find Top Priorities → matches via the action panel.
 */
export default function MatchesRedirect(): never {
  redirect('/dashboard');
}
