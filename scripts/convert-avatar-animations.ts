/**
 * Converts the avatar animation clips from FBX to GLB.
 *
 * The runtime used to load the FBX files directly through three's FBXLoader
 * on every avatar mount — roughly 10.7 MB of parsing on the main thread
 * before the character could move. GLB is dramatically smaller for the same
 * skeletal animation and parses through the same GLTFLoader the character
 * models already use.
 *
 * Idempotent: a clip whose .glb is newer than its .fbx is skipped unless
 * --force is passed. The .fbx files are kept as the source of truth; only
 * the generated .glb files are served.
 *
 *   npm run avatars:convert
 *   npm run avatars:convert -- --force
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const CONVERTER = path.join(REPO_ROOT, 'fbx2gltf.exe');
const ANIM_DIR = path.join(REPO_ROOT, 'public', 'ai-avatars', 'animations');

const force = process.argv.includes('--force');

function isStale(fbxPath: string, glbPath: string): boolean {
  if (!existsSync(glbPath)) return true;
  return statSync(fbxPath).mtimeMs > statSync(glbPath).mtimeMs;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function main(): void {
  if (!existsSync(CONVERTER)) {
    console.error(`FBX2glTF not found at ${CONVERTER}`);
    process.exit(1);
  }
  if (!existsSync(ANIM_DIR)) {
    console.error(`Animation directory not found at ${ANIM_DIR}`);
    process.exit(1);
  }

  const fbxFiles = readdirSync(ANIM_DIR).filter((f) => f.toLowerCase().endsWith('.fbx'));
  if (fbxFiles.length === 0) {
    console.log('No .fbx files to convert.');
    return;
  }

  let converted = 0;
  let skipped = 0;
  let totalIn = 0;
  let totalOut = 0;

  for (const file of fbxFiles) {
    const fbxPath = path.join(ANIM_DIR, file);
    const base = file.replace(/\.fbx$/i, '');
    const glbPath = path.join(ANIM_DIR, `${base}.glb`);

    if (!force && !isStale(fbxPath, glbPath)) {
      skipped++;
      totalIn += statSync(fbxPath).size;
      totalOut += statSync(glbPath).size;
      continue;
    }

    process.stdout.write(`Converting ${file} … `);
    try {
      // FBX2glTF appends its own suffix to -o, so it is given the path
      // without extension and the result is normalized afterwards.
      const outBase = path.join(ANIM_DIR, base);
      execFileSync(
        CONVERTER,
        ['--binary', '--anim-framerate', 'bake30', '-i', fbxPath, '-o', outBase],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );

      // Depending on version the tool emits "<base>.glb" or "<base>_out.glb".
      if (!existsSync(glbPath)) {
        const alt = path.join(ANIM_DIR, `${base}_out.glb`);
        if (existsSync(alt)) renameSync(alt, glbPath);
      }

      if (!existsSync(glbPath)) {
        console.log('FAILED (no output produced)');
        continue;
      }

      const inSize = statSync(fbxPath).size;
      const outSize = statSync(glbPath).size;
      totalIn += inSize;
      totalOut += outSize;
      converted++;
      console.log(`${mb(inSize)} -> ${mb(outSize)}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.log(`FAILED (${detail})`);
      // Never leave a half-written file behind for the runtime to load.
      if (existsSync(glbPath)) unlinkSync(glbPath);
    }
  }

  console.log(
    `\nConverted ${converted}, skipped ${skipped} (up to date). ` +
    `Total ${mb(totalIn)} FBX -> ${mb(totalOut)} GLB.`,
  );
}

main();
