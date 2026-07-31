/**
 * Typed helpers for PaymentsModule over Rama REST JSON.
 *
 * @lintignore Spike payment helpers; production checkout still uses Postgres.
 */

import { RamaClient, ramaLong, type AckLevel } from './client';

export const PAYMENTS_MODULE = 'mge.tf.rama.payments-module/PaymentsModule';
export const PAYMENT_DEPOT = '*payment-depot';

export type PaymentAck = {
  ok: boolean;
  error?: string;
  steamId?: string;
  seasonId?: string;
  status?: string;
  orderId?: string;
  type?: string;
};

function asAck(topologyReturns: Record<string, unknown>): PaymentAck {
  const raw = topologyReturns['payments'];
  if (raw && typeof raw === 'object') return raw as PaymentAck;
  return { ok: false, error: 'missing-ack' };
}

function withLongs(event: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out = { ...event };
  for (const k of keys) {
    if (typeof out[k] === 'number') out[k] = ramaLong(out[k] as number);
  }
  return out;
}

export function createPaymentsClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: PAYMENTS_MODULE,
  });
}

export async function markPaid(
  client: RamaClient,
  event: {
    steamId: string;
    seasonId: string;
    teamId: string;
    status: 'PAID' | 'EXEMPT';
    amount: number;
    source: string;
    paymentId?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<PaymentAck> {
  return asAck(
    await client.append(
      PAYMENT_DEPOT,
      withLongs({ type: 'mark-paid', ...event }, ['amount']),
      ackLevel,
    ),
  );
}

export async function createItemOrder(
  client: RamaClient,
  event: {
    orderId: string;
    steamId: string;
    teamId: string;
    seasonId: string;
    amount: number;
  },
  ackLevel: AckLevel = 'ack',
): Promise<PaymentAck> {
  return asAck(
    await client.append(
      PAYMENT_DEPOT,
      withLongs({ type: 'create-item-order', ...event }, ['amount']),
      ackLevel,
    ),
  );
}

export async function confirmItemOrder(
  client: RamaClient,
  orderId: string,
  ackLevel: AckLevel = 'ack',
): Promise<PaymentAck> {
  return asAck(
    await client.append(PAYMENT_DEPOT, { type: 'confirm-item-order', orderId }, ackLevel),
  );
}

export async function expireItemOrder(
  client: RamaClient,
  orderId: string,
  ackLevel: AckLevel = 'ack',
): Promise<PaymentAck> {
  return asAck(
    await client.append(PAYMENT_DEPOT, { type: 'expire-item-order', orderId }, ackLevel),
  );
}

export async function getPlayerPaymentStatus(
  client: RamaClient,
  steamId: string,
  seasonId: string,
): Promise<string | null> {
  try {
    return (await client.selectOne('$$player-season-payment', [
      steamId,
      seasonId,
      'status',
    ])) as string;
  } catch {
    return null;
  }
}

export async function getTeamPaidCount(client: RamaClient, teamId: string): Promise<number> {
  try {
    const v = await client.selectOne('$$team-paid-count', [teamId]);
    return typeof v === 'number' ? v : 0;
  } catch {
    return 0;
  }
}

export async function getItemOrderStatus(
  client: RamaClient,
  orderId: string,
): Promise<string | null> {
  try {
    return (await client.selectOne('$$item-orders', [orderId, 'status'])) as string;
  } catch {
    return null;
  }
}
