import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const walk = (directory, base = directory, collected = []) => {
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, base, collected);
    } else {
      collected.push({
        path: path.relative(base, full).split(path.sep).join('/'),
        bytes: stats.size,
      });
    }
  }
  return collected;
};

/**
 * 打包/归档时对整个 data 目录做快照，写入 backups/<时间戳>/data 并生成 manifest。
 * 只读取 data，不修改任何既有数据。
 */
export const createBackupService = ({ dataDirectory, backupDirectory }) => ({
  snapshot({ label = 'data' } = {}) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const targetRoot = path.join(backupDirectory, stamp);
    const targetData = path.join(targetRoot, 'data');

    mkdirSync(targetRoot, { recursive: true });

    let files = [];
    if (existsSync(dataDirectory)) {
      cpSync(dataDirectory, targetData, { recursive: true });
      files = walk(targetData, targetData);
    } else {
      mkdirSync(targetData, { recursive: true });
    }

    const manifest = {
      label,
      createdAt: new Date().toISOString(),
      source: dataDirectory,
      destination: targetData,
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      files,
    };
    writeFileSync(
      path.join(targetRoot, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    return {
      directory: targetRoot,
      dataDirectory: targetData,
      fileCount: manifest.fileCount,
      totalBytes: manifest.totalBytes,
    };
  },

  listSnapshots() {
    if (!existsSync(backupDirectory)) {
      return [];
    }
    return readdirSync(backupDirectory).filter((name) => {
      try {
        return (
          statSync(path.join(backupDirectory, name)).isDirectory() &&
          existsSync(path.join(backupDirectory, name, 'manifest.json'))
        );
      } catch {
        return false;
      }
    });
  },
});
