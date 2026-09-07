import { describe, expect, it } from 'vitest';
import { emptyRouteMessage, type RouteStatusInput } from './route-status';

/**
 * An empty route list has four meanings and used to have one sentence.
 * A supervisor upgrading from the previous build — valid session, empty
 * IndexedDB — was told their route had not reached the phone while it was
 * being downloaded, and told the same thing forever if that download failed.
 */
function input(overrides: Partial<RouteStatusInput> = {}): RouteStatusInput {
  return {
    loaded: true,
    traineeCount: 0,
    outstanding: 0,
    syncedAt: null,
    syncStatus: 'never',
    ...overrides,
  };
}

describe('emptyRouteMessage', () => {
  it('says nothing alarming while the phone is still being read', () => {
    const message = emptyRouteMessage(input({ loaded: false }));
    expect(message.text).toMatch(/Reading your route/);
    expect(message.canRetry).toBe(false);
  });

  // The regression this file exists for.
  it('says it is downloading, not that the route is missing', () => {
    const message = emptyRouteMessage(input({ syncStatus: 'syncing' }));
    expect(message.text).toMatch(/Downloading your route/);
    expect(message.canRetry).toBe(false);
  });

  it('offers a retry when the server could not be reached', () => {
    const message = emptyRouteMessage(input({ syncStatus: 'unreachable' }));
    expect(message.text).toMatch(/Could not reach the College server/);
    expect(message.canRetry).toBe(true);
  });

  it('offers a retry when the device has simply never synced', () => {
    const message = emptyRouteMessage(input({ syncStatus: 'never' }));
    expect(message.text).toMatch(/has not reached this phone yet/);
    expect(message.canRetry).toBe(true);
  });

  it('names an expired session rather than blaming the route', () => {
    const message = emptyRouteMessage(input({ syncStatus: 'signed-out' }));
    expect(message.text).toMatch(/session has expired/);
    expect(message.canRetry).toBe(false);
  });

  // A retry here would imply the app is broken rather than the roster empty.
  it('does not offer a retry once a sync has succeeded and found nobody', () => {
    const message = emptyRouteMessage(input({ syncedAt: 1_700_000_000_000, syncStatus: 'synced' }));
    expect(message.text).toBe('No trainees assigned to this route yet.');
    expect(message.canRetry).toBe(false);
  });

  describe('with trainees on the route', () => {
    it('counts what is left to assess', () => {
      const message = emptyRouteMessage(
        input({ traineeCount: 5, outstanding: 3, syncedAt: 1, syncStatus: 'synced' }),
      );
      expect(message.text).toBe('3 still to assess');
      expect(message.canRetry).toBe(false);
    });

    it('congratulates a finished route', () => {
      const message = emptyRouteMessage(
        input({ traineeCount: 5, outstanding: 0, syncedAt: 1, syncStatus: 'synced' }),
      );
      expect(message.text).toMatch(/Route complete/);
    });

    // A sync failing must never change what a supervisor with a full route
    // sees — they are holding a good copy and can work from it all day.
    it('says nothing about syncing while the route has trainees on it', () => {
      const message = emptyRouteMessage(
        input({ traineeCount: 5, outstanding: 2, syncedAt: 1, syncStatus: 'unreachable' }),
      );
      expect(message.text).toBe('2 still to assess');
      expect(message.canRetry).toBe(false);
    });
  });
});
