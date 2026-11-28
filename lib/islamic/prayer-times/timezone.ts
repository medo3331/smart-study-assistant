/** Convert a wall-clock time in an IANA timezone to its UTC timestamp. */
export function zonedDateTimeToTimestamp(
  date: string,
  time: string,
  timeZone: string,
): number {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!dateMatch || !timeMatch || !/^\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?$/i.test(time.trim())) {
    throw new Error("Invalid date or prayer time");
  }

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const meridiem = /\b(AM|PM)\b/i.exec(time)?.[1]?.toUpperCase();
  let hour = Number(hourText);
  if (meridiem) {
    if (hour < 1 || hour > 12) throw new Error("Invalid date or prayer time");
    hour = (hour % 12) + (meridiem === "PM" ? 12 : 0);
  }
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const minute = Number(minuteText);
  const targetUtcShape = Date.UTC(year, month - 1, day, hour, minute);

  if (
    new Date(targetUtcShape).getUTCFullYear() !== year ||
    new Date(targetUtcShape).getUTCMonth() + 1 !== month ||
    new Date(targetUtcShape).getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    throw new Error("Invalid date or prayer time");
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  // Iteratively remove the timezone offset at the target instant. This uses
  // the IANA timezone database and therefore follows the date's DST rules.
  let timestamp = targetUtcShape;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
    );
    const correction = targetUtcShape - representedUtc;
    if (correction === 0) return timestamp;
    timestamp += correction;
  }

  const finalParts = formatter.formatToParts(new Date(timestamp));
  const finalValues = Object.fromEntries(finalParts.map((part) => [part.type, part.value]));
  if (
    Number(finalValues.year) !== year ||
    Number(finalValues.month) !== month ||
    Number(finalValues.day) !== day ||
    Number(finalValues.hour) !== hour ||
    Number(finalValues.minute) !== minute
  ) {
    throw new Error(`Local time does not exist in timezone ${timeZone}`);
  }
  return timestamp;
}

export function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
