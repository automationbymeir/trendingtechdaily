module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  ignorePatterns: [
    "mcp-demo/**", // Ignore the mcp-demo directory
  ],
  parserOptions: {
    ecmaVersion: 2022, // Updated to support top-level await
    sourceType: "module",
  },
  extends: [
    "eslint:recommended",
  ],
  rules: {
    // Disable rules that are causing problems
    "indent": "off",
    "quotes": "off",
    "no-trailing-spaces": "off",
    "arrow-parens": "off",
    "max-len": "off",
    "require-jsdoc": "off",
    "comma-dangle": "off",
    "no-undef": "warn",
    "no-unused-vars": "off",
    "no-console": "off",
    "object-curly-spacing": "off",
    "space-before-function-paren": "off",
    "prefer-const": "warn",
    "no-var": "error",
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {
    CONFIG: "writable",
  },
};