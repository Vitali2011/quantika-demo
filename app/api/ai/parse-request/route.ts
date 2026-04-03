/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { RATE_REQUEST_PARSER_SYSTEM_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { ParsedRequest, CargoType } from '@/lib/types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });
  
  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  
  // Find all RATE_REQUEST emails
  const rateRequestIds = session.classifications
    .filter(c => c.category === 'RATE_REQUEST')
    .map(c => c.emailId);
  
  const rateRequestEmails = session.emails.filter(e => rateRequestIds.includes(e.id));
  
  if (rateRequestEmails.length === 0) {
    updateSession(sessionId, { parsedRequests: [] });
    return NextResponse.json({ count: 0 });
  }
  
  // Parse each rate request email
  const parsedRequests: ParsedRequest[] = [];
  
  for (const email of rateRequestEmails) {
    const userPrompt = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;
    
    const result = await callAiJson<any>(
      userPrompt,
      RATE_REQUEST_PARSER_SYSTEM_PROMPT,
      AI_MODEL_LIGHT,
      {}
    );
    
    parsedRequests.push({
      emailId: email.id,
      originPort: result.origin_port || null,
      originCountry: result.origin_country || null,
      destinationPort: result.destination_port || null,
      destinationCountry: result.destination_country || null,
      cargoDescription: result.cargo_description || null,
      weightMt: result.weight_mt || null,
      volumeCbm: result.volume_cbm || null,
      dimensions: result.dimensions || null,
      cargoType: (result.cargo_type as CargoType) || 'OTHER',
      containerType: result.container_type || null,
      quantity: result.quantity || null,
      incoterms: result.incoterms || null,
      preferredDates: result.preferred_dates || null,
      specialRequirements: result.special_requirements || null,
      missingInfo: Array.isArray(result.missing_info) ? result.missing_info : [],
    });
  }
  
  updateSession(sessionId, { parsedRequests });
  return NextResponse.json({ count: parsedRequests.length });
}
