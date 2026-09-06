'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/admin/session';
import { ActionNote, ConfirmSubmit, SubmitButton } from '../forms';
import { moveTraineeToRoute, updateTraineeParticulars } from './actions';

export interface ParticularsValues {
  name: string;
  registrationNumber: string;
  course: string;
  occupation: string;
  institution: string;
  modeOfStudy: string;
  district: string;
  region: string;
  email: string;
  phone: string;
}

const FIELDS: {
  name: keyof ParticularsValues;
  label: string;
  hint?: string;
  required?: boolean;
}[] = [
  {
    name: 'name',
    label: 'Name',
    required: true,
    hint: 'Exactly as the register holds it, spacing included.',
  },
  { name: 'registrationNumber', label: 'Registration number' },
  { name: 'course', label: 'Course', required: true },
  { name: 'occupation', label: 'Trade / occupation', required: true },
  { name: 'institution', label: 'Institution', required: true },
  { name: 'modeOfStudy', label: 'Mode of study' },
  { name: 'region', label: 'Region' },
  { name: 'district', label: 'District' },
  { name: 'email', label: 'E-mail', hint: 'Where this trainee’s result is sent.' },
  { name: 'phone', label: 'Phone' },
];

export function ParticularsForm({
  traineeId,
  values,
  disabled,
}: {
  traineeId: string;
  values: ParticularsValues;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateTraineeParticulars,
    null,
  );

  return (
    <form action={formAction} className="p-4">
      <input type="hidden" name="traineeId" value={traineeId} />
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label
            key={field.name}
            className="flex flex-col gap-1 text-[12.5px] font-semibold text-[#3c4c58]"
          >
            {field.label}
            {field.required ? <span className="sr-only"> (required)</span> : null}
            <input
              name={field.name}
              defaultValue={values[field.name]}
              disabled={disabled}
              required={field.required}
              spellCheck={false}
              className="focus:outline-accent min-h-[44px] rounded-[10px] border border-[#ccd7d4] px-3 text-[13.5px] font-normal text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-1 disabled:bg-[#f6f8f8]"
            />
            {field.hint ? (
              <span className="text-[11.5px] font-normal text-[#5b6b78]">{field.hint}</span>
            ) : null}
          </label>
        ))}
      </div>

      {disabled ? null : (
        <div className="mt-4">
          <SubmitButton>Save particulars</SubmitButton>
        </div>
      )}
      <ActionNote state={state} />
    </form>
  );
}

export function RouteMoveForm({
  traineeId,
  traineeName,
  currentRouteId,
  routes,
  blockedReason,
  disabled,
}: {
  traineeId: string;
  traineeName: string;
  currentRouteId: string;
  routes: { id: string; code: string }[];
  /** Set when the move cannot happen at all, e.g. a mark is already in. */
  blockedReason: string | null;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    moveTraineeToRoute,
    null,
  );
  const [chosen, setChosen] = useState('');
  const chosenCode = routes.find((r) => r.id === chosen)?.code ?? '';

  if (disabled) return null;

  if (blockedReason) {
    return (
      <p className="px-4 pb-4 text-[12.5px] leading-relaxed text-[#8a3a2a]">{blockedReason}</p>
    );
  }

  return (
    <form action={formAction} className="px-4 pb-4">
      <input type="hidden" name="traineeId" value={traineeId} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`route-${traineeId}`}>
          Move to route
        </label>
        <select
          id={`route-${traineeId}`}
          name="routeId"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          className="focus:outline-accent min-h-[44px] min-w-[200px] rounded-[10px] border border-[#ccd7d4] bg-white px-2.5 text-[13px] text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-1"
        >
          <option value="">Move to…</option>
          {routes
            .filter((r) => r.id !== currentRouteId)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.code}
              </option>
            ))}
        </select>

        {chosen ? (
          <ConfirmSubmit
            tone="primary"
            label="Move"
            confirmLabel={`Yes, move to ${chosenCode}`}
            question={`Move ${traineeName} to ${chosenCode}? Both assessors change to that route's pair, so who may mark this trainee changes with it.`}
          />
        ) : null}
      </div>
      <ActionNote state={state} />
    </form>
  );
}
