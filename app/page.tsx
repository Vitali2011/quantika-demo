import { ConnectGmailButton } from '@/components/connect-gmail-button';
import { Lock } from 'lucide-react';

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">QUANTIKA</h1>
          <h2 className="text-3xl font-bold tracking-tight">
            See how AI handles your<br />freight email in 2 minutes
          </h2>
          <p className="text-muted-foreground">
            Connect your Gmail — get instant analysis of rate requests, negotiations, and unanswered quotes.
          </p>
        </div>

        <ConnectGmailButton />

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span>Read-only access. We never send emails from your account. Your data is deleted after the demo.</span>
        </div>
      </div>
    </main>
  );
}
