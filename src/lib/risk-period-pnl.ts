import { prisma } from "./db";

const REALIZED_PNL_ACTIONS = [
  "bet_settled",
  "accumulator_settled",
  "cashout_executed",
];

export type RiskPeriodPnl = {
  dailyPnl: number;
  weeklyPnl: number;
  dayStart: Date;
  weekStart: Date;
  timezone: string;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeTimezone(value?: string | null) {
  const timezone = value || "Africa/Accra";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "Africa/Accra";
  }
}

function zonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/**
 * Convert a local wall-clock time in an IANA timezone to its UTC instant.
 * Iterating handles DST/offset changes without depending on a third-party date
 * library. Period boundaries are midnight, where the result is unambiguous for
 * the timezones supported by the app.
 */
function zonedDateTimeToUtc(
  parts: Pick<ZonedParts, "year" | "month" | "day">,
  timezone: string
) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  let guess = target;

  for (let i = 0; i < 4; i++) {
    const actual = zonedParts(new Date(guess), timezone);
    const representedAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const adjustment = target - representedAsUtc;
    if (adjustment === 0) break;
    guess += adjustment;
  }

  return new Date(guess);
}

export function getRiskPeriodStarts(
  timezoneInput?: string | null,
  now = new Date()
) {
  const timezone = normalizeTimezone(timezoneInput);
  const local = zonedParts(now, timezone);
  const dayStart = zonedDateTimeToUtc(local, timezone);

  const localCalendarDate = new Date(
    Date.UTC(local.year, local.month - 1, local.day)
  );
  const daysSinceMonday = (localCalendarDate.getUTCDay() + 6) % 7;
  localCalendarDate.setUTCDate(
    localCalendarDate.getUTCDate() - daysSinceMonday
  );

  const weekStart = zonedDateTimeToUtc(
    {
      year: localCalendarDate.getUTCFullYear(),
      month: localCalendarDate.getUTCMonth() + 1,
      day: localCalendarDate.getUTCDate(),
    },
    timezone
  );

  return { timezone, dayStart, weekStart };
}

export function getCalendarMonthWindow(
  timezoneInput?: string | null,
  monthsAgo = 0,
  now = new Date()
) {
  const timezone = normalizeTimezone(timezoneInput);
  const local = zonedParts(now, timezone);
  const monthAnchor = new Date(
    Date.UTC(local.year, local.month - 1 - monthsAgo, 1)
  );
  const nextMonthAnchor = new Date(
    Date.UTC(
      monthAnchor.getUTCFullYear(),
      monthAnchor.getUTCMonth() + 1,
      1
    )
  );
  const start = zonedDateTimeToUtc(
    {
      year: monthAnchor.getUTCFullYear(),
      month: monthAnchor.getUTCMonth() + 1,
      day: 1,
    },
    timezone
  );
  const end = zonedDateTimeToUtc(
    {
      year: nextMonthAnchor.getUTCFullYear(),
      month: nextMonthAnchor.getUTCMonth() + 1,
      day: 1,
    },
    timezone
  );
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(monthAnchor);

  return { timezone, start, end, label };
}


export async function getRealizedPnlBreakdown(
  userId: string,
  start: Date,
  end?: Date
) {
  const createdAt = end ? { gte: start, lt: end } : { gte: start };
  const [profitResult, lossResult] = await Promise.all([
    prisma.botLog.aggregate({
      where: {
        userId,
        action: { in: REALIZED_PNL_ACTIONS },
        profitImpact: { gt: 0 },
        createdAt,
      },
      _sum: { profitImpact: true },
    }),
    prisma.botLog.aggregate({
      where: {
        userId,
        action: { in: REALIZED_PNL_ACTIONS },
        profitImpact: { lt: 0 },
        createdAt,
      },
      _sum: { profitImpact: true },
    }),
  ]);

  const profit = money(profitResult._sum.profitImpact || 0);
  const loss = money(Math.abs(lossResult._sum.profitImpact || 0));
  return { profit, loss, net: money(profit - loss) };
}

export async function getRiskPeriodPnl(
  userId: string,
  timezoneInput?: string | null,
  now = new Date()
): Promise<RiskPeriodPnl> {
  const { timezone, dayStart, weekStart } = getRiskPeriodStarts(
    timezoneInput,
    now
  );

  const [dailyResult, weeklyResult] = await Promise.all([
    prisma.botLog.aggregate({
      where: {
        userId,
        action: { in: REALIZED_PNL_ACTIONS },
        createdAt: { gte: dayStart },
      },
      _sum: { profitImpact: true },
    }),
    prisma.botLog.aggregate({
      where: {
        userId,
        action: { in: REALIZED_PNL_ACTIONS },
        createdAt: { gte: weekStart },
      },
      _sum: { profitImpact: true },
    }),
  ]);

  return {
    dailyPnl: money(dailyResult._sum.profitImpact || 0),
    weeklyPnl: money(weeklyResult._sum.profitImpact || 0),
    dayStart,
    weekStart,
    timezone,
  };
}

/**
 * Sum realized AUTO PnL from immutable financial-impact events since a UTC
 * instant. Placement logs are deliberately excluded: staking money is exposure,
 * not realized loss. Ticket ownership is verified against Bet/Accumulator so
 * manual wagers do not leak into AUTO performance.
 */
export async function getAutoRealizedPnlSince(
  userId: string,
  since: Date
) {
  const events = await prisma.botLog.findMany({
    where: {
      userId,
      action: { in: REALIZED_PNL_ACTIONS },
      createdAt: { gte: since },
    },
    select: {
      betId: true,
      accumulatorId: true,
      profitImpact: true,
    },
  });

  const betIds = Array.from(
    new Set(events.flatMap((event) => (event.betId ? [event.betId] : [])))
  );
  const accumulatorIds = Array.from(
    new Set(
      events.flatMap((event) =>
        event.accumulatorId ? [event.accumulatorId] : []
      )
    )
  );

  const [autoBets, autoAccumulators] = await Promise.all([
    betIds.length
      ? prisma.bet.findMany({
          where: { id: { in: betIds }, userId, isAutoPlaced: true },
          select: { id: true },
        })
      : Promise.resolve([]),
    accumulatorIds.length
      ? prisma.accumulator.findMany({
          where: { id: { in: accumulatorIds }, userId, isAutoPlaced: true },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const autoBetIds = new Set(autoBets.map((bet) => bet.id));
  const autoAccumulatorIds = new Set(
    autoAccumulators.map((accumulator) => accumulator.id)
  );

  return money(
    events.reduce((sum, event) => {
      if (event.accumulatorId) {
        return autoAccumulatorIds.has(event.accumulatorId)
          ? sum + (event.profitImpact || 0)
          : sum;
      }
      if (event.betId) {
        return autoBetIds.has(event.betId)
          ? sum + (event.profitImpact || 0)
          : sum;
      }
      return sum;
    }, 0)
  );
}

/**
 * User.dailyPnl / weeklyPnl are retained as compatibility/cache fields for
 * existing UI and risk code. Their authoritative values are reconstructed from
 * immutable realized-PnL events before every AUTO cycle, so no midnight/weekly
 * reset job is required.
 */
export async function refreshRiskPeriodPnlCache(userId: string) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  const pnl = await getRiskPeriodPnl(userId, settings?.timezone);

  await prisma.user.updateMany({
    where: { id: userId },
    data: {
      dailyPnl: pnl.dailyPnl,
      weeklyPnl: pnl.weeklyPnl,
    },
  });

  return pnl;
}
