export function cx(...items: Array<string | false | null | undefined>): string {
  return items.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function valueToPercent(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

export function roundByStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  const rounded = Math.round(value / step) * step;
  const decimals = getDecimalPlaces(step);
  return Number(rounded.toFixed(decimals));
}

export function normalizeNumber(value: number, min: number, max: number, step = 1): number {
  return clamp(roundByStep(value, step), min, max);
}

export function getValueFromClientX(clientX: number, rect: DOMRect, min: number, max: number, step = 1): number {
  const percent = clamp((clientX - rect.left) / rect.width, 0, 1);
  return normalizeNumber(min + percent * (max - min), min, max, step);
}

function getDecimalPlaces(value: number): number {
  const text = String(value);
  if (!text.includes(".")) return 0;
  return text.split(".")[1]?.length || 0;
}
