import { z } from 'zod';

export const DraftQuoteBodySchema = z.object({
  emailId: z.string().min(1),
});

export type DraftQuoteBody = z.infer<typeof DraftQuoteBodySchema>;

export const DraftReplyBodySchema = z.union([
  z.object({ emailId: z.string().min(1) }),
  z.object({ pendingItems: z.unknown() }).refine(
    (d) => 'pendingItems' in d,
    { message: 'pendingItems is required' }
  ),
]);

export type DraftReplyBody = z.infer<typeof DraftReplyBodySchema>;

export const ExplainDealBodySchema = z.object({
  /** Index into session.matches[] */
  matchIndex: z.number().int().min(0),
  /** Language hint: "en" (default) or "ar" for Arabic */
  language: z.enum(['en', 'ar']).optional().default('en'),
});

export type ExplainDealBody = z.infer<typeof ExplainDealBodySchema>;
