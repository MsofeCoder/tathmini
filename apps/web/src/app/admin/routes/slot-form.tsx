'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/admin/session';
import { ActionNote, ConfirmSubmit } from '../forms';
import { reassignRouteSlot } from './actions';

export interface SupervisorOption {
  id: string;
  name: string;
}

/**
 * One assessor slot on one route. Confirmation is not decoration here: the
 * change rewrites every assignment on the route, which is what decides who
 * can open whose trainee, so the second step spells out how many people it
 * touches before it happens.
 */
export function SlotForm({
  routeId,
  routeCode,
  slot,
  currentName,
  currentId,
  traineeCount,
  supervisors,
  disabled,
}: {
  routeId: string;
  routeCode: string;
  slot: 'a1' | 'a2';
  currentName: string | null;
  currentId: string | null;
  traineeCount: number;
  supervisors: SupervisorOption[];
  disabled: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    reassignRouteSlot,
    null,
  );
  const [chosen, setChosen] = useState('');

  const chosenName = supervisors.find((s) => s.id === chosen)?.name ?? 'nobody';

  if (disabled) {
    return <p className="text-[13px] text-[#14232e]">{currentName ?? <Unassigned />}</p>;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="slot" value={slot} />
      <p className="text-[13px] font-semibold text-[#14232e]">{currentName ?? <Unassigned />}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`slot-${routeId}-${slot}`}>
          Supervisor for slot {slot.toUpperCase()} on {routeCode}
        </label>
        <select
          id={`slot-${routeId}-${slot}`}
          name="supervisorId"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          className="focus:outline-accent min-h-[44px] w-full min-w-[180px] max-w-[240px] rounded-[10px] border border-[#ccd7d4] bg-white px-2.5 text-[13px] text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-1"
        >
          <option value="">Change to…</option>
          {supervisors
            .filter((s) => s.id !== currentId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>

        {chosen ? (
          <ConfirmSubmit
            tone="primary"
            label="Apply"
            confirmLabel={`Yes, hand slot ${slot.toUpperCase()} to ${chosenName}`}
            question={`Give slot ${slot.toUpperCase()} on ${routeCode} to ${chosenName}? This reassigns ${traineeCount} ${
              traineeCount === 1 ? 'trainee' : 'trainees'
            } — they will appear on that supervisor's list and disappear from ${
              currentName ?? 'the current holder'
            }'s. Any trainee already marked in this slot is left alone.`}
          />
        ) : null}
      </div>

      <ActionNote state={state} />
    </form>
  );
}

function Unassigned() {
  return <span className="text-[#8a3a2a]">Not assigned</span>;
}
