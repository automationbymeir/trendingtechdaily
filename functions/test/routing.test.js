const express = require('express');
const request = require('supertest');

// Import the handler directly
const { handleArticleRouting } = require('../http/routing');

function buildApp() {
  const app = express();
  // Minimal app wiring to exercise the handler
  app.get('*', (req, res) => handleArticleRouting(req, res));
  return app;
}

describe('http/routing.handleArticleRouting', () => {
  test('serves article redirect HTML for valid two-segment path', async () => {
    const app = buildApp();
    const res = await request(app).get('/ai/openai-overview');
    expect(res.status).toBe(200);
    expect(res.text).toContain("sessionStorage.setItem('articleRouting'");
    expect(res.text).toContain("category: 'ai'");
    expect(res.text).toContain("slug: 'openai-overview'");
    expect(res.text).toContain('/article.html');
  });

  test('returns 404 for invalid slugs', async () => {
    const app = buildApp();
    const res = await request(app).get('/AI/Invalid@@slug');
    expect(res.status).toBe(404);
  });

  test('returns 404 for non two/one-segment paths', async () => {
    const app = buildApp();
    const res = await request(app).get('/a/b/c');
    expect(res.status).toBe(404);
  });
});

