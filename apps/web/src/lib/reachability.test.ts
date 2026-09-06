import { describe, expect, it, vi } from 'vitest';
import { checkReachable, forgetReachability, isFresh, PROBE_TTL_MS } from './reachability';

/**
 * "Is the server reachable" is a different question from "does this phone
 * have a radio", and the gap between them is an ordinary afternoon on a
 * College route: a workshop wifi that routes nowhere, a data bundle that has
 * run out, a 3G connection that has associated but passes nothing. In all
 * three `navigator.onLine` says true.
 */
describe('isFresh', () => {
  it('has nothing to reuse before the first probe', () => {
    expect(isFresh(null, 1_000)).toBe(false);
  });

  it('reuses an answer inside the window, so one tick costs one request', () => {
    expect(isFresh({ reachable: true, at: 1_000 }, 1_000 + PROBE_TTL_MS - 1)).toBe(true);
  });

  it('asks again once the window has passed', () => {
    expect(isFresh({ reachable: true, at: 1_000 }, 1_000 + PROBE_TTL_MS)).toBe(false);
  });
});

describe('checkReachable', () => {
  it('trusts navigator.onLine when it says there is no interface, and does not probe', async () => {
    forgetReachability();
    const probe = vi.fn();
    expect(await checkReachable({ online: () => false, probe, now: () => 1 })).toBe(false);
    // Four seconds spent proving what the browser already told us is four
    // seconds a supervisor waits at the end of an assessment.
    expect(probe).not.toHaveBeenCalled();
  });

  it('does NOT trust navigator.onLine when it says true — it probes', async () => {
    forgetReachability();
    const probe = vi.fn().mockResolvedValue(false);
    expect(await checkReachable({ online: () => true, probe, now: () => 1 })).toBe(false);
    expect(probe).toHaveBeenCalledOnce();
  });

  it('reports reachable when the probe answers', async () => {
    forgetReachability();
    const probe = vi.fn().mockResolvedValue(true);
    expect(await checkReachable({ online: () => true, probe, now: () => 1 })).toBe(true);
  });

  it('treats a thrown probe as unreachable rather than propagating', async () => {
    forgetReachability();
    const probe = vi.fn().mockRejectedValue(new Error('network'));
    expect(await checkReachable({ online: () => true, probe, now: () => 1 })).toBe(false);
  });

  it('caches the answer, so a burst of callers costs one request', async () => {
    forgetReachability();
    const probe = vi.fn().mockResolvedValue(true);
    const deps = { online: () => true, probe, now: () => 5_000 };
    await checkReachable(deps);
    await checkReachable(deps);
    expect(probe).toHaveBeenCalledOnce();
  });

  // An `online` event typically wakes the drainer, the sync loop and the
  // banner in the same tick. Three simultaneous probes on a weak connection
  // are three ways to make it weaker.
  it('shares a probe already in flight instead of starting another', async () => {
    forgetReachability();
    let release: (value: boolean) => void = () => {};
    const probe = vi.fn().mockReturnValue(
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    );
    const deps = { online: () => true, probe, now: () => 9_000 };

    const both = Promise.all([checkReachable(deps), checkReachable(deps)]);
    release(true);

    expect(await both).toEqual([true, true]);
    expect(probe).toHaveBeenCalledOnce();
  });

  it('probes again once the cached answer is stale', async () => {
    forgetReachability();
    const probe = vi.fn().mockResolvedValue(true);
    let clock = 1_000;
    const deps = { online: () => true, probe, now: () => clock };
    await checkReachable(deps);
    clock += PROBE_TTL_MS + 1;
    await checkReachable(deps);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  // The browser firing `online`/`offline` is new information and beats
  // anything remembered — otherwise walking back into coverage is invisible
  // for as long as the cached answer survives.
  it('forgetReachability drops the cached answer', async () => {
    forgetReachability();
    const probe = vi.fn().mockResolvedValue(true);
    const deps = { online: () => true, probe, now: () => 20_000 };
    await checkReachable(deps);
    forgetReachability();
    await checkReachable(deps);
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
