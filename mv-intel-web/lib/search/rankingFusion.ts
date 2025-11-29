// Enhanced Knowledge Graph Intelligence - Ranking Fusion
// Implements Reciprocal Rank Fusion (RRF) for better text+vector ranking combination

export interface SearchResult {
  id: string;
  name: string;
  type: string;
  similarity?: number;
  textScore?: number;
  metadata?: any;
  rrfScore?: number;
  finalScore?: number;
}

export interface RankingWeights {
  textWeight: number;
  vectorWeight: number;
  graphWeight: number;
  rrfK: number;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  textWeight: 0.4,
  vectorWeight: 0.4,
  graphWeight: 0.2,
  rrfK: 60
};

/**
 * Reciprocal Rank Fusion (RRF) - Combines multiple ranked lists better than weighted sum
 * RRF score = sum(1 / (k + rank)) for each list where the item appears
 */
export function reciprocalRankFusion(
  textResults: SearchResult[],
  vectorResults: SearchResult[],
  graphResults?: SearchResult[],
  k: number = DEFAULT_WEIGHTS.rrfK
): SearchResult[] {
  const scores = new Map<string, number>();
  const resultMap = new Map<string, SearchResult>();
  
  // Process text results
  textResults.forEach((result, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    scores.set(result.id, (scores.get(result.id) || 0) + rrfScore);
    resultMap.set(result.id, { ...result, textScore: result.similarity || 0 });
  });
  
  // Process vector results
  vectorResults.forEach((result, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    scores.set(result.id, (scores.get(result.id) || 0) + rrfScore);
    const existing = resultMap.get(result.id);
    if (existing) {
      existing.similarity = result.similarity || 0;
    } else {
      resultMap.set(result.id, { ...result, textScore: 0 });
    }
  });
  
  // Process graph results if provided
  if (graphResults) {
    graphResults.forEach((result, rank) => {
      const rrfScore = 1 / (k + rank + 1);
      scores.set(result.id, (scores.get(result.id) || 0) + rrfScore);
      const existing = resultMap.get(result.id);
      if (existing) {
        existing.metadata = { ...existing.metadata, ...result.metadata };
      } else {
        resultMap.set(result.id, { ...result, textScore: 0, similarity: 0 });
      }
    });
  }
  
  // Merge and sort by RRF score
  return Array.from(scores.entries())
    .map(([id, rrfScore]) => {
      const result = resultMap.get(id)!;
      return {
        ...result,
        rrfScore,
        finalScore: rrfScore
      };
    })
    .sort((a, b) => b.rrfScore - a.rrfScore);
}

/**
 * Weighted Score Fusion - Traditional weighted combination
 */
export function weightedScoreFusion(
  textResults: SearchResult[],
  vectorResults: SearchResult[],
  graphResults?: SearchResult[],
  weights: RankingWeights = DEFAULT_WEIGHTS
): SearchResult[] {
  const resultMap = new Map<string, SearchResult>();
  
  // Process text results
  textResults.forEach(result => {
    resultMap.set(result.id, { 
      ...result, 
      textScore: result.similarity || 0,
      finalScore: (result.similarity || 0) * weights.textWeight
    });
  });
  
  // Process vector results
  vectorResults.forEach(result => {
    const existing = resultMap.get(result.id);
    if (existing) {
      existing.similarity = result.similarity || 0;
      existing.finalScore = (existing.finalScore || 0) + (result.similarity || 0) * weights.vectorWeight;
    } else {
      resultMap.set(result.id, { 
        ...result, 
        textScore: 0,
        finalScore: (result.similarity || 0) * weights.vectorWeight
      });
    }
  });
  
  // Process graph results if provided
  if (graphResults) {
    graphResults.forEach(result => {
      const existing = resultMap.get(result.id);
      if (existing) {
        existing.metadata = { ...existing.metadata, ...result.metadata };
        existing.finalScore = (existing.finalScore || 0) + (result.metadata?.graph_centrality || 0) * weights.graphWeight;
      } else {
        resultMap.set(result.id, { 
          ...result, 
          textScore: 0, 
          similarity: 0,
          finalScore: (result.metadata?.graph_centrality || 0) * weights.graphWeight
        });
      }
    });
  }
  
  return Array.from(resultMap.values())
    .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
}

/**
 * Hybrid Fusion - Combines RRF with weighted scoring for optimal results
 */
export function hybridFusion(
  textResults: SearchResult[],
  vectorResults: SearchResult[],
  graphResults?: SearchResult[],
  weights: RankingWeights = DEFAULT_WEIGHTS
): SearchResult[] {
  // Get RRF scores
  const rrfResults = reciprocalRankFusion(textResults, vectorResults, graphResults, weights.rrfK);
  
  // Get weighted scores
  const weightedResults = weightedScoreFusion(textResults, vectorResults, graphResults, weights);
  
  // Combine both approaches
  const combinedMap = new Map<string, SearchResult>();
  
  rrfResults.forEach(result => {
    const weighted = weightedResults.find(w => w.id === result.id);
    combinedMap.set(result.id, {
      ...result,
      finalScore: (result.rrfScore || 0) * 0.6 + (weighted?.finalScore || 0) * 0.4
    });
  });
  
  return Array.from(combinedMap.values())
    .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
}

/**
 * Adaptive Fusion - Adjusts weights based on result quality
 */
export function adaptiveFusion(
  textResults: SearchResult[],
  vectorResults: SearchResult[],
  graphResults?: SearchResult[],
  baseWeights: RankingWeights = DEFAULT_WEIGHTS
): SearchResult[] {
  // Calculate result quality metrics
  const textQuality = calculateResultQuality(textResults);
  const vectorQuality = calculateResultQuality(vectorResults);
  const graphQuality = graphResults ? calculateResultQuality(graphResults) : 0;
  
  // Adjust weights based on quality
  const totalQuality = textQuality + vectorQuality + graphQuality;
  const adjustedWeights: RankingWeights = {
    textWeight: totalQuality > 0 ? (textQuality / totalQuality) * 0.8 : baseWeights.textWeight,
    vectorWeight: totalQuality > 0 ? (vectorQuality / totalQuality) * 0.8 : baseWeights.vectorWeight,
    graphWeight: totalQuality > 0 ? (graphQuality / totalQuality) * 0.8 : baseWeights.graphWeight,
    rrfK: baseWeights.rrfK
  };
  
  return hybridFusion(textResults, vectorResults, graphResults, adjustedWeights);
}

/**
 * Calculate result quality based on score distribution and diversity
 */
function calculateResultQuality(results: SearchResult[]): number {
  if (results.length === 0) return 0;
  
  const scores = results.map(r => r.similarity || 0);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const maxScore = Math.max(...scores);
  const scoreVariance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
  
  // Quality is based on average score, max score, and diversity (variance)
  return (avgScore * 0.4 + maxScore * 0.4 + Math.min(scoreVariance, 0.1) * 0.2);
}

/**
 * Boost results based on entity importance and recency
 */
export function boostResults(
  results: SearchResult[],
  importanceBoost: number = 0.1,
  recencyBoost: number = 0.05
): SearchResult[] {
  return results.map(result => {
    const importance = result.metadata?.importance || 0.5;
    const recency = result.metadata?.last_updated ? 
      Math.max(0, 1 - (Date.now() - new Date(result.metadata.last_updated).getTime()) / (365 * 24 * 60 * 60 * 1000)) : 0;
    
    const boost = importance * importanceBoost + recency * recencyBoost;
    
    return {
      ...result,
      finalScore: (result.finalScore || 0) + boost
    };
  }).sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
}
