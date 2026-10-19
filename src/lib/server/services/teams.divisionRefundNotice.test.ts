import { describe, expect, it } from 'vitest';
import { divisionMoveRefundNotice } from './teams';

describe('divisionMoveRefundNotice', () => {
  it('sends item payers to the Payments tab to set a trade link', () => {
    const notice = divisionMoveRefundNotice({
      oldDivisionName: 'Invite',
      newDivisionName: 'Open',
      paidWithItems: true,
      steamId: '76561198000000000',
      teamId: 12,
    });

    expect(notice.url).toBe('/users/76561198000000000?tab=payments');
    expect(notice.message).toBe(
      'Your division was changed from Invite to Open. Since you paid with items for Invite, you may be entitled to a refund. Open the Payments tab on your profile and set your Steam trade offer link so an admin can process it.',
    );
  });

  it('keeps the contact-an-admin notice for other payment methods', () => {
    const notice = divisionMoveRefundNotice({
      oldDivisionName: 'Invite',
      newDivisionName: 'Unplaced',
      paidWithItems: false,
      steamId: '76561198000000000',
      teamId: 12,
    });

    expect(notice.url).toBe('/teams/12');
    expect(notice.message).toContain('Please contact an admin');
    expect(notice.message).not.toContain('trade offer link');
  });
});
