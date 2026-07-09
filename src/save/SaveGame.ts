import type { EventBus } from '../core/EventBus';

/** LocalStorage-Key des Spielstands. */
const STORAGE_KEY = 'rooftop-runner-save';
/** Sicherungs-Key für einen korrupten, nicht parsbaren Spielstand. */
const BACKUP_KEY = 'rooftop-runner-save.backup';
/** Debounce für persist() nach einer Änderung (ms). */
const SAVE_DEBOUNCE_MS = 500;

/** Persistierte Einstellungen (Task 23-Felder aus Menus). */
export interface SaveSettings {
  musicVol: number;
  sfxVol: number;
  quality: 'hoch' | 'niedrig';
}

/** Versioniertes Spielstand-Schema (aktuell v1). */
export interface SaveDataV1 {
  version: 1;
  /** Eingesammelte Collectible-IDs je Level. */
  collectibles: Record<string, string[]>;
  /** Erfüllte Missions-IDs (levelübergreifend, wie Missions.completed). */
  missions: string[];
  /** Beste Zeitrennen-Zeit (ms) je Level. */
  bestTimes: Record<string, number>;
  /** Bester Score je Level. */
  bestScores: Record<string, number>;
  settings: SaveSettings;
}

type SaveData = SaveDataV1;

/** Frischer Spielstand ohne Fortschritt (Default-Zustand). */
function defaultData(): SaveData {
  return {
    version: 1,
    collectibles: {},
    missions: [],
    bestTimes: {},
    bestScores: {},
    settings: { musicVol: 0.7, sfxVol: 1, quality: 'hoch' },
  };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isRecordOfStringArrays(v: unknown): v is Record<string, string[]> {
  if (typeof v !== 'object' || v === null) return false;
  return Object.values(v).every(isStringArray);
}

function isRecordOfNumbers(v: unknown): v is Record<string, number> {
  if (typeof v !== 'object' || v === null) return false;
  return Object.values(v).every((x) => typeof x === 'number');
}

function isSettings(v: unknown): v is SaveSettings {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.musicVol === 'number' &&
    typeof s.sfxVol === 'number' &&
    (s.quality === 'hoch' || s.quality === 'niedrig')
  );
}

/**
 * Migrationstabelle: Rohdaten (aus JSON.parse, beliebiger Struktur) je nach
 * gespeicherter version-Nummer in das aktuelle SaveData-Schema überführen.
 * Vorerst nur v1 -> v1 (identisch, mit defensiver Feldvalidierung); künftige
 * Schemaversionen ergänzen hier weitere Einträge statt Bestehendes zu ändern.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => SaveData> = {
  1: (raw) => ({
    version: 1,
    collectibles: isRecordOfStringArrays(raw.collectibles) ? raw.collectibles : {},
    missions: isStringArray(raw.missions) ? raw.missions : [],
    bestTimes: isRecordOfNumbers(raw.bestTimes) ? raw.bestTimes : {},
    bestScores: isRecordOfNumbers(raw.bestScores) ? raw.bestScores : {},
    settings: isSettings(raw.settings) ? raw.settings : defaultData().settings,
  }),
};

/**
 * Spielstand (Task 24): persistiert Fortschritt (Collectibles, Missionen,
 * Bestzeiten/-scores) und Einstellungen in LocalStorage. Lauscht rein
 * passiv auf dem EventBus (keine Querverweise zu anderen Systemen) und
 * schreibt debounced (500 ms), damit häufige Events (z. B. score:total)
 * nicht bei jedem Aufruf synchron LocalStorage anfassen.
 */
export class SaveGame {
  private data: SaveData;
  private saveTimer: number | null = null;

  constructor(
    bus: EventBus,
    private readonly levelId: string,
  ) {
    this.data = SaveGame.loadFromStorage();

    bus.on('collect:pickup', ({ id }) => {
      const list = this.data.collectibles[this.levelId] ?? [];
      if (list.includes(id)) return;
      this.data.collectibles[this.levelId] = [...list, id];
      this.scheduleSave();
    });

    bus.on('mission:completed', ({ id }) => {
      if (this.data.missions.includes(id)) return;
      this.data.missions.push(id);
      this.scheduleSave();
    });

    bus.on('trial:finished', ({ timeMs }) => {
      const best = this.data.bestTimes[this.levelId];
      if (best !== undefined && timeMs >= best) return;
      this.data.bestTimes[this.levelId] = timeMs;
      this.scheduleSave();
    });

    bus.on('score:total', ({ total }) => {
      const best = this.data.bestScores[this.levelId];
      if (best !== undefined && total <= best) return;
      this.data.bestScores[this.levelId] = total;
      this.scheduleSave();
    });
  }

  /** Bereits eingesammelte Collectible-IDs eines Levels (Default: leer). */
  getCollectibles(levelId: string): string[] {
    return [...(this.data.collectibles[levelId] ?? [])];
  }

  /** Erfüllte Missions-IDs. */
  getMissions(): string[] {
    return [...this.data.missions];
  }

  /** Beste Zeitrennen-Zeit (ms) eines Levels, oder null ohne Eintrag. */
  getBestTime(levelId: string): number | null {
    return this.data.bestTimes[levelId] ?? null;
  }

  /** Bester Score eines Levels, oder null ohne Eintrag. */
  getBestScore(levelId: string): number | null {
    return this.data.bestScores[levelId] ?? null;
  }

  /** Aktuell gespeicherte Einstellungen (Kopie). */
  getSettings(): SaveSettings {
    return { ...this.data.settings };
  }

  /** Einstellungen übernehmen und debounced persistieren. */
  saveSettings(settings: SaveSettings): void {
    this.data.settings = { ...settings };
    this.scheduleSave();
  }

  /** Kompletten Fortschritt löschen (LocalStorage-Key + interner Zustand). */
  resetAll(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // LocalStorage evtl. deaktiviert -> interner Zustand wird trotzdem zurückgesetzt
    }
    this.data = defaultData();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.persist();
    }, SAVE_DEBOUNCE_MS);
  }

  private persist(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // LocalStorage voll/deaktiviert -> Fortschritt bleibt nur in-memory
    }
  }

  /**
   * Spielstand aus LocalStorage lesen. Korrupter (nicht parsbarer) String
   * wird unter BACKUP_KEY gesichert, unbekannte/fehlende version fällt auf
   * den Default-Zustand zurück (Migrationstabelle kennt nur v1).
   */
  private static loadFromStorage(): SaveData {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return defaultData();
    }
    if (!raw) return defaultData();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      SaveGame.backupCorrupt(raw);
      return defaultData();
    }

    if (typeof parsed !== 'object' || parsed === null) {
      SaveGame.backupCorrupt(raw);
      return defaultData();
    }

    const record = parsed as Record<string, unknown>;
    const version = typeof record.version === 'number' ? record.version : -1;
    const migrate = MIGRATIONS[version];
    return migrate ? migrate(record) : defaultData();
  }

  private static backupCorrupt(raw: string): void {
    try {
      window.localStorage.setItem(BACKUP_KEY, raw);
    } catch {
      // Backup optional; korrupter Zustand wird trotzdem verworfen
    }
  }
}
