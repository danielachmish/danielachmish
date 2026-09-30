import next from "eslint-config-next";

export default [
  { ignores: ["src/generated/**", ".next/**", "node_modules/**", "playwright-report/**", "test-results/**"] },
  ...next,
];
