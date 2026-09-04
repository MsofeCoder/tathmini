/**
 * The 13 real accounts this round of account creation covers: the two
 * super_admins (both also field supervisors, under a second account —
 * see create-accounts.ts and MEMORY.md); the 10 IPT route-assessor slots
 * from "IPT ASSESSMENT SEPTEMBER  2026.xls" (one of which — Route 2 — is
 * Aron Franco's supervisor account, not an eleventh account on top of
 * it); and Adam Msofe's separate supervisor account for his TP Route 6
 * duty (outside the IPT roster, so not one of the 10).
 *
 * Deliberately NOT here: the other 16 TP-roster supervisors, any TP
 * trainee data, or a Coordinator account — none of those were asked for
 * in this round. See MEMORY.md for the reasoning.
 *
 * No passwords here, ever — create-accounts.ts generates one per account
 * at runtime and never writes it to disk.
 *
 * `email` is a synthetic internal identifier only (Supabase Auth requires
 * one; nothing is ever sent to it) — the user-facing "Username" field is
 * this same string with the `@tathmini.internal` suffix removed.
 */

export type AccountRole = 'supervisor' | 'coordinator' | 'super_admin';

export interface AccountSeed {
  username: string;
  name: string;
  role: AccountRole;
  email: string;
}

function account(username: string, name: string, role: AccountRole): AccountSeed {
  return { username, name, role, email: `${username}@tathmini.internal` };
}

export const IPT_ACCOUNTS: AccountSeed[] = [
  // Dual-role: super_admin identity (existing/canonical, per CONTEXT.md).
  account('msofe.coder', 'Msofe Coder', 'super_admin'),
  account('aron.franco', 'Aron Franco', 'super_admin'),

  // Dual-role: separate supervisor identity for the same two people.
  // ".supervisor" suffix applied uniformly to both, not just where the
  // bare username collides — a predictable rule, not an ad hoc fix.
  account('adam.msofe.supervisor', 'Adam Msofe', 'supervisor'), // TP Route 6, with Denis Michael (not created here)
  account('aron.franco.supervisor', 'Aron Franco', 'supervisor'), // IPT Route 2, with Lilian Makwinya

  // IPT Route 1
  account('evodius.kadason', 'Evodius Kadason', 'supervisor'),
  account('misyao.nunda', 'Misyao Nunda', 'supervisor'),

  // IPT Route 2 (Aron Franco's supervisor account, above, is the other half)
  account('lilian.makwinya', 'Lilian Makwinya', 'supervisor'),

  // IPT Route 3
  account('holly.kaje', 'Holly Kaje', 'supervisor'),
  account('nickson.kinyamagoha', 'Nickson Kinyamagoha', 'supervisor'),

  // IPT Route 4
  account('gladness.mdoe', 'Gladness Mdoe', 'supervisor'),
  account('daud.mafige', 'Daud Mafige', 'supervisor'),

  // IPT Route 5
  account('coletha.ndelwa', 'Coletha Ndelwa', 'supervisor'),
  account('fausta.makweta', 'Fausta Makweta', 'supervisor'),
];
