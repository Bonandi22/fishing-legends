import { validateLocalSave } from './service.js';

export function createMemoryMigrationService() {
  const imported = new Set<string>();
  return {
    preview(_userId: string, input: unknown) {
      const result = validateLocalSave(input);
      return { sourceVersion: result.sourceVersion, summary: result.summary, rejected: result.rejected };
    },
    import(userId: string, input: unknown, _key: string) {
      const result = validateLocalSave(input);
      if (imported.has(userId)) throw new Error('LOCAL_SAVE_ALREADY_IMPORTED');
      imported.add(userId);
      return { imported: true, sourceVersion: result.sourceVersion, summary: result.summary };
    },
  };
}
