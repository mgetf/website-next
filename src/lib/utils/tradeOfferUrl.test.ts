import { describe, expect, it } from 'vitest';
import { canonicalTradeOfferUrl } from './tradeOfferUrl';

describe('canonicalTradeOfferUrl', () => {
  it('accepts a steam trade offer link and drops extra params', () => {
    expect(
      canonicalTradeOfferUrl(
        'https://steamcommunity.com/tradeoffer/new/?partner=12345&token=AbCd_ef-9&l=english',
      ),
    ).toBe('https://steamcommunity.com/tradeoffer/new/?partner=12345&token=AbCd_ef-9');
  });

  it('rejects other hosts and missing tokens', () => {
    expect(canonicalTradeOfferUrl('https://example.com/tradeoffer/new/?partner=1&token=abc')).toBe(
      null,
    );
    expect(canonicalTradeOfferUrl('https://steamcommunity.com/tradeoffer/new/?partner=1')).toBe(
      null,
    );
    expect(canonicalTradeOfferUrl('')).toBe(null);
  });
});
