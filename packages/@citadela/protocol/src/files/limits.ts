export const FileTransferLimits = Object.freeze({
  maxChunkBytes: 16 * 1024 * 1024,
  maxItemsPerOperation: 1_000_000,
  maxDirectoryDepth: 32,
  maxConcurrentTransfers: 4,
  maxTransferLifetimeMs: 24 * 60 * 60 * 1000,
  maxPageSize: 10_000,
});

