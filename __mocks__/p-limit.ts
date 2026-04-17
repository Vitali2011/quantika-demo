/**
 * CJS shim for p-limit (ESM-only package) — used by Jest only.
 * Executes tasks immediately without any concurrency cap; production code
 * runs the real p-limit via Next.js / Node ESM loader.
 */
const pLimit = (_concurrency) => {
  return (fn) => Promise.resolve(fn());
};

module.exports = pLimit;
module.exports.default = pLimit;
