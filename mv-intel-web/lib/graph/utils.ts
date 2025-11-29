// Enhanced Knowledge Graph Intelligence - Graph Utilities
// Common utility functions for graph operations

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calculate Euclidean distance between two vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  
  return Math.sqrt(sum);
}

/**
 * Normalize vector to unit length
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  
  if (magnitude === 0) {
    return vector;
  }
  
  return vector.map(val => val / magnitude);
}

/**
 * Calculate dot product of two vectors
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/**
 * Generate random vector of specified length
 */
export function randomVector(length: number): number[] {
  return Array.from({ length }, () => Math.random() * 2 - 1);
}

/**
 * Calculate mean of vectors
 */
export function vectorMean(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    return [];
  }
  
  const length = vectors[0].length;
  const mean = new Array(length).fill(0);
  
  for (const vector of vectors) {
    for (let i = 0; i < length; i++) {
      mean[i] += vector[i];
    }
  }
  
  return mean.map(val => val / vectors.length);
}

/**
 * Calculate weighted mean of vectors
 */
export function weightedVectorMean(vectors: number[][], weights: number[]): number[] {
  if (vectors.length !== weights.length) {
    throw new Error('Vectors and weights must have the same length');
  }
  
  if (vectors.length === 0) {
    return [];
  }
  
  const length = vectors[0].length;
  const weightedSum = new Array(length).fill(0);
  let totalWeight = 0;
  
  for (let i = 0; i < vectors.length; i++) {
    const weight = weights[i];
    totalWeight += weight;
    
    for (let j = 0; j < length; j++) {
      weightedSum[j] += vectors[i][j] * weight;
    }
  }
  
  return weightedSum.map(val => val / totalWeight);
}

/**
 * Calculate centroid of points
 */
export function calculateCentroid(points: number[][]): number[] {
  return vectorMean(points);
}

/**
 * Calculate distance matrix between vectors
 */
export function distanceMatrix(vectors: number[][], distanceFn: (a: number[], b: number[]) => number = euclideanDistance): number[][] {
  const n = vectors.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 0;
      } else {
        matrix[i][j] = distanceFn(vectors[i], vectors[j]);
      }
    }
  }
  
  return matrix;
}

/**
 * Find nearest neighbors for a given vector
 */
export function findNearestNeighbors(
  queryVector: number[],
  vectors: number[][],
  k: number = 5,
  distanceFn: (a: number[], b: number[]) => number = euclideanDistance
): Array<{ index: number; distance: number; similarity: number }> {
  const distances = vectors.map((vector, index) => ({
    index,
    distance: distanceFn(queryVector, vector),
    similarity: cosineSimilarity(queryVector, vector)
  }));
  
  return distances
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
}

/**
 * Calculate silhouette score for clustering evaluation
 */
export function silhouetteScore(
  vectors: number[][],
  labels: number[],
  distanceFn: (a: number[], b: number[]) => number = euclideanDistance
): number {
  const n = vectors.length;
  const uniqueLabels = [...new Set(labels)];
  
  if (uniqueLabels.length < 2) {
    return 0;
  }
  
  let totalSilhouette = 0;
  
  for (let i = 0; i < n; i++) {
    const label = labels[i];
    const vector = vectors[i];
    
    // Calculate average distance within cluster
    const sameClusterVectors = vectors.filter((_, idx) => labels[idx] === label && idx !== i);
    const avgIntraCluster = sameClusterVectors.length > 0 
      ? sameClusterVectors.reduce((sum, v) => sum + distanceFn(vector, v), 0) / sameClusterVectors.length
      : 0;
    
    // Calculate average distance to nearest other cluster
    const otherLabels = uniqueLabels.filter(l => l !== label);
    let minAvgInterCluster = Infinity;
    
    for (const otherLabel of otherLabels) {
      const otherClusterVectors = vectors.filter((_, idx) => labels[idx] === otherLabel);
      const avgInterCluster = otherClusterVectors.reduce((sum, v) => sum + distanceFn(vector, v), 0) / otherClusterVectors.length;
      minAvgInterCluster = Math.min(minAvgInterCluster, avgInterCluster);
    }
    
    // Calculate silhouette for this point
    const silhouette = (minAvgInterCluster - avgIntraCluster) / Math.max(avgIntraCluster, minAvgInterCluster);
    totalSilhouette += silhouette;
  }
  
  return totalSilhouette / n;
}

/**
 * Calculate Davies-Bouldin index for clustering evaluation
 */
export function daviesBouldinIndex(
  vectors: number[][],
  labels: number[],
  distanceFn: (a: number[], b: number[]) => number = euclideanDistance
): number {
  const uniqueLabels = [...new Set(labels)];
  const n = uniqueLabels.length;
  
  if (n < 2) {
    return 0;
  }
  
  // Calculate cluster centroids and average distances
  const centroids: number[][] = [];
  const avgDistances: number[] = [];
  
  for (const label of uniqueLabels) {
    const clusterVectors = vectors.filter((_, idx) => labels[idx] === label);
    const centroid = calculateCentroid(clusterVectors);
    centroids.push(centroid);
    
    const avgDistance = clusterVectors.reduce((sum, v) => sum + distanceFn(v, centroid), 0) / clusterVectors.length;
    avgDistances.push(avgDistance);
  }
  
  // Calculate Davies-Bouldin index
  let maxRatio = 0;
  
  for (let i = 0; i < n; i++) {
    let maxRatioForI = 0;
    
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const centroidDistance = distanceFn(centroids[i], centroids[j]);
        const ratio = (avgDistances[i] + avgDistances[j]) / centroidDistance;
        maxRatioForI = Math.max(maxRatioForI, ratio);
      }
    }
    
    maxRatio += maxRatioForI;
  }
  
  return maxRatio / n;
}

/**
 * Calculate Calinski-Harabasz index for clustering evaluation
 */
export function calinskiHarabaszIndex(
  vectors: number[][],
  labels: number[],
  distanceFn: (a: number[], b: number[]) => number = euclideanDistance
): number {
  const uniqueLabels = [...new Set(labels)];
  const n = vectors.length;
  const k = uniqueLabels.length;
  
  if (k < 2 || n < k) {
    return 0;
  }
  
  // Calculate overall centroid
  const overallCentroid = calculateCentroid(vectors);
  
  // Calculate between-cluster sum of squares
  let betweenSS = 0;
  for (const label of uniqueLabels) {
    const clusterVectors = vectors.filter((_, idx) => labels[idx] === label);
    const clusterCentroid = calculateCentroid(clusterVectors);
    const clusterSize = clusterVectors.length;
    const centroidDistance = distanceFn(overallCentroid, clusterCentroid);
    betweenSS += clusterSize * centroidDistance * centroidDistance;
  }
  
  // Calculate within-cluster sum of squares
  let withinSS = 0;
  for (const label of uniqueLabels) {
    const clusterVectors = vectors.filter((_, idx) => labels[idx] === label);
    const clusterCentroid = calculateCentroid(clusterVectors);
    
    for (const vector of clusterVectors) {
      const distance = distanceFn(vector, clusterCentroid);
      withinSS += distance * distance;
    }
  }
  
  return (betweenSS / (k - 1)) / (withinSS / (n - k));
}

/**
 * Generate color palette for visualization
 */
export function generateColorPalette(count: number): string[] {
  const colors: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const hue = (i * 137.5) % 360; // Golden angle approximation
    const saturation = 70 + (i % 3) * 10; // Vary saturation
    const lightness = 50 + (i % 2) * 20; // Vary lightness
    
    colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
  }
  
  return colors;
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
