export const SMOKE_ENV = {
  baseUrl: process.env.SMOKE_BASE_URL || 'http://localhost:3000',
  isProd: !!process.env.SMOKE_BASE_URL?.includes('demo.quantika.org'),
  isCI: !!process.env.CI,
};
