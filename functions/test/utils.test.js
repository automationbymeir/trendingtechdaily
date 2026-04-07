const utils = require('../utils');

describe('utils.getSafe', () => {
  test('returns default when function throws', () => {
    const result = utils.getSafe(() => { throw new Error('boom'); }, 'fallback');
    expect(result).toBe('fallback');
  });

  test('returns provided value when defined', () => {
    const result = utils.getSafe(() => 'ok', 'fallback');
    expect(result).toBe('ok');
  });

  test('treats null/undefined as missing and returns default', () => {
    expect(utils.getSafe(() => null, 'fallback')).toBe('fallback');
    expect(utils.getSafe(() => undefined, 'fallback')).toBe('fallback');
  });
});

describe('utils.getStockMappingCacheDuration', () => {
  const HOUR = 60 * 60 * 1000;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns 72h on weekend (Sunday)', () => {
    // 2024-07-14 is a Sunday
    jest.setSystemTime(new Date('2024-07-14T12:00:00Z'));
    expect(utils.getStockMappingCacheDuration()).toBe(72 * HOUR);
  });

  test('returns 1h during US market hours (approx 13:30–20:00 UTC)', () => {
    jest.setSystemTime(new Date('2024-07-15T14:00:00Z')); // Monday 14:00 UTC
    expect(utils.getStockMappingCacheDuration()).toBe(1 * HOUR);
  });

  test('returns 24h outside market hours on weekdays', () => {
    jest.setSystemTime(new Date('2024-07-15T08:00:00Z')); // Monday 08:00 UTC
    expect(utils.getStockMappingCacheDuration()).toBe(24 * HOUR);
  });
});

