/**
 * GpcImportService
 * ================
 * Parses an uploaded GS1 GPC JSON file and imports it into marketplace_categories
 * via raw SQL for performance (6 000+ nodes over Neon would time-out with per-row
 * Prisma calls).
 *
 * Progress is reported through an async generator so the controller can stream
 * Server-Sent Events (SSE) to the browser with real-time percentage updates.
 *
 * Re-entrant / idempotent: slugs are "gpc-{code}", so re-uploading the same
 * or a newer release just upserts. Previous-release nodes absent from the new
 * file are soft-deactivated (isActive=false); products keep their FK.
 */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { randomUUID } from 'crypto';
import { Client as PgClient } from 'pg';

// ── GS1 GPC JSON types ────────────────────────────────────────────────────────

export interface GpcNode {
  Level: number;
  Code: number;
  Title: string;
  Definition: string | null;
  DefinitionExcludes: string | null;
  Active: boolean;
  Childs?: GpcNode[];
}

interface GpcFile {
  LanguageCode: string;
  DateUtc: string; // "d/m/yyyy"
  Schema: GpcNode[];
}

// ── Progress event shape (streamed to client) ─────────────────────────────────

export interface GpcProgressEvent {
  phase: 'parse' | 'connect' | 'version' | 'insert' | 'parents' | 'cleanup' | 'done' | 'error';
  message: string;
  current: number;
  total: number;
  pct: number;
  versionId?: string;
  activeNodes?: number;
  deactivated?: number;
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_LEVEL = 4;
const CHUNK = 1000;

const GPC_LEVEL_NAME: Record<number, string> = {
  1: 'SEGMENT', 2: 'FAMILY', 3: 'CLASS', 4: 'BRICK',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function gpcSlug(code: number): string { return `gpc-${code}`; }

function parseDateUtc(raw: string): string {
  const p = raw.trim().split('/');
  if (p.length !== 3) return raw.replace(/\D/g, '');
  const [d, m, y] = p;
  return `${y}${m.padStart(2, '0')}${d.padStart(2, '0')}`;
}

function flattenNodes(
  nodes: GpcNode[],
  parentCode: number | null = null,
): Array<{ node: GpcNode; parentCode: number | null }> {
  const out: Array<{ node: GpcNode; parentCode: number | null }> = [];
  for (const n of nodes) {
    if (n.Level > MAX_LEVEL) continue;
    out.push({ node: n, parentCode });
    if (n.Childs?.length) out.push(...flattenNodes(n.Childs, n.Code));
  }
  return out;
}

function esc(s: string | null): string {
  if (s === null) return 'NULL';
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function pct(cur: number, tot: number): number {
  return tot === 0 ? 100 : Math.round((cur / tot) * 100);
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class GpcImportService {
  private readonly logger = new Logger(GpcImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns an async generator that yields GpcProgressEvent objects.
   * The controller should consume these and write each one as an SSE frame.
   */
  async *importFromBuffer(
    buffer: Buffer,
  ): AsyncGenerator<GpcProgressEvent> {
    // ── 1. Parse JSON ──────────────────────────────────────────────────────
    yield { phase: 'parse', message: 'Parsing GPC file…', current: 0, total: 0, pct: 0 };

    let gpcFile: GpcFile;
    try {
      gpcFile = JSON.parse(buffer.toString('utf-8'));
    } catch {
      yield { phase: 'error', message: 'Invalid JSON', current: 0, total: 0, pct: 0, error: 'Could not parse file as JSON' };
      return;
    }

    if (!gpcFile?.Schema || !Array.isArray(gpcFile.Schema)) {
      yield { phase: 'error', message: 'Invalid GPC format', current: 0, total: 0, pct: 0, error: 'Missing Schema array in GPC JSON' };
      return;
    }

    const flat = flattenNodes(gpcFile.Schema);
    const total = flat.length;
    const releaseDate = parseDateUtc(gpcFile.DateUtc);
    const label = `GPC ${gpcFile.LanguageCode} ${gpcFile.DateUtc}`;

    yield { phase: 'parse', message: `Parsed ${total} nodes · release ${label}`, current: total, total, pct: 2 };

    // ── 2. Open a direct pg.Client (Neon cold-start safe) ─────────────────
    yield { phase: 'connect', message: 'Connecting to database…', current: 0, total, pct: 3 };

    const connStr = process.env.DATABASE_URL;
    if (!connStr) {
      yield { phase: 'error', message: 'No DATABASE_URL', current: 0, total, pct: 0, error: 'DATABASE_URL not configured' };
      return;
    }

    const pg = new PgClient({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 30_000,
      query_timeout: 120_000,
    });

    try {
      await pg.connect();
    } catch (e: any) {
      yield { phase: 'error', message: 'DB connection failed', current: 0, total, pct: 0, error: e.message };
      return;
    }

    yield { phase: 'connect', message: 'Connected', current: 0, total, pct: 5 };

    try {
      await pg.query('BEGIN');

      // ── 3. Upsert GpcTaxonomyVersion ─────────────────────────────────────
      yield { phase: 'version', message: 'Recording taxonomy version…', current: 0, total, pct: 6 };

      await pg.query(`UPDATE gpc_taxonomy_versions SET "isCurrent" = false WHERE "isCurrent" = true`);

      const vRes = await pg.query(`
        INSERT INTO gpc_taxonomy_versions (id, "releaseDate", label, "isCurrent", "nodeCount", "importedAt")
        VALUES ($1, $2, $3, true, $4, NOW())
        ON CONFLICT ("releaseDate") DO UPDATE
          SET label = EXCLUDED.label, "isCurrent" = true,
              "nodeCount" = EXCLUDED."nodeCount", "importedAt" = NOW()
        RETURNING id
      `, [randomUUID(), releaseDate, label, total]);

      const versionId: string = vRes.rows[0].id;
      yield { phase: 'version', message: `Version ID: ${versionId}`, current: 0, total, pct: 8, versionId };

      // ── 4. Pass 1 — bulk upsert nodes (no parentId) ───────────────────
      // Progress band: 8% → 60%
      const insertBand = { start: 8, end: 60 };
      let inserted = 0;

      for (let i = 0; i < flat.length; i += CHUNK) {
        const chunk = flat.slice(i, i + CHUNK);
        const values = chunk.map(({ node }) => {
          const descParts: string[] = [];
          if (node.Definition) descParts.push(node.Definition);
          if (node.DefinitionExcludes) descParts.push(`Excludes: ${node.DefinitionExcludes}`);
          const desc = descParts.length ? descParts.join('\n\n') : null;
          const level = node.Level - 1;
          const gpcLevel = GPC_LEVEL_NAME[node.Level] ?? 'BRICK';
          return `(${esc(randomUUID())},${esc(node.Title)},${esc(gpcSlug(node.Code))},` +
                 `${esc(desc)},${level},0,${node.Active},${node.Code},` +
                 `${esc(gpcLevel)},true,${esc(versionId)},NOW(),NOW())`;
        });

        await pg.query(`
          INSERT INTO marketplace_categories
            (id,name,slug,description,level,"sortOrder","isActive",
             "gpcCode","gpcLevel","isGpcStandard","gpcVersionId","createdAt","updatedAt")
          VALUES ${values.join(',')}
          ON CONFLICT (slug) DO UPDATE SET
            name            = EXCLUDED.name,
            description     = EXCLUDED.description,
            "isActive"      = EXCLUDED."isActive",
            "gpcLevel"      = EXCLUDED."gpcLevel",
            "isGpcStandard" = true,
            "gpcVersionId"  = EXCLUDED."gpcVersionId",
            "updatedAt"     = NOW()
        `);

        inserted += chunk.length;
        const curPct = insertBand.start + Math.round(
          ((inserted / total) * (insertBand.end - insertBand.start))
        );
        yield {
          phase: 'insert',
          message: `Inserted ${inserted} / ${total} nodes`,
          current: inserted, total, pct: curPct,
        };
      }

      // ── 5. Build slug→id map ──────────────────────────────────────────
      yield { phase: 'parents', message: 'Building node ID map…', current: inserted, total, pct: 61 };

      const slugList = flat.map(({ node }) => `'${gpcSlug(node.Code)}'`).join(',');
      const mapRes = await pg.query(
        `SELECT id, slug FROM marketplace_categories WHERE slug IN (${slugList})`
      );
      const slugToId = new Map<string, string>(mapRes.rows.map((r: any) => [r.slug, r.id]));

      // ── 6. Pass 2 — bulk UPDATE parentId ──────────────────────────────
      // Progress band: 62% → 92%
      const parentBand = { start: 62, end: 92 };
      const nodesWithParent = flat.filter(({ parentCode }) => parentCode !== null);
      let parented = 0;

      for (let i = 0; i < nodesWithParent.length; i += CHUNK) {
        const chunk = nodesWithParent.slice(i, i + CHUNK);
        const pairs = chunk
          .map(({ node, parentCode }) => {
            const nid = slugToId.get(gpcSlug(node.Code));
            const pid = slugToId.get(gpcSlug(parentCode!));
            return nid && pid ? `('${nid}','${pid}')` : null;
          })
          .filter(Boolean);

        if (pairs.length) {
          await pg.query(`
            UPDATE marketplace_categories AS mc
            SET "parentId" = v."parentId", "updatedAt" = NOW()
            FROM (VALUES ${pairs.join(',')}) AS v(id, "parentId")
            WHERE mc.id = v.id
          `);
        }

        parented += chunk.length;
        const curPct = parentBand.start + Math.round(
          ((parented / nodesWithParent.length) * (parentBand.end - parentBand.start))
        );
        yield {
          phase: 'parents',
          message: `Linked ${parented} / ${nodesWithParent.length} parent relationships`,
          current: parented, total: nodesWithParent.length, pct: curPct,
        };
      }

      // ── 7. Soft-deactivate removed nodes ─────────────────────────────
      yield { phase: 'cleanup', message: 'Deactivating removed nodes…', current: 0, total, pct: 93 };

      const currentCodes = flat.map(({ node }) => node.Code).join(',');
      const deactRes = await pg.query(`
        UPDATE marketplace_categories
        SET "isActive" = false, "updatedAt" = NOW()
        WHERE "isGpcStandard" = true
          AND "gpcVersionId" != $1
          AND "isActive" = true
          AND "gpcCode" NOT IN (${currentCodes})
        RETURNING id
      `, [versionId]);
      const deactivated = deactRes.rowCount ?? 0;

      // ── 8. Update version nodeCount ───────────────────────────────────
      const countRes = await pg.query(`
        SELECT COUNT(*)::int AS n FROM marketplace_categories
        WHERE "isGpcStandard" = true AND "gpcVersionId" = $1 AND "isActive" = true
      `, [versionId]);
      const activeNodes = countRes.rows[0].n as number;

      await pg.query(
        `UPDATE gpc_taxonomy_versions SET "nodeCount" = $1 WHERE id = $2`,
        [activeNodes, versionId]
      );

      await pg.query('COMMIT');

      yield {
        phase: 'done',
        message: `Import complete — ${activeNodes} active nodes, ${deactivated} deactivated`,
        current: total, total, pct: 100,
        versionId, activeNodes, deactivated,
      };

    } catch (e: any) {
      await pg.query('ROLLBACK').catch(() => {/* ignore */});
      this.logger.error('GPC import failed', e);
      yield {
        phase: 'error', message: 'Import failed', current: 0, total, pct: 0,
        error: e?.message ?? String(e),
      };
    } finally {
      await pg.end().catch(() => {/* ignore */});
    }
  }

  // ── Version management ─────────────────────────────────────────────────────

  async listVersions() {
    return this.prisma.client.gpcTaxonomyVersion.findMany({
      orderBy: { releaseDate: 'desc' },
    });
  }

  async getVersion(id: string) {
    const v = await this.prisma.client.gpcTaxonomyVersion.findUnique({ where: { id } });
    if (!v) throw new BadRequestException(`Version ${id} not found`);
    return v;
  }

  /**
   * Promote a previous release back to isCurrent.
   * Useful if a newer import had bad data and needs to be rolled back.
   */
  async setCurrentVersion(id: string) {
    await this.getVersion(id); // validates existence
    await this.prisma.client.gpcTaxonomyVersion.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });
    return this.prisma.client.gpcTaxonomyVersion.update({
      where: { id },
      data: { isCurrent: true },
    });
  }
}
