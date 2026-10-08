import type { D1Database } from './d1';
import type { ResultsStore, ScoreTally } from './results-store';

/**
 * The production {@link ResultsStore}: the `results` table of a D1 database, created by
 * `migrations/`. A thin adapter; the rules live in `api.ts`.
 */
export function createD1ResultsStore(database: D1Database): ResultsStore {
  return {
    async insertIfFirst(result) {
      const { meta } = await database
        .prepare(
          `INSERT INTO results (puzzle_number, player_id, score, submitted_at)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT (puzzle_number, player_id) DO NOTHING`,
        )
        .bind(result.puzzleNumber, result.playerId, result.score, result.submittedAt)
        .run();
      return meta.changes === 1;
    },
    async countedScore(puzzleNumber, playerId) {
      const row = await database
        .prepare('SELECT score FROM results WHERE puzzle_number = ?1 AND player_id = ?2')
        .bind(puzzleNumber, playerId)
        .first();
      return row === null ? undefined : integerColumn(row, 'score');
    },
    async scoreTallies(puzzleNumber) {
      const { results } = await database
        .prepare(
          `SELECT score, COUNT(*) AS players FROM results
           WHERE puzzle_number = ?1 GROUP BY score`,
        )
        .bind(puzzleNumber)
        .all();
      return results.map((row): ScoreTally => ({
        score: integerColumn(row, 'score'),
        players: integerColumn(row, 'players'),
      }));
    },
  };
}

function integerColumn(row: Readonly<Record<string, unknown>>, column: string): number {
  const value = row[column];
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error(`Column ${column} is not an integer`);
  return value;
}
