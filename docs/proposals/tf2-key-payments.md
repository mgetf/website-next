# RFC: Steam Item Payments via Trading Bot

**Author:** Development Team
**Date:** March 14, 2026
**Status:** 📋 Draft

---

## Summary

Add Steam item trading as an alternative payment method for league signups. Each division can configure its own item payment option (e.g., "3 TF2 keys", "5 Refined Metal", or any tradeable Steam item). A standalone Steam trading bot hosted on Railway receives item trades from users and communicates with the mge.tf website to confirm payments. The website gets a unified payment history page so users can see all their payments (PayPal and Steam items) in one place.

## Background

Currently, mge.tf only accepts PayPal for paid divisions. Many TF2 players prefer paying with in-game items — particularly keys, which have a well-understood market value. Adding item payments lowers the barrier to entry for players who don't have PayPal or prefer not to use it.

The system is designed to be item-agnostic: admins configure which Steam item and how many are required per division, so the bot isn't hardcoded to TF2 keys only.

## Architecture

```
┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│  User on     │  HTTPS  │  mge.tf Website  │  HTTPS  │  Steam Bot   │
│  Checkout    │────────▶│  (SvelteKit)     │◀───────▶│  (Bun/Node)  │
│  Page        │         │                  │         │  Railway      │
└──────────────┘         └──────────────────┘         └──────┬───────┘
                                                             │ Steam
                                                             │ Protocol
                                                        ┌────▼────┐
                                                        │  Steam  │
                                                        │  Network│
                                                        └─────────┘
```

**Communication model:** Bot → Website only (one-directional). The bot calls the website's `/api/v1/*` endpoints to check pending orders and confirm payments, authenticating with the existing API key system (`Authorization: Bearer mge_...`). The website never calls the bot.

Bot connection info (trade URL, Steam profile) is stored in the website's database settings so the checkout page can display it without needing to contact the bot.

## Payment Flow

### User-Initiated Trade (user sends items to bot)

1. User reaches checkout page, chooses "Pay with Items" (e.g., "Pay with TF2 Keys")
2. Website creates an **ItemPaymentOrder** (numbered, e.g. `IP-00042`) and shows:
   - The bot's Steam Trade Offer URL (stored in site settings)
   - The bot's Steam account name/profile link (so user can verify it's legit)
   - What item and how many to send (from the division's config)
   - Instructions: "Send exactly X [item name] to this trade offer link"
3. User sends a trade offer to the bot containing the required items
4. Bot receives the incoming trade offer, checks:
   - Is the sender's Steam ID associated with a pending `ItemPaymentOrder`? (bot calls website API to check)
   - Does the offer contain **exactly** the required items matching the order's item type and quantity?
   - Does the offer NOT request any items from the bot? (one-directional: user → bot)
5. If valid: bot accepts the trade, then calls website API `POST /api/item-payments/confirm`
6. If invalid: bot declines the trade offer
7. Website records the payment using existing `Payment` + `PaymentTracker` infrastructure
8. User sees payment confirmed on checkout page (via polling) and gets redirected to team page

### Order Lifecycle

```
PENDING  →  COMPLETED   (trade accepted, payment confirmed)
         →  EXPIRED     (user didn't send trade within timeout)
         →  CANCELLED   (user cancelled from checkout page)
```

## Item Pricing (per division)

Instead of a single global key value, each division can optionally configure an **item payment option**. This is a generic system — not hardcoded to TF2 keys.

Admin configures per division:
- **Item name** — Display name (e.g., "Mann Co. Supply Crate Key", "Refined Metal")
- **Item app ID** — Steam app ID for validation (e.g., `440` for TF2)
- **Item market hash name** — Steam market identifier for exact item matching
- **Quantity required** — How many of this item to pay (e.g., `3`)

If a division has no item payment configured, only PayPal is available (current behavior). If both are configured, the user picks which method to use at checkout.

## Database Changes

### New Model: `DivisionItemPayment`

Configures what Steam item a division accepts as payment.

```prisma
model DivisionItemPayment {
  id                 Int      @id @default(autoincrement())
  divisionId         Int      @unique @map("division_id")
  itemName           String   @map("item_name")
  itemAppId          Int      @map("item_app_id")
  itemMarketHashName String   @map("item_market_hash_name")
  itemQuantity       Int      @map("item_quantity")

  division           Division @relation(fields: [divisionId], references: [id])

  @@map("division_item_payments")
}
```

Example rows:
| divisionId | itemName | itemAppId | itemMarketHashName | itemQuantity |
|---|---|---|---|---|
| 1 | Mann Co. Supply Crate Key | 440 | Mann Co. Supply Crate Key | 3 |
| 2 | Mann Co. Supply Crate Key | 440 | Mann Co. Supply Crate Key | 5 |
| 3 | Refined Metal | 440 | Refined Metal | 10 |

### New Model: `ItemPaymentOrder`

Tracks individual item payment orders with sequential numbering.

```prisma
model ItemPaymentOrder {
  id              Int                  @id @default(autoincrement())
  orderNumber     String               @unique @map("order_number")
  playerSteamId   String               @map("player_steam_id")
  teamId          Int                  @map("team_id")
  seasonId        Int                  @map("season_id")
  itemName        String               @map("item_name")
  itemAppId       Int                  @map("item_app_id")
  itemMarketHashName String            @map("item_market_hash_name")
  itemsRequired   Int                  @map("items_required")
  itemsReceived   Int                  @default(0) @map("items_received")
  status          ItemPaymentStatus    @default(PENDING)
  tradeOfferId    String?              @map("trade_offer_id")
  createdAt       DateTime             @default(now()) @map("created_at")
  completedAt     DateTime?            @map("completed_at")
  expiresAt       DateTime             @map("expires_at")

  player          User                 @relation(fields: [playerSteamId], references: [steamId])
  team            Team                 @relation(fields: [teamId], references: [id])
  season          Season               @relation(fields: [seasonId], references: [id])

  @@map("item_payment_orders")
}

enum ItemPaymentStatus {
  PENDING
  COMPLETED
  EXPIRED
  CANCELLED
}
```

### New fields in `Global`

```prisma
model Global {
  id                   Int     @id @default(autoincrement())
  leagueFees           Int     @default(0) @map("league_fees")
  botTradeOfferUrl     String? @map("bot_trade_offer_url")
  botSteamProfileUrl   String? @map("bot_steam_profile_url")
  botDisplayName       String? @map("bot_display_name")

  @@map("global")
}
```

### Existing Models (no structural changes)

- `Payment` — item payments recorded here with `paymentId` set to the Steam trade offer ID and `description` like `"Item payment - 3x Mann Co. Supply Crate Key (Order IP-00042)"`
- `PaymentTracker` — cumulative amount tracking works as-is (item payment value = division's `signupCost`)
- `PlayerInTeam.paymentStatus` — flipped to `1` on successful item payment, same as PayPal

## Steam Bot (new project)

### Tech Stack

| Technology | Purpose |
|---|---|
| Bun (Node fallback) | Runtime & package manager |
| TypeScript | Type safety |
| steam-user | Steam client login, session, presence |
| steam-tradeoffer-manager | Trade offer lifecycle |
| steamcommunity | Session management, trade confirmations |
| steam-totp | Steam Guard 2FA code generation |
| Pino | Logging |
| Zod | Env var and request validation |
| Biome | Linter & formatter |

No HTTP server needed on the bot. Communication is one-directional: the bot calls the website's API. Railway health checks can use the process's TCP listener from `steam-user` or a minimal HTTP endpoint if required.

### Project Structure

```
steam-bot/
├── src/
│   ├── index.ts                # Entry point: login, graceful shutdown
│   ├── env.ts                  # Zod-validated environment variables
│   ├── bot.ts                  # SteamUser + TradeOfferManager setup, session persistence
│   ├── services/
│   │   ├── trades.ts           # Incoming trade offer validation + acceptance
│   │   ├── items.ts            # Steam item identification and matching
│   │   └── website.ts          # HTTP client to call mge.tf API endpoints
│   └── utils/
│       ├── logger.ts           # Pino logger
│       └── steam-guard.ts      # TOTP helper using steam-totp
├── steam-data/                 # Session persistence directory (gitignored)
├── package.json
├── tsconfig.json
├── biome.jsonc
├── Dockerfile
├── railway.json
└── .env.example
```

### Environment Variables

```
STEAM_ACCOUNT_NAME=
STEAM_PASSWORD=
STEAM_SHARED_SECRET=
STEAM_IDENTITY_SECRET=
MGE_API_URL=                  # e.g. https://mge.tf
MGE_API_KEY=                  # API key generated in Admin → Site → API Keys (mge_...)
LOG_LEVEL=info
```

Uses the same API key system as the Discord bot — generate a key from the admin panel, store it here.

### Trade Validation Rules

The bot only accepts a trade offer if ALL of these are true:

1. The sender's Steam ID has an `ItemPaymentOrder` with status `PENDING` on the website (bot checks via API)
2. The offer contains **only** items matching the order's `itemAppId` and `itemMarketHashName`
3. The item count matches the `itemsRequired` on the pending order exactly
4. The offer does not request any items from the bot (one-directional: user → bot)
5. The order has not expired

Any offer that fails validation is declined automatically.

### Session Persistence

```typescript
const client = new SteamUser({
  dataDirectory: './steam-data',
  autoRelogin: true,
});
```

Saves login keys and sentry files to disk so restarts don't trigger fresh logins, avoiding Steam's login rate limits.

## Website Changes (mge.tf)

### New API Endpoints

All bot-facing endpoints live under `/api/v1/` and are authenticated with the existing API key system via `requireApiKey(request)` — same as the Discord bot endpoints.

#### `POST /api/v1/item-payments/confirm`
Called by bot after accepting a valid trade.

```typescript
// Request (from bot, authenticated via requireApiKey)
{
  orderNumber: string;       // "IP-00042"
  tradeOfferId: string;      // Steam trade offer ID
  itemsReceived: number;     // Number of items received
  senderSteamId: string;     // Sender's Steam ID (cross-check)
}

// Response
{ success: boolean; error?: string }
```

Internally: validates the order exists and is PENDING, then runs the same payment recording logic as PayPal capture (PaymentTracker upsert, Payment create, paymentStatus update, team payment status check).

#### `GET /api/v1/item-payments/pending/:steamId`
Called by bot to check if a Steam user has a pending item payment order.

```typescript
// Response
{
  hasPending: boolean;
  order?: {
    orderNumber: string;
    itemAppId: number;
    itemMarketHashName: string;
    itemsRequired: number;
    teamId: number;
    expiresAt: string;
  }
}
```

No bot-info endpoint needed — the bot's trade URL, profile URL, and display name are stored in the `Global` settings table and rendered directly by the checkout page.

### Audit Logging

All item payment operations are logged through the existing `logAudit()` system under the `PAYMENT` category. New actions to add to `AuditAction`:

| Action | Trigger | Metadata |
|---|---|---|
| `ITEM_ORDER_CREATED` | User creates an item payment order on checkout | `{ orderNumber, teamId, itemName, itemsRequired }` |
| `ITEM_ORDER_CANCELLED` | User cancels their pending order | `{ orderNumber, teamId }` |
| `ITEM_ORDER_EXPIRED` | Order expired without trade | `{ orderNumber, teamId }` |
| `ITEM_PAYMENT_CONFIRMED` | Bot confirms successful trade via API | `{ orderNumber, tradeOfferId, itemName, itemsReceived, steamId }` |
| `ITEM_PAYMENT_DECLINED` | Bot declined an invalid trade (logged by bot via API, optional) | `{ tradeOfferId, senderSteamId, reason }` |

The `ITEM_PAYMENT_CONFIRMED` action is the item-payment equivalent of the existing `PAYMENT_CAPTURED` used for PayPal. The actor for bot-originated events is `null` (system/service action) since the bot authenticates via API key, not a user session.

Existing `PAYMENT_CAPTURED` and `PAYMENT_FAILED` remain unchanged for PayPal flows.

### Checkout Page Changes

The checkout page (`/checkout/[steamId]`) gets a payment method selector:

1. **PayPal** — existing flow, unchanged
2. **Steam Items** — new flow (only shown if the division has a `DivisionItemPayment` configured):
   - Shows item name and quantity required (from division config)
   - "Create Item Payment Order" button
   - After order created: shows bot's trade offer URL (from Global settings), order number, item instructions
   - Polls `ItemPaymentOrder` status every few seconds
   - On completion: redirects to team page with success message

### Payment History Page (new)

New route: `/users/[steamId]/payments` (or tab on existing user profile page)

Shows all payments for the authenticated user:
- PayPal payments (from `Payment` table where `purchasedBy = steamId`)
- Item payments (from `ItemPaymentOrder` where `playerSteamId = steamId`)
- Sortable by date, filterable by type
- Shows: order number/payment ID, date, amount/items, method (PayPal/Items), team, status

### Admin Changes

- Per-division item payment configuration (item name, app ID, market hash name, quantity)
- Bot settings in global config: trade offer URL, Steam profile URL, display name
- Item payment orders visible in admin panel for support/debugging

## Security

| Concern | Mitigation |
|---|---|
| Bot → Website auth | Existing mge.tf API key system (`Authorization: Bearer mge_...`) via `requireApiKey()` |
| Item spoofing | Bot validates items by `appid` and `market_hash_name` matching the pending order |
| Wrong item count | Bot only accepts exact match to pending order's `itemsRequired` |
| Wrong item type | Bot checks each item against the order's `itemAppId` + `itemMarketHashName` |
| No pending order | Bot declines any offer from a Steam ID without a PENDING order |
| Replay attacks | Orders are single-use; once COMPLETED, same order can't be confirmed twice |
| Order expiration | Orders expire after a configurable timeout (e.g. 30 minutes) |
| Bot impersonation | Checkout page displays the bot's verified Steam profile URL so users can confirm |

## Error Handling

| Scenario | Handling |
|---|---|
| User sends wrong number of items | Bot declines trade, order stays PENDING, user can retry |
| User sends wrong item type | Bot declines trade |
| User doesn't send trade in time | Cron/scheduled check marks order as EXPIRED |
| Bot is offline | Website hides item payment option or shows "temporarily unavailable", PayPal still works |
| Bot restarts mid-trade | On startup, re-poll all active trade offers to catch any accepted during downtime |
| Steam is down | Bot queues confirmation, retries when reconnected |
| Website API is unreachable | Bot retries confirmation with exponential backoff |

## Development Phases

### Phase 1 — Bot Foundation
- New project setup (Bun, TypeScript, Biome, Zod env)
- Steam login with session persistence (`steam-data/`)
- Graceful shutdown (`client.logOff()` on SIGINT/SIGTERM)
- Dockerfile + Railway config

### Phase 2 — Trade Logic
- Listen for incoming trade offers via `steam-tradeoffer-manager`
- Validate incoming offers against pending orders (call website API)
- Accept valid trades, decline invalid ones
- Auto-confirm accepted trades via `identity_secret`
- Confirm payment to website API after acceptance

### Phase 3 — Website Integration
- `DivisionItemPayment` + `ItemPaymentOrder` models + migration
- Bot settings in Global + admin UI for per-division item payment config
- New API endpoints (`/api/item-payments/*`)
- Checkout page: payment method selector + item payment flow
- Order status polling on checkout page
- Payment recording (reuse existing PaymentTracker/Payment logic)

### Phase 4 — Payment History & Polish
- Payment history page for users
- Order expiration (scheduled cleanup or on-access check)
- Error recovery and retry logic
- Admin visibility into item payment orders
- Logging and monitoring

## Open Questions

1. **Config changes mid-order** — When admin changes a division's item config, do existing PENDING orders keep their original item/quantity or update?
2. **Partial payments** — If a user sends fewer items than required, decline and let them retry? Or accept partial and track remaining?
3. **Bot inventory management** — What happens when the bot accumulates hundreds of items? Manual withdrawal by admin? Auto-trade to a storage account?
4. **League fees via items** — With PayPal, first-time payers pay `signupCost + leagueFees`. For item payments, is the quantity just the division's configured amount (flat), or should league fees add extra items?
