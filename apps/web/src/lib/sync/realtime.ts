import type { RealtimeChannel } from '@supabase/supabase-js';
import { db } from '../db';
import { getBrowserClient } from '../supabase/browser';
import { planLocalWrite, SUBSCRIBED_TABLES, type ChangeEvent } from './realtime-plan';
import type { Row } from './rows';

/**
 * The always-on half of the local-first design: a socket that keeps
 * IndexedDB current while the app is open.
 *
 * Without it, "read from the device" would mean "read what the device
 * happened to fetch last time" — and the case that matters is not exotic. Two
 * assessors mark the same trainee. When the second one submits, the first
 * one's phone must stop showing "awaiting 2nd assessor" and start showing the
 * locked result, without them thinking to pull down or reopen the app. The
 * College also moves trainees between routes mid-week; a supervisor who
 * drives to a trainee who is no longer theirs has wasted a morning.
 *
 * RLS applies to the stream exactly as it does to a query — Postgres re-runs
 * the SELECT policy for each subscriber — so this device is sent changes to
 * its own route and nothing else. It is not a channel that has to be
 * filtered client-side; there is nothing else on it.
 */

export interface RealtimeHandle {
  stop: () => void;
}

export interface StartRealtimeOptions {
  /**
   * Called when a change arrives that cannot be applied precisely (see
   * `planLocalWrite`), and when the socket reconnects after a drop.
   *
   * A reconnect needs it for a reason easy to miss: Realtime is not a
   * durable log. Anything that changed while the phone was in a dead zone
   * was never queued for it, so a socket that comes back is a socket with a
   * hole behind it. Refilling from `/api/sync` is what closes the hole, and
   * it is the difference between "live" and "live, and correct after every
   * tunnel".
   */
  onResyncNeeded: () => void;
}

/**
 * Opens the subscription. Returns a handle whose `stop()` is safe to call
 * more than once; returns null if there is no browser client to subscribe
 * with, in which case the app runs on sync alone.
 */
export function startRealtime({ onResyncNeeded }: StartRealtimeOptions): RealtimeHandle | null {
  const supabase = getBrowserClient();
  if (!supabase) return null;

  let channel: RealtimeChannel | null = supabase.channel('tathmini-device-sync');

  for (const table of SUBSCRIBED_TABLES) {
    channel = channel.on(
      // @supabase/supabase-js types this event name as a literal union its
      // generic overloads resolve at the call site; the payload shape is
      // narrowed by hand below rather than trusted from the wire.
      'postgres_changes' as never,
      { event: '*', schema: 'public', table } as never,
      (payload: unknown) => {
        void handleChange(payload as ChangeEvent, onResyncNeeded);
      },
    );
  }

  channel.subscribe((status) => {
    // CHANNEL_ERROR and TIMED_OUT are both "the socket dropped and came
    // back"; supabase-js reconnects on its own, and what it cannot do is
    // tell us what we missed while it was away.
    if (status === 'SUBSCRIBED') onResyncNeeded();
  });

  let stopped = false;
  return {
    stop: () => {
      if (stopped || !channel) return;
      stopped = true;
      void supabase.removeChannel(channel);
      channel = null;
    },
  };
}

/**
 * Applies one change to the device.
 *
 * Every failure is swallowed on purpose. This runs in the background of
 * whatever the supervisor is doing — often mid-assessment — and a write that
 * cannot be applied must never surface as an error over a marking form or
 * take the page down. The cost of dropping one is bounded: the next sync
 * rewrites the table wholesale.
 */
async function handleChange(event: ChangeEvent, onResyncNeeded: () => void): Promise<void> {
  const plan = planLocalWrite({
    table: event.table,
    eventType: event.eventType,
    new: event.new as Row | undefined,
    old: event.old as Row | undefined,
  });

  try {
    if (plan.kind === 'put') {
      await db.table(plan.table).put(plan.row);
    } else if (plan.kind === 'delete') {
      await db.table(plan.table).delete(plan.key);
    } else if (plan.kind === 'resync') {
      onResyncNeeded();
    }
  } catch {
    // Fall back to the thing that is always correct.
    onResyncNeeded();
  }
}
