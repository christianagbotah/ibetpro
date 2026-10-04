export type PlayerLineCandidate = {
  name: string;
  line: number;
  probability: number;
  averageOdds: number;
  bookmakerCount: number;
  bookmakers: Array<{
    key: string;
    title: string;
    odds: number;
  }>;
};

type BookRow = {
  name: string;
  line: number;
  odds: number;
  impliedProbability: number;
};

export function aggregateOverOnlyPlayerLines(
  data: any,
  providerMarketKey: string,
  preferredLine: number
): {
  candidates: PlayerLineCandidate[];
  bookmakerCount: number;
} {
  const bookmakers = Array.isArray(data?.bookmakers) ? data.bookmakers : [];
  const participating = bookmakers
    .map((bookmaker: any) => {
      const markets = Array.isArray(bookmaker?.markets)
        ? bookmaker.markets
        : [];
      const market = markets.find(
        (item: any) => item?.key === providerMarketKey
      );
      const outcomes = Array.isArray(market?.outcomes)
        ? market.outcomes
        : [];

      const rows = outcomes
        .map((outcome: any) => {
          const side =
            typeof outcome?.name === "string"
              ? outcome.name.trim().toLocaleLowerCase()
              : "";
          const name =
            typeof outcome?.description === "string"
              ? outcome.description.trim()
              : "";
          const odds = Number(outcome?.price);
          const line = Number(outcome?.point);

          if (
            side !== "over" ||
            !name ||
            !Number.isFinite(odds) ||
            odds <= 1 ||
            !Number.isFinite(line)
          ) {
            return null;
          }

          return {
            name,
            line,
            odds,
            impliedProbability: Math.min(1, 1 / odds),
          } satisfies BookRow;
        })
        .filter(Boolean) as BookRow[];

      if (rows.length === 0) return null;

      return {
        key: String(bookmaker?.key || ""),
        title: String(
          bookmaker?.title || bookmaker?.key || "Bookmaker"
        ),
        rows,
      };
    })
    .filter(Boolean) as Array<{
    key: string;
    title: string;
    rows: BookRow[];
  }>;

  const grouped = new Map<
    string,
    {
      name: string;
      line: number;
      probabilitySum: number;
      oddsSum: number;
      books: Array<{ key: string; title: string; odds: number }>;
    }
  >();

  for (const bookmaker of participating) {
    for (const row of bookmaker.rows) {
      const key =
        row.name.toLocaleLowerCase() + "|" + row.line.toFixed(2);
      const current = grouped.get(key) ?? {
        name: row.name,
        line: row.line,
        probabilitySum: 0,
        oddsSum: 0,
        books: [],
      };
      current.probabilitySum += row.impliedProbability;
      current.oddsSum += row.odds;
      current.books.push({
        key: bookmaker.key,
        title: bookmaker.title,
        odds: row.odds,
      });
      grouped.set(key, current);
    }
  }

  const lineCandidates = [...grouped.values()].map((entry) => ({
    name: entry.name,
    line: entry.line,
    probability:
      entry.books.length > 0
        ? Math.min(1, entry.probabilitySum / entry.books.length)
        : 0,
    averageOdds:
      entry.books.length > 0
        ? entry.oddsSum / entry.books.length
        : 0,
    bookmakerCount: entry.books.length,
    bookmakers: entry.books,
  }));

  const byPlayer = new Map<string, PlayerLineCandidate[]>();
  for (const candidate of lineCandidates) {
    const key = candidate.name.toLocaleLowerCase();
    const rows = byPlayer.get(key) ?? [];
    rows.push(candidate);
    byPlayer.set(key, rows);
  }

  const candidates = [...byPlayer.values()]
    .map((rows) =>
      [...rows].sort((a, b) => {
        const aDistance = Math.abs(a.line - preferredLine);
        const bDistance = Math.abs(b.line - preferredLine);
        if (aDistance !== bDistance) {
          return aDistance - bDistance;
        }
        if (a.bookmakerCount !== b.bookmakerCount) {
          return b.bookmakerCount - a.bookmakerCount;
        }
        return b.probability - a.probability;
      })[0]
    )
    .filter(Boolean)
    .sort((a, b) => {
      if (a.bookmakerCount !== b.bookmakerCount) {
        return b.bookmakerCount - a.bookmakerCount;
      }
      return b.probability - a.probability;
    })
    .slice(0, 12);

  return {
    candidates,
    bookmakerCount: participating.length,
  };
}