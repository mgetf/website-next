import { describe, expect, it } from 'vitest';
import { isUngatedRoute, UNGATED_ROUTES } from './environment';

describe('isUngatedRoute', () => {
  it('allows auth routes needed for login', () => {
    for (const route of UNGATED_ROUTES) {
      expect(isUngatedRoute(route)).toBe(true);
      expect(isUngatedRoute(`${route}/extra`)).toBe(true);
    }
  });

  it('gates normal application routes', () => {
    expect(isUngatedRoute('/')).toBe(false);
    expect(isUngatedRoute('/admin/users')).toBe(false);
    expect(isUngatedRoute('/api/paypal/create-order')).toBe(false);
  });
});
