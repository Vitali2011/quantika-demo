'use client'

import { useEffect } from 'react'
import { ConnectGmailButton } from "@/components/connect-gmail-button";
import { Lock, Trash2, EyeOff } from "lucide-react";
import { initAnalytics, track } from "@/lib/analytics";

export function LandingPageClient() {
  useEffect(() => {
    initAnalytics()
    track('landing_viewed')
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">QUANTIKA</h1>
          <h2 className="text-3xl font-bold tracking-tight">
            See how AI handles your<br />freight email in 2 minutes
          </h2>
          <p className="text-muted-foreground">
            Connect your Gmail — get instant analysis of rate requests, vessel positions, fixture recaps, and cargo-vessel matching.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <ConnectGmailButton onClick={() => track('oauth_initiated')} />
          <form method="POST" action="/api/etms-demo" onSubmit={() => track('etms_demo_started')}>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-foreground text-background px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              ETMS Circulars
            </button>
          </form>
          <form method="POST" action="/api/sample" onSubmit={() => track('sample_started')}>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Try with Sample Data
            </button>
          </form>
        </div>

        <div className="rounded-lg border bg-gray-50 p-5 text-left space-y-3">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Read-only access</p>
              <p className="text-xs text-muted-foreground">We CANNOT send emails from your account</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Trash2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Data deleted after session</p>
              <p className="text-xs text-muted-foreground">Your data is processed in memory and deleted automatically</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <EyeOff className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">No storage</p>
              <p className="text-xs text-muted-foreground">We don&apos;t store your emails, rates, or client contacts</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
