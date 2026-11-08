const key = 'cloqi-ai-demo-budget-v1';
export const demoDailyLimit = 10;
export function demoBudget() {
  const day = new Date().toISOString().slice(0, 10);
  try { const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (value?.day === day && Number.isInteger(value.used) && value.used >= 0) return value as {day:string;used:number;globalRemaining?:number};
  } catch { /* Server still enforces the shared budget. */ }
  return {day, used:0, globalRemaining:undefined as number|undefined};
}
export function saveDemoBudget(value:ReturnType<typeof demoBudget>) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Server quota remains authoritative. */ }
  window.dispatchEvent(new Event('cloqi-demo-budget'));
}
export function reserveDemoRequest() {
  const budget = demoBudget();
  if (budget.used >= demoDailyLimit) return false;
  saveDemoBudget({...budget, used: budget.used + 1});
  return true;
}
// An attempt that never produced an answer must not cost one of the ten daily
// tries. The shared server budget stays authoritative either way.
export function refundDemoRequest() {
  const budget = demoBudget();
  saveDemoBudget({...budget, used: Math.max(0, budget.used - 1)});
}
