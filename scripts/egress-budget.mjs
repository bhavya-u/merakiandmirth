import { pathToFileURL } from 'node:url';
export function assessEgress({ cachedGB, uncachedGB, elapsedDays, cycleDays }) {
  if (![cachedGB,uncachedGB,elapsedDays,cycleDays].every(Number.isFinite) || cachedGB<0 || uncachedGB<0 || elapsedDays<=0 || cycleDays<elapsedDays || cycleDays>32) throw new Error('Provide nonnegative GB, positive elapsed days and a valid cycle length up to 32 days.');
  return Object.fromEntries([['cached',cachedGB],['uncached',uncachedGB]].map(([name,used])=> {
    const projectedGB=used/elapsedDays*cycleDays;
    return [name,{usedGB:used,projectedGB:Number(projectedGB.toFixed(3)),targetGB:2.5,quotaGB:5,remainingGB:Math.max(0,5-used),status:used>=5?'quota-reached':used>=4?'urgent':projectedGB>2.5?'investigate':'within-target',projectionConfidence:elapsedDays<3?'too-early':'linear-estimate'}];
  }));
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const values=process.argv.slice(2).map(Number);
  if(values.length!==4) throw new Error('Usage: node scripts/egress-budget.mjs <cachedGB> <uncachedGB> <elapsedDays> <cycleDays>');
  console.log(JSON.stringify(assessEgress(Object.fromEntries(['cachedGB','uncachedGB','elapsedDays','cycleDays'].map((key,i)=>[key,values[i]]))),null,2));
}
