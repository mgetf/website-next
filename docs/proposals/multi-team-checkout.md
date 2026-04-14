# RFC: Multi-Team Checkout Redesign

**Author:** Development Team
**Date:** March 31, 2026
**Status:** 📋 Proposed

---

## Summary

Redesign the checkout page to support paying for multiple league participations (1v1 and 2v2) in a single session. The new flow replaces the current single-team checkout with a unified view of all unpaid participations, explicit league fee line items, combined item payment support, and agreement checkboxes for commitment acknowledgment.

## Background

A user who had both a 1v1 entry and a 2v2 team accidentally paid the signup fee for the wrong format. The current checkout page is scoped to a single team via a `?teamId=` query parameter. When a user clicks "Pay Signup Fee", the link hardcodes the team ID of whichever page they're on. There is no unified view showing all pending payments, so a user navigating to the wrong team page pays for the wrong participation without realizing it.

Additionally, league fees are currently bundled invisibly into the total cost for first-time payers. Users see one lump sum with no breakdown of what they're paying for.

### Current flow

```
Team Page / Profile ──?teamId=X──▶ /checkout/[steamId]?teamId=X
                                         │
                                    Load single team
                                         │
                                    Select teammates (2v2)
                                         │
                                    Pay (signup + hidden league fee)
```

### Problems

1. **Wrong-team payment:** No safeguard against paying for the wrong participation when a user has multiple active teams/entries.
2. **Invisible league fees:** First-time payers are charged `signupCost + leagueFees` as a single amount. The league fee component is never shown.
3. **No commitment acknowledgment:** Checkout has no confirmation that fees are non-refundable or that the player commits to the season.
4. **Multiple checkout trips:** A user with both 1v1 and 2v2 must visit checkout separately for each.

## Proposed Design

### New checkout flow

```
Any entry point ──▶ /checkout/[steamId]  (no teamId param)
                          │
                    Load ALL unpaid participations
                          │
                    ┌──────────────────────────────────┐
                    │  Step 1: Select participations    │
                    │  ☑ 1v1 Open Division (S4, NA)     │
                    │  ☑ 2v2 Main Division (S4, NA)     │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │  Step 2: Per-team details         │
                    │  2v2 Main Division:               │
                    │    ☑ You ($5.00)                  │
                    │    ☑ Teammate ($5.00)             │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │  Step 3: Payment summary          │
                    │  1v1 Open signup fee    $5.00     │
                    │  2v2 Main signup fee ×2 $10.00    │
                    │  League fee (Season 4)  $2.00     │
                    │  ─────────────────────────────    │
                    │  Total                  $17.00    │
                    │                                   │
                    │  ☑ I agree to the league rulebook │
                    │  ☑ I understand fees are          │
                    │    non-refundable and commit      │
                    │    to the full season             │
                    │                                   │
                    │  [PayPal]  [Steam Items]          │
                    └──────────────────────────────────┘
```

### League fees: explicit and separate

- League fees remain charged **once per season** (first payment in a season, determined by `PaymentTracker`).
- They are displayed as a **separate line item** in the payment summary, not bundled into signup costs.
- The checkout UI clearly labels them: "League Fee (Season X): $Y.00".

### Agreement checkboxes

Two required checkboxes gate the payment buttons:

1. **Rulebook:** "I agree to follow the league rulebook" (links to `/rulebook`)
2. **Commitment:** "I understand that all fees are non-refundable. By completing this payment, I commit to participating for the full duration of the season."
3. **Confirmation** "I confirm that I'm paying for my participation in the [NA/EU/ASIA/SA] [1v1/2v2] season [N] league."

All must be checked before PayPal or item payment buttons become active.

## Technical Design

### Data model

New service function in `src/lib/server/services/payments.ts`:

```typescript
interface CheckoutParticipation {
  teamId: number;
  teamName: string;
  teamAvatar: string | null;
  formatName: string;
  formatId: number;
  divisionName: string;
  divisionId: number;
  regionName: string;
  seasonNum: number;
  seasonId: number;
  signupCost: number;
  currency: string;
  currencySymbol: string;
  unpaidPlayers: UnpaidPlayer[];
  itemPaymentConfig: {
    itemName: string;
    itemQuantity: number;
    itemAppId: number;
  } | null;
}

interface CheckoutData {
  participations: CheckoutParticipation[];
  leagueFees: number;
  isFirstPayment: boolean;
  leagueFeeSeasonId: number | null;
}
```

`getAllUnpaidParticipations(steamId)` replaces `getUserActiveTeamForCheckout`:

- Queries all `PlayerInTeam` rows where `active=1`, `paymentStatus=0`, team is in a paid division (`division.signupCost > 0`).
- Groups by format, includes division item payment configs, unpaid teammates for 2v2.
- Checks `PaymentTracker` to determine if league fees apply (first payment in season).

### PayPal: multi-team orders

**Create order** (`POST /api/paypal/create-order`):

- Accepts `teams: [{teamId, paidForSteamIds}]` array instead of single `teamId`.
- Total amount = sum of all signup costs across teams + league fee if applicable.
- `custom_id` format changes to `steamId|multi`.

**Capture order** (`POST /api/paypal/capture-order`):

- Accepts `teams` array in capture body.
- New `recordMultiTeamPayPalCapture()` function processes all teams in a single transaction:
  - Creates `Payment` and `PaymentTracker` entries per player per team.
  - League fee recorded as a separate `PaymentTracker` increment on the first team's season entry.
  - Updates `PlayerInTeam.paymentStatus` and `Team.paymentStatus` per team.

### Item payments: combined orders

**Schema change** — add nullable `checkoutTeams` column to `ItemPaymentOrder`:

```prisma
model ItemPaymentOrder {
  // ... existing fields ...
  checkoutTeams String? @map("checkout_teams")
  // JSON: [{teamId, paidForSteamIds, itemsRequired}]
}
```

When `checkoutTeams` is set, it takes precedence over the single `teamId`/`paidForSteamIds` fields (backward-compatible with existing orders).

**Constraint:** All selected teams must use the **same item type** (`itemName`, `itemAppId`). If different item types are configured across selected teams, the item payment method is disabled and a note explains why.

**New function** `createMultiTeamItemOrder(steamId, teams)`:

- Validates all teams use the same item type.
- `itemsRequired` = sum of `itemQuantity × players.length` per team.
- Stores `checkoutTeams` JSON on the order.
- `teamId` field = first team (for the required FK relation).

**Modified** `confirmItemPayment`: when `checkoutTeams` is present, iterates each team entry and processes payments for all.

### Entry point changes

Remove `?teamId=X` from all checkout links (6 files):

| File                                             | Links                                         |
| ------------------------------------------------ | --------------------------------------------- |
| `src/routes/teams/[id]/+page.svelte`             | 2 "Go to Checkout" / "Pay Signup Fee" buttons |
| `src/routes/users/[steamId]/+page.svelte`        | 2 "Go to Checkout" buttons (1v1 payment CTA)  |
| `src/routes/signup/1v1/+page.server.ts`          | Post-signup redirect                          |
| `src/routes/signup/2v2/create/+page.server.ts`   | Post-signup redirect                          |
| `src/routes/signup/2v2/existing/+page.server.ts` | Post-signup redirect                          |
| `src/routes/api/paypal/create-order/+server.ts`  | Return/cancel URLs (already omit teamId)      |

### Edge cases

- **Currency mismatch:** If participations span different regions with different currencies, only allow selecting participations with matching currencies. Show a note explaining the constraint.
- **Item type mismatch:** If selected teams have different item payment configs, disable item payment and show explanation.
- **Single participation:** Pre-select it automatically (same UX as today, minus the ambiguity).
- **No unpaid participations:** Redirect to home.
- **Mixed payment support:** Item method only available when ALL selected teams support the same item type. PayPal is always available for paid divisions.

## Files Changed

| Area               | Files                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| **Schema**         | `prisma/schema.prisma` (add `checkoutTeams` to `ItemPaymentOrder`)                                       |
| **Services**       | `src/lib/server/services/payments.ts` (new `getAllUnpaidParticipations`, `recordMultiTeamPayPalCapture`) |
| **Services**       | `src/lib/server/services/item-payments.ts` (new `createMultiTeamItemOrder`, modify `confirmItemPayment`) |
| **Checkout route** | `src/routes/checkout/[steamId]/+page.server.ts` (new load logic)                                         |
| **Checkout UI**    | `src/routes/checkout/[steamId]/+page.svelte` (full redesign)                                             |
| **Checkout UI**    | `src/routes/checkout/[steamId]/PaypalCheckout.svelte` (multi-team props)                                 |
| **Checkout UI**    | `src/routes/checkout/[steamId]/ItemPaymentCheckout.svelte` (multi-team props)                            |
| **PayPal API**     | `src/routes/api/paypal/create-order/+server.ts` (multi-team payload)                                     |
| **PayPal API**     | `src/routes/api/paypal/capture-order/+server.ts` (multi-team capture)                                    |
| **Link updates**   | 5 files with `?teamId=` checkout links                                                                   |

## Open Questions

1. **Should the checkout route change from `/checkout/[steamId]` to `/checkout`?** The `[steamId]` param is always the logged-in user. Removing it simplifies the URL but is a larger refactor of all references.
2. **League fee handling for item payments:** Currently item payments do not charge league fees (noted as an open question in the TF2 key payments proposal). Should multi-team item checkout include league fees as additional items, or should league fees remain PayPal-only?
3. **Bot API compatibility:** The bot currently confirms one order at a time via `POST /api/v1/item-payments/confirm`. The `checkoutTeams` approach keeps this as a single confirmation call. Verify the bot does not need changes.
