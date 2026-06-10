import { buildQuotePrompt } from '@/lib/quote-jobs/prompt';

const cargo = { emailId: 'e1', cargoType: 'grain', cargoDescription: 'wheat in bulk' };
const email = { id: 'e1', from: 'broker@acme.com', fromName: 'Jane Broker', subject: 'Wheat fixture', body: 'Need a quote' };

it('builds a system + user prompt addressed to the resolved sender', async () => {
  const { system, user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(system).toContain('freight quote writer'); // from DRAFT_QUOTE_SYSTEM_PROMPT
  expect(user).toContain('Jane Broker'); // resolveSenderName output
});

it('user prompt matches frozen template — guards against route divergence', async () => {
  const { user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(user).toMatchInlineSnapshot(`
"
Parsed cargo inquiry data:
{
  "emailId": "e1",
  "cargoType": "grain",
  "cargoDescription": "wheat in bulk"
}

Original email:
From: broker@acme.com
Subject: Wheat fixture
Body: Need a quote

Address the reply to: Jane Broker

Generate a professional draft quote email."
`);
});

it('omits RAG context when ragEnabled is false', async () => {
  const { system } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(system).not.toContain('IMSBC Cargo Safety Context');
});
