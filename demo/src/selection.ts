import { assemblyDefaults } from './assembly';
import type { Selection } from './live';
export function geometryKey(s: Selection): string {
  return JSON.stringify([s.parameters,s.isolated,s.asset,s.example,s.subject,s.assembly,s.appearance]);
}
/** Reframe only on subject changes; ordinary edits retain orbit and camera entity. */
export function changesSubject(previous: Selection | undefined, next: Selection): boolean {
  if (!previous) return true;
  return previous.subject !== next.subject || previous.isolated !== next.isolated || previous.example !== next.example || previous.asset !== next.asset || previous.parameters.configuration !== next.parameters.configuration || (previous.assembly ?? assemblyDefaults).path !== (next.assembly ?? assemblyDefaults).path || (previous.assembly ?? assemblyDefaults).witness !== (next.assembly ?? assemblyDefaults).witness;
}
