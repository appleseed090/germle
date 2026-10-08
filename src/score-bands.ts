/**
 * The ten score bands every score histogram uses, personal and community alike:
 * `[0–9, 10–19, …, 80–89, 90–100]`. DOM-free, so the API Worker shares it with the page.
 */
export const HISTOGRAM_BAND_COUNT = 10;

/** The band a 0–100 score falls in, from 0 to {@link HISTOGRAM_BAND_COUNT} − 1. */
export function histogramBand(score: number): number {
  return Math.min(HISTOGRAM_BAND_COUNT - 1, Math.floor(score / 10));
}

/** A band's label: `0–9`, `10–19`, …, `90–100`. */
export function histogramBandLabel(band: number): string {
  return band === HISTOGRAM_BAND_COUNT - 1 ? `${band * 10}–100` : `${band * 10}–${band * 10 + 9}`;
}
