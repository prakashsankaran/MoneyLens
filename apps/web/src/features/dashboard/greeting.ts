/** Time-of-day greeting in India Standard Time. */
export function greetingFor(date: Date): string {
  const istHour = (date.getUTCHours() + 5 + Math.floor((date.getUTCMinutes() + 30) / 60)) % 24;
  if (istHour < 5) return 'Good evening';
  if (istHour < 12) return 'Good morning';
  if (istHour < 17) return 'Good afternoon';
  return 'Good evening';
}
