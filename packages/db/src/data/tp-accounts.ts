/**
 * The 17 real supervisor accounts needed for the TP roster
 * ("TEACHING PRACTICE TRAINEES SEPTEMBER 2026.xlsx", 9 routes, 2
 * assessors each = 18 slots). Adam Msofe (Route 6) already has a
 * supervisor account (`adam.msofe.supervisor`, created for his IPT
 * Route 6 dual-role duty via ipt-accounts.ts) and is NOT duplicated
 * here — see MEMORY.md.
 *
 * Same synthetic-email convention as ipt-accounts.ts: `email` is a
 * Supabase-Auth-only identifier, never a real inbox.
 */

import type { AccountSeed } from './ipt-accounts';

function account(username: string, name: string): AccountSeed {
  return { username, name, role: 'supervisor', email: `${username}@tathmini.internal` };
}

export const TP_ACCOUNTS: AccountSeed[] = [
  // Route 1
  account('mkama.maugo', 'Mkama Maugo'),
  account('yohana.yona', 'Yohana Yona'),
  // Route 2 (source spells it "Osward", not "Oswald" — kept verbatim)
  account('anicia.osward', 'Anicia Osward'),
  account('frank.urio', 'Frank Urio'),
  // Route 3
  account('enelisa.mbwile', 'Enelisa Mbwile'),
  account('rodgers.amin', 'Rodgers Amin'),
  // Route 4
  account('ramadhani.msidada', 'Ramadhani Msidada'),
  account('ramadhani.ngare', 'Ramadhani Ngare'),
  // Route 5
  account('nehemia.david', 'Nehemia David'),
  account('laurent.mwaisanila', 'Laurent Mwaisanila'),
  // Route 6 — Denis Michael only; Adam Msofe's account already exists
  account('denis.michael', 'Denis Michael'),
  // Route 7
  account('lucia.daniel', 'Lucia Daniel'),
  account('fayson.mwakaseka', 'Fayson Mwakaseka'),
  // Route 8
  account('aloyce.nyoni', 'Aloyce Nyoni'),
  account('bakari.ulende', 'Bakari Ulende'),
  // Route 9
  account('benson.chibwi', 'Benson Chibwi'),
  account('francis.makori', 'Francis Makori'),
];
