const express = require('express');
const request = require('supertest');

// Silent logger for tests
const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

function createDbMock({ empty }) {
  const chain = {
    where: jest.fn(function () { return this; }),
    limit: jest.fn(function () { return this; }),
    get: jest.fn(async () => ({ empty })),
  };
  return {
    collection: jest.fn(() => chain),
  };
}

function buildApp(handler) {
  const app = express();
  app.get('*', (req, res) => handler(req, res));
  return app;
}

describe('http/routing.handleDynamicRouting', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('returns 200 and HTML for valid category slug', async () => {
    jest.doMock('../config', () => ({ logger, db: createDbMock({ empty: false }) }));
    const { handleDynamicRouting } = require('../http/routing');
    const app = buildApp(handleDynamicRouting);

    const res = await request(app).get('/ai');
    expect(res.status).toBe(200);
    expect(res.text).toContain("sessionStorage.setItem('categoryRouting'");
    expect(res.text).toContain("window.location.replace('/category.html')");
  });

  test('returns 404 for invalid slug characters', async () => {
    jest.doMock('../config', () => ({ logger, db: createDbMock({ empty: false }) }));
    const { handleDynamicRouting } = require('../http/routing');
    const app = buildApp(handleDynamicRouting);

    const res = await request(app).get('/A!');
    expect(res.status).toBe(404);
  });

  test('returns 404 when category not found', async () => {
    jest.doMock('../config', () => ({ logger, db: createDbMock({ empty: true }) }));
    const { handleDynamicRouting } = require('../http/routing');
    const app = buildApp(handleDynamicRouting);

    const res = await request(app).get('/unknown');
    expect(res.status).toBe(404);
  });
});

