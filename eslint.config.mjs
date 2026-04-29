import coreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: ['node_modules/**', '.next/**', '.wave/**', '.claude/**', 'extensions/**', 'coverage/**', 'playwright-report/**'],
  },
  ...coreWebVitals,
  {
    rules: {
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
];

export default config;
