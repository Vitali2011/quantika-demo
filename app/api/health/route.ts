import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getSessionCount } from '@/lib/session';

export const dynamic = 'force-dynamic';

const VERSION = '0.1.0';
const FULL_SHA = /^[0-9a-f]{40}$/;

function getGitSha(): string {
  const configured = process.env.APP_GIT_SHA;
  if (configured !== undefined) {
    const sha = configured.trim();
    return FULL_SHA.test(sha) ? sha : 'unknown';
  }

  try {
    const sha = readFileSync(path.join(process.cwd(), '.deploy-sha'), 'utf8').trim();
    return FULL_SHA.test(sha) ? sha : 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const sessions = getSessionCount();
    const uptime = Math.round(process.uptime() * 100) / 100;

    return NextResponse.json(
      { status: 'ok', sessions, uptime, version: VERSION, git_sha: getGitSha() },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
