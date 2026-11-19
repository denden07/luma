export const countdownTarget = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

export const countdownInputValue = (value: string): string => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const countdownRemaining = (targetAt: string, now: number): { days: number; hours: number; minutes: number; seconds: number } | null => {
  const target = Date.parse(targetAt);
  if (!targetAt || Number.isNaN(target)) return null;
  const totalSeconds = Math.max(0, Math.ceil((target - now) / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor(totalSeconds % 86400 / 3600),
    minutes: Math.floor(totalSeconds % 3600 / 60),
    seconds: totalSeconds % 60,
  };
};
