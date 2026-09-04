/**
 * Synthetic development/test accounts — not real people, not linked to
 * any route or trainee data. Exists solely so auth work can be verified
 * end-to-end (sign-in, forced password change, session cookies) without
 * ever touching a real assessor's credentials. See MEMORY.md.
 */

import type { AccountSeed } from './ipt-accounts';

export const DEV_ACCOUNTS: AccountSeed[] = [
  {
    username: 'test.supervisor',
    name: 'Test Supervisor',
    role: 'supervisor',
    email: 'test.supervisor@tathmini.internal',
  },
];
