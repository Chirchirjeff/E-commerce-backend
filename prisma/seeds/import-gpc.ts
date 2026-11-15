/**
 * GPC Import Script
 * =================
 * Imports the GS1 Global Product Classification (GPC) taxonomy into the
 * marketplace_categories table.
 *
 * Usage:
 *   ts-node --transpile-only prisma/seeds/import-gpc.ts [path-to-gpc.json]
 *
 * Default JSON path:
 *   prisma/gpc-data/GPC as of May 2026 (2026-05-20) EN.json
 *
 * Design decisions:
 *  - Only levels 1–4 are imported (Segment → Family → Class → Brick).
 *    Levels 5–6 are attribute type/value metadata, not product categories.
 *  - Slugs are deterministic: "gpc-{code}" (e.g. "gpc-10001674").
 *    This guarantees uniqueness across the full taxonomy and makes re-runs
 *    idempotent via upsert.
 *  - Single bulk INSERT … ON CONFLICT for each pass — far faster than
 *    per-row upserts over a remote DB (Neon).
 *  - Two-pass import: first insert every node without parentId, then a
 *    second bulk UPDATE sets all parentIds using a VALUES join. This avoids
 *    ordering dependencies across 6 000+ rows.
 *  - Only one GpcTaxonomyVersion is marked isCurrent=true at a time.
 *    Running this script for a newer release automatically demotes the old one.
 *  - Existing GPC nodes from a previous release are NOT deleted. They are
 *    soft-deactivated (isActive=false) if their code no longer appears in the
 *    new release. Products that referenced old codes keep their FK intact.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client as PgClient } from 'pg';
import { randomUUID } from 'crypto';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ── Types ─────────────────────────────────────────────────────────────────────

interface GpcNode {
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
  DateUtc: string; // "20/5/2026"
  Schema: GpcNode[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GPC_LEVEL_NAMES: Record<number, string> = {
  1: 'SEGMENT',
  2: 'FAMILY',
  3: 'CLASS',
  4: 'BRICK',
};

const MAX_IMPORT_LEVEL = 4;
const CHUNK_SIZE = 1000; // rows per INSERT statement

// ── Helpers ───────────────────────────────────────────────────────────────────

function gpcSlug(code: number): string {
  return `gpc-${code}`;
}

function parseDateUtc(raw: string): string {
  const parts = raw.trim().split('/');
  if (parts.length !== 3) return raw.replace(/\D/g, '');
  const [d, m, y] = parts;
  return `${y}${m.padStart(2, '0')}${d.padStart(2, '0')}`;
}

function flattenNodes(
  nodes: GpcNode[],
  parentCode: number | null = null,
): Array<{ node: GpcNode; parentCode: number | null }> {
  const result: Array<{ node: GpcNode; parentCode: number | null }> = [];
  for (const node of nodes) {
    if (node.Level > MAX_IMPORT_LEVEL) continue;
    result.push({ node, parentCode });
    if (node.Childs && node.Childs.length > 0) {
      result.push(...flattenNodes(node.Childs, node.Code));
    }
  }
  return result;
}

function escapeStr(s: string | null): string {
  if (s === null) return 'NULL';
  // Escape single quotes and backslashes for PostgreSQL literal
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function importGpc(jsonFilePath: string): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');

  // ── 0. Load & validate JSON ────────────────────────────────────────────────
  console.log(`\n📂 Reading GPC file: ${jsonFilePath}`);
  if (!fs.existsSync(jsonFilePath)) throw new Error(`File not found: ${jsonFilePath}`);
  const raw = fs.readFileSync(jsonFilePath, 'utf-8');
  const gpcFile: GpcFile = JSON.parse(raw);
  if (!gpcFile.Schema || !Array.isArray(gpcFile.Schema)) throw new Error('Invalid GPC JSON');

  const releaseDate = parseDateUtc(gpcFile.DateUtc);
  const label = `GPC ${gpcFile.LanguageCode} ${gpcFile.DateUtc}`;
  console.log(`📋 Release: ${label}  (date key: ${releaseDate})`);

  // ── 1. Flatten nodes (levels 1–4 only) ────────────────────────────────────
  const flat = flattenNodes(gpcFile.Schema);
  console.log(`📊 Nodes to import (levels 1–4): ${flat.length}`);

  // ── 2. Connect (pg handles Neon cold-start retries better than Prisma) ────
  console.log('\n🔌 Connecting to database…');
  const client = new PgClient({
    connectionString,
    ssl: { rejectUnauthorized: false },
    // Give the Neon endpoint plenty of time to wake up
    connectionTimeoutMillis: 30000,
    query_timeout: 120000,
  });
  await client.connect();
  console.log('   ✅ Connected');

  try {
    await client.query('BEGIN');

    // ── 3. Upsert the GpcTaxonomyVersion row ──────────────────────────────
    console.log('\n🔖 Upserting taxonomy version record…');
    await client.query(`UPDATE gpc_taxonomy_versions SET "isCurrent" = false WHERE "isCurrent" = true`);

    const versionRes = await client.query(`
      INSERT INTO gpc_taxonomy_versions (id, "releaseDate", label, "isCurrent", "nodeCount", "importedAt")
      VALUES ($1, $2, $3, true, $4, NOW())
      ON CONFLICT ("releaseDate") DO UPDATE
        SET label = EXCLUDED.label,
            "isCurrent" = true,
            "nodeCount" = EXCLUDED."nodeCount",
            "importedAt" = NOW()
      RETURNING id
    `, [randomUUID(), releaseDate, label, flat.length]);

    const versionId: string = versionRes.rows[0].id;
    console.log(`   ✅ Version ID: ${versionId}`);

    // ── 4. Pass 1 — bulk upsert all nodes (no parentId) ───────────────────
    console.log('\n⬆️  Pass 1: bulk-upserting nodes…');

    for (let i = 0; i < flat.length; i += CHUNK_SIZE) {
      const chunk = flat.slice(i, i + CHUNK_SIZE);
      const values = chunk.map(({ node }) => {
        const id = randomUUID();
        const slug = gpcSlug(node.Code);
        const name = node.Title.replace(/\\/g, '\\\\').replace(/'/g, "''");
        const descParts: string[] = [];
        if (node.Definition) descParts.push(node.Definition);
        if (node.DefinitionExcludes) descParts.push(`Excludes: ${node.DefinitionExcludes}`);
        const desc = descParts.length > 0
          ? descParts.join('\n\n').replace(/\\/g, '\\\\').replace(/'/g, "''")
          : null;
        const level = node.Level - 1; // GPC level 1 = platform level 0
        const gpcLevel = GPC_LEVEL_NAMES[node.Level] ?? 'BRICK';
        const isActive = node.Active;

        return `('${id}', '${name}', '${slug}', ${desc ? `'${desc}'` : 'NULL'}, ` +
               `${level}, 0, ${isActive}, ${node.Code}, '${gpcLevel}', true, '${versionId}', ` +
               `NOW(), NOW())`;
      });

      await client.query(`
        INSERT INTO marketplace_categories
          (id, name, slug, description, level, "sortOrder", "isActive",
           "gpcCode", "gpcLevel", "isGpcStandard", "gpcVersionId",
           "createdAt", "updatedAt")
        VALUES ${values.join(',\n')}
        ON CONFLICT (slug) DO UPDATE SET
          name            = EXCLUDED.name,
          description     = EXCLUDED.description,
          "isActive"      = EXCLUDED."isActive",
          "gpcLevel"      = EXCLUDED."gpcLevel",
          "isGpcStandard" = true,
          "gpcVersionId"  = EXCLUDED."gpcVersionId",
          "updatedAt"     = NOW()
      `);

      process.stdout.write(`\r   ${Math.min(i + CHUNK_SIZE, flat.length)}/${flat.length} nodes`);
    }
    console.log('\n   ✅ Pass 1 complete');

    // ── 5. Build slug→id map from DB ──────────────────────────────────────
    console.log('\n🗺️  Fetching id map…');
    const slugs = flat.map(({ node }) => `'${gpcSlug(node.Code)}'`).join(',');
    const mapRes = await client.query(
      `SELECT id, slug FROM marketplace_categories WHERE slug IN (${slugs})`
    );
    const slugToId = new Map<string, string>(mapRes.rows.map((r: any) => [r.slug, r.id]));
    console.log(`   ✅ Mapped ${slugToId.size} nodes`);

    // ── 6. Pass 2 — bulk UPDATE parentId via VALUES join ──────────────────
    console.log('\n🔗 Pass 2: setting parentIds…');

    const nodesWithParent = flat.filter(({ parentCode }) => parentCode !== null);

    for (let i = 0; i < nodesWithParent.length; i += CHUNK_SIZE) {
      const chunk = nodesWithParent.slice(i, i + CHUNK_SIZE);
      const pairs = chunk
        .map(({ node, parentCode }) => {
          const nodeId = slugToId.get(gpcSlug(node.Code));
          const parentId = slugToId.get(gpcSlug(parentCode!));
          if (!nodeId || !parentId) return null;
          return `('${nodeId}','${parentId}')`;
        })
        .filter(Boolean);

      if (pairs.length === 0) continue;

      await client.query(`
        UPDATE marketplace_categories AS mc
        SET "parentId" = v."parentId", "updatedAt" = NOW()
        FROM (VALUES ${pairs.join(',')}) AS v(id, "parentId")
        WHERE mc.id = v.id
      `);

      process.stdout.write(`\r   ${Math.min(i + CHUNK_SIZE, nodesWithParent.length)}/${nodesWithParent.length} parents set`);
    }
    console.log('\n   ✅ Pass 2 complete');

    // ── 7. Soft-deactivate nodes from previous releases not in this one ──
    console.log('\n🗑️  Soft-deactivating removed GPC nodes…');
    const currentCodes = flat.map(({ node }) => node.Code).join(',');
    const deactivateRes = await client.query(`
      UPDATE marketplace_categories
      SET "isActive" = false, "updatedAt" = NOW()
      WHERE "isGpcStandard" = true
        AND "gpcVersionId" != $1
        AND "isActive" = true
        AND "gpcCode" NOT IN (${currentCodes})
      RETURNING id
    `, [versionId]);
    const deactivatedCount = deactivateRes.rowCount ?? 0;
    if (deactivatedCount > 0) {
      console.log(`   ⚠️  Soft-deactivated ${deactivatedCount} removed node(s)`);
    } else {
      console.log('   ✅ No nodes removed');
    }

    // ── 8. Update version nodeCount ───────────────────────────────────────
    const countRes = await client.query(`
      SELECT COUNT(*) AS n FROM marketplace_categories
      WHERE "isGpcStandard" = true AND "gpcVersionId" = $1 AND "isActive" = true
    `, [versionId]);
    const activeCount = parseInt(countRes.rows[0].n, 10);
    await client.query(
      `UPDATE gpc_taxonomy_versions SET "nodeCount" = $1 WHERE id = $2`,
      [activeCount, versionId]
    );

    await client.query('COMMIT');

    // ── 9. Summary ────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════');
    console.log('✅ GPC import complete');
    console.log(`   Release:        ${label}`);
    console.log(`   Release date:   ${releaseDate}`);
    console.log(`   Active nodes:   ${activeCount}`);
    console.log(`   Deactivated:    ${deactivatedCount}`);
    console.log(`   Version ID:     ${versionId}`);
    console.log('════════════════════════════════════════\n');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const defaultJsonPath = path.resolve(
  __dirname,
  '../gpc-data/GPC as of May 2026 (2026-05-20) EN.json',
);

const jsonFilePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultJsonPath;

importGpc(jsonFilePath).catch((err) => {
  console.error('\n❌ GPC import failed:', err);
  process.exit(1);
});
