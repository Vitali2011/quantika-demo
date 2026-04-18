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
