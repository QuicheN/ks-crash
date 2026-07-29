// persistence/LayoutStorageError.js
// The single error type that crosses the persistence boundary. Adapters translate whatever
// their medium throws — QuotaExceededError, a JSON parse failure, an HTTP 503 — into one of
// these with a message safe to show a user. Nothing above `persistence/` should ever have to
// know that browser storage or a network exists, and that includes its failure modes.
export class LayoutStorageError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'LayoutStorageError';
  }
}
