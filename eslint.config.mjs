import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default [
  {
    ignores: ['extensions/gmail/dist/**', 'extensions/gmail/node_modules/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];
