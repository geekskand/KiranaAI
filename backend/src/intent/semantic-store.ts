/**
 * SemanticStore — lightweight in-memory semantic retrieval.
 *
 * This is the FALLBACK embedding + vector store used when a managed vector
 * database (e.g., Bedrock Knowledge Base / OpenSearch) is unavailable.
 * It computes a bag-of-words TF vector per document and ranks by cosine
 * similarity against the query. The interface is intentionally identical to
 * what a real vector store would expose, so it can be swapped without
 * touching callers (provider-fallback pattern).
 */

export interface StoredDoc<M = Record<string, unknown>> {
  id: string;
  text: string;
  metadata?: M;
}

export interface ScoredDoc<M = Record<string, unknown>> extends StoredDoc<M> {
  score: number;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'is', 'are', 'i',
  'me', 'my', 'you', 'with', 'on', 'at', 'it', 'this', 'that', 'do', 'have',
  'want', 'need', 'get', 'some', 'any', 'please', 'add', 'show',
]);

/** Tokenize text into normalized terms. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Build a term-frequency map for a token list. */
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

/** Cosine similarity between two TF maps. */
function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [term, weight] of a) {
    const bw = b.get(term);
    if (bw) dot += weight * bw;
  }
  if (dot === 0) return 0;
  let magA = 0;
  for (const w of a.values()) magA += w * w;
  let magB = 0;
  for (const w of b.values()) magB += w * w;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export class SemanticStore<M = Record<string, unknown>> {
  private docs: Array<StoredDoc<M> & { tf: Map<string, number> }> = [];

  constructor(public readonly name: string) {}

  /** Add or replace a document. */
  upsert(doc: StoredDoc<M>): void {
    const tf = termFreq(tokenize(doc.text));
    const existing = this.docs.findIndex((d) => d.id === doc.id);
    const record = { ...doc, tf };
    if (existing >= 0) this.docs[existing] = record;
    else this.docs.push(record);
  }

  /** Bulk add. */
  upsertMany(docs: StoredDoc<M>[]): void {
    for (const d of docs) this.upsert(d);
  }

  /** Retrieve the top-k most relevant documents for a query. */
  query(text: string, k = 5, minScore = 0.01): ScoredDoc<M>[] {
    const qtf = termFreq(tokenize(text));
    if (qtf.size === 0) return [];
    return this.docs
      .map((d) => ({
        id: d.id,
        text: d.text,
        metadata: d.metadata,
        score: cosine(qtf, d.tf),
      }))
      .filter((d) => d.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /** Number of documents stored. */
  size(): number {
    return this.docs.length;
  }

  /** All docs (for export/debug). */
  all(): StoredDoc<M>[] {
    return this.docs.map(({ id, text, metadata }) => ({ id, text, metadata }));
  }
}
