const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'this', 'that', 'these', 'those',
  'it', 'its', 'as', 'from', 'by', 'not', 'no', 'so', 'than', 'then',
]);

export interface TfidfResult {
  vectors: Record<string, number[]>;
  vocabulary: string[];
}

export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

export function computeTfidf(documents: string[]): TfidfResult {
  const tokenized = documents.map((doc) => tokenizeText(doc));
  const vocabulary = new Set<string>();
  for (const tokens of tokenized) {
    for (const t of tokens) {
      vocabulary.add(t);
    }
  }
  const vocabArray = [...vocabulary].sort();

  const N = documents.length;
  const vectors: Record<string, number[]> = {};

  for (let i = 0; i < N; i++) {
    const tokens = tokenized[i];
    const termFreq = new Map<string, number>();
    for (const t of tokens) {
      termFreq.set(t, (termFreq.get(t) || 0) + 1);
    }

    const vector: number[] = [];
    for (const term of vocabArray) {
      const tf = termFreq.get(term) || 0;
      const df = docFrequency(tokenized, term);
      const idf = Math.log((N + 1) / (df + 1)) + 1;
      vector.push(tf * idf);
    }
    vectors[`doc_${i}`] = vector;
  }

  return { vectors, vocabulary: vocabArray };
}

function docFrequency(tokenizedDocs: string[][], term: string): number {
  return tokenizedDocs.filter((doc) => doc.includes(term)).length;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  if (magA === 0 || magB === 0) return 0;

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function computeTextSimilarity(textA: string, textB: string): number {
  const docs = [textA, textB];
  const { vectors } = computeTfidf(docs);
  const vecA = vectors['doc_0'];
  const vecB = vectors['doc_1'];
  return cosineSimilarity(vecA, vecB);
}
