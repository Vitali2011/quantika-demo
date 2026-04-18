// Barrel re-exporter — all prompt constants live in lib/prompts/<domain>.ts
// Adding a new freight type: create lib/prompts/<domain>.ts and add a line below.
export * from './prompts/glossary';
export * from './prompts/classify';
export * from './prompts/parse-cargo';
export * from './prompts/parse-vessel';
export * from './prompts/parse-recap';
export * from './prompts/match';
export * from './prompts/recap';
export * from './prompts/draft';
