import { describe, it, expect } from "vitest";
import {
  GEO_RECORDS,
  RECORDS_PER_RUN,
  RECORD_IDS,
  distanceToRecordKm,
  haversineKm,
  isRecordHit,
  recordById,
  shuffledRecords,
} from "./geo-records";
import type { CountryCollection } from "./continents";

/** A square country, big enough to click inside and outside of. */
function squareCountry(adm0: string, west: number, south: number, size: number): CountryCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        properties: { ADM0_A3: adm0, NAME: adm0 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [west, south],
              [west + size, south],
              [west + size, south + size],
              [west, south + size],
              [west, south],
            ],
          ],
        },
      },
    ],
  };
}

describe("geo-records — the dataset", () => {
  it("every record has a unique id and can be looked up", () => {
    expect(new Set(RECORD_IDS).size).toBe(GEO_RECORDS.length);
    for (const id of RECORD_IDS) expect(recordById(id).id).toBe(id);
  });

  it("there are more records than one run asks for, so runs differ", () => {
    expect(GEO_RECORDS.length).toBeGreaterThan(RECORDS_PER_RUN);
  });

  it("an unknown id is a programming error, not a silent null", () => {
    // @ts-expect-error — deliberately outside the union
    expect(() => recordById("atlantis")).toThrow();
  });
});

describe("geo-records — distances", () => {
  it("haversine matches a known distance (Moscow – Saint Petersburg ≈ 634 km)", () => {
    const km = haversineKm([37.62, 55.75], [30.31, 59.94]);
    expect(km).toBeGreaterThan(600);
    expect(km).toBeLessThan(670);
  });

  it("distance is zero exactly when the click is a hit", () => {
    const everest = recordById("everest");
    expect(isRecordHit(everest, [86.925, 27.988], null)).toBe(true);
    expect(distanceToRecordKm(everest, [86.925, 27.988], null)).toBe(0);

    const faraway: [number, number] = [0, 0];
    expect(isRecordHit(everest, faraway, null)).toBe(false);
    expect(distanceToRecordKm(everest, faraway, null)).toBeGreaterThan(1000);
  });

  it("the reported distance shrinks as the click gets closer", () => {
    const nile = recordById("nile");
    const far = distanceToRecordKm(nile, [10, 20], null);
    const near = distanceToRecordKm(nile, [28, 20], null);
    expect(near).toBeLessThan(far);
  });
});

describe("geo-records — point answers", () => {
  it("accepts a click inside the tolerance and rejects one outside it", () => {
    const mariana = recordById("mariana");
    expect(isRecordHit(mariana, [142.5, 11.5], null)).toBe(true);
    // Tokyo is nowhere near the trench
    expect(isRecordHit(mariana, [139.7, 35.7], null)).toBe(false);
  });
});

describe("geo-records — path answers", () => {
  it("the Andes accept a click along the range, not one in the middle of Brazil", () => {
    const andes = recordById("andes");
    expect(isRecordHit(andes, [-70.6, -33.4], null)).toBe(true); // Santiago
    expect(isRecordHit(andes, [-77.0, -12.0], null)).toBe(true); // Peru
    expect(isRecordHit(andes, [-50.0, -10.0], null)).toBe(false); // central Brazil
  });

  it("the Nile accepts a click along the river, not one in the Sahara to the west", () => {
    const nile = recordById("nile");
    expect(isRecordHit(nile, [31.2, 30.0], null)).toBe(true); // Cairo
    expect(isRecordHit(nile, [32.5, 15.6], null)).toBe(true); // Khartoum
    expect(isRecordHit(nile, [10.0, 22.0], null)).toBe(false); // deep Sahara
  });
});

describe("geo-records — box answers", () => {
  it("the Sahara accepts a click inside the desert and rejects Europe", () => {
    const sahara = recordById("sahara");
    expect(isRecordHit(sahara, [10, 22], null)).toBe(true);
    expect(isRecordHit(sahara, [10, 48], null)).toBe(false);
  });

  it("a click outside the box reports how far away it is", () => {
    const caspian = recordById("caspian");
    expect(isRecordHit(caspian, [51, 42], null)).toBe(true);
    expect(distanceToRecordKm(caspian, [51, 42], null)).toBe(0);
    expect(distanceToRecordKm(caspian, [51, 60], null)).toBeGreaterThan(1000);
  });
});

describe("geo-records — country answers", () => {
  const russia = recordById("russia");
  const countries = squareCountry("RUS", 60, 55, 10);

  it("is right only inside the real outline", () => {
    expect(isRecordHit(russia, [65, 60], countries)).toBe(true);
    expect(isRecordHit(russia, [20, 20], countries)).toBe(false);
  });

  it("is never right when the outlines are missing, and still reports a distance", () => {
    expect(isRecordHit(russia, [65, 60], null)).toBe(false);
    expect(distanceToRecordKm(russia, [65, 60], null)).toBeGreaterThan(0);
  });

  it("a click on another country is not the answer", () => {
    const other = squareCountry("KAZ", 60, 55, 10);
    expect(isRecordHit(russia, [65, 60], other)).toBe(false);
  });
});

describe("geo-records — one run of the mission", () => {
  it("asks for RECORDS_PER_RUN different records", () => {
    const run = shuffledRecords();
    expect(run).toHaveLength(RECORDS_PER_RUN);
    expect(new Set(run).size).toBe(RECORDS_PER_RUN);
    for (const id of run) expect(RECORD_IDS).toContain(id);
  });

  it("is driven by the random source it is given, so runs are not identical", () => {
    const always = (value: number) => () => value;
    const first = shuffledRecords(always(0));
    const last = shuffledRecords(always(0.999999));
    expect(first).not.toEqual(last);
  });

  it("never asks for more than the pool holds", () => {
    expect(shuffledRecords(Math.random, 99)).toHaveLength(GEO_RECORDS.length);
    expect(shuffledRecords(Math.random, 0)).toHaveLength(1);
  });
});
