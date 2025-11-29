-- Enhanced Knowledge Graph Intelligence - Graph Ranking Functions
-- Create functions that boost ranking based on graph structure and centrality

-- Graph-aware semantic search with centrality boost
CREATE OR REPLACE FUNCTION graph.semantic_search_with_graph_boost(
  query_embedding vector(1536), -- Will be updated to 3072d later
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 50
) RETURNS TABLE (
  id uuid,
  name text,
  type text,
  semantic_score float,
  graph_centrality float,
  final_score float
) AS $$
  WITH semantic_matches AS (
    SELECT 
      e.id,
      e.name,
      e.type,
      1 - (e.embedding <=> query_embedding) as semantic_score
    FROM graph.entities e
    WHERE e.embedding IS NOT NULL
      AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ),
  graph_metrics AS (
    SELECT 
      e.id,
      COUNT(DISTINCT ed.id)::float / NULLIF((SELECT COUNT(*) FROM graph.edges), 0) as centrality
    FROM graph.entities e
    LEFT JOIN graph.edges ed ON (e.id = ed.source OR e.id = ed.target)
    GROUP BY e.id
  )
  SELECT 
    sm.id,
    sm.name,
    sm.type,
    sm.semantic_score,
    COALESCE(gm.centrality, 0) as graph_centrality,
    (sm.semantic_score * 0.7 + COALESCE(gm.centrality, 0) * 0.3) as final_score
  FROM semantic_matches sm
  LEFT JOIN graph_metrics gm ON sm.id = gm.id
  ORDER BY final_score DESC
  LIMIT match_count;
$$ LANGUAGE sql;

-- Enhanced hybrid search with multiple ranking factors
CREATE OR REPLACE FUNCTION graph.hybrid_search_enhanced(
  query_text text,
  query_embedding vector(1536), -- Will be updated to 3072d later
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 50
) RETURNS TABLE (
  id uuid,
  name text,
  type text,
  text_score float,
  semantic_score float,
  graph_centrality float,
  final_score float
) AS $$
  WITH text_matches AS (
    SELECT 
      e.id,
      e.name,
      e.type,
      ts_rank(
        to_tsvector('english', COALESCE(e.name, '') || ' ' || COALESCE(e.industry, '') || ' ' || COALESCE(e.domain, '')),
        plainto_tsquery('english', query_text)
      ) as text_score
    FROM graph.entities e
    WHERE to_tsvector('english', COALESCE(e.name, '') || ' ' || COALESCE(e.industry, '') || ' ' || COALESCE(e.domain, ''))
          @@ plainto_tsquery('english', query_text)
  ),
  semantic_matches AS (
    SELECT 
      e.id,
      e.name,
      e.type,
      1 - (e.embedding <=> query_embedding) as semantic_score
    FROM graph.entities e
    WHERE e.embedding IS NOT NULL
      AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ),
  graph_metrics AS (
    SELECT 
      e.id,
      COUNT(DISTINCT ed.id)::float / NULLIF((SELECT COUNT(*) FROM graph.edges), 0) as centrality
    FROM graph.entities e
    LEFT JOIN graph.edges ed ON (e.id = ed.source OR e.id = ed.target)
    GROUP BY e.id
  ),
  combined_results AS (
    SELECT 
      COALESCE(tm.id, sm.id) as id,
      COALESCE(tm.name, sm.name) as name,
      COALESCE(tm.type, sm.type) as type,
      COALESCE(tm.text_score, 0) as text_score,
      COALESCE(sm.semantic_score, 0) as semantic_score,
      COALESCE(gm.centrality, 0) as graph_centrality
    FROM text_matches tm
    FULL OUTER JOIN semantic_matches sm ON tm.id = sm.id
    LEFT JOIN graph_metrics gm ON COALESCE(tm.id, sm.id) = gm.id
  )
  SELECT 
    id,
    name,
    type,
    text_score,
    semantic_score,
    graph_centrality,
    -- Weighted combination: 40% text, 40% semantic, 20% graph centrality
    (text_score * 0.4 + semantic_score * 0.4 + graph_centrality * 0.2) as final_score
  FROM combined_results
  WHERE text_score > 0 OR semantic_score > 0
  ORDER BY final_score DESC
  LIMIT match_count;
$$ LANGUAGE sql;

-- Function to calculate entity influence score based on multiple factors
CREATE OR REPLACE FUNCTION graph.calculate_entity_influence(
  entity_id uuid
) RETURNS TABLE (
  influence_score float,
  degree_centrality float,
  betweenness_centrality float,
  pagerank_score float
) AS $$
  WITH degree_metrics AS (
    SELECT 
      COUNT(DISTINCT ed.id) as degree_count
    FROM graph.entities e
    LEFT JOIN graph.edges ed ON (e.id = ed.source OR e.id = ed.target)
    WHERE e.id = entity_id
    GROUP BY e.id
  ),
  betweenness_approx AS (
    -- Simplified betweenness calculation for performance
    SELECT 
      COUNT(DISTINCT CASE 
        WHEN e1.id != entity_id AND e2.id != entity_id 
        AND e1.id != e2.id
        AND EXISTS (
          SELECT 1 FROM graph.edges e3 
          WHERE e3.source = e1.id AND e3.target = entity_id
        )
        AND EXISTS (
          SELECT 1 FROM graph.edges e4 
          WHERE e4.source = entity_id AND e4.target = e2.id
        )
        THEN e1.id || '-' || e2.id
      END) as betweenness_count
    FROM graph.entities e1
    CROSS JOIN graph.entities e2
    WHERE e1.id != e2.id
  )
  SELECT 
    -- Combined influence score
    (COALESCE(dm.degree_count, 0) * 0.4 + 
     COALESCE(ba.betweenness_count, 0) * 0.3 +
     COALESCE(e.importance, 0.5) * 0.3) as influence_score,
    COALESCE(dm.degree_count, 0)::float as degree_centrality,
    COALESCE(ba.betweenness_count, 0)::float as betweenness_centrality,
    COALESCE(e.importance, 0.5) as pagerank_score
  FROM graph.entities e
  CROSS JOIN degree_metrics dm
  CROSS JOIN betweenness_approx ba
  WHERE e.id = entity_id;
$$ LANGUAGE sql;

-- Function to find highly connected entities (hubs)
CREATE OR REPLACE FUNCTION graph.find_influential_entities(
  min_connections int DEFAULT 5,
  limit_count int DEFAULT 20
) RETURNS TABLE (
  id uuid,
  name text,
  type text,
  connection_count bigint,
  influence_score float
) AS $$
  WITH connection_counts AS (
    SELECT 
      e.id,
      e.name,
      e.type,
      COUNT(DISTINCT ed.id) as connection_count
    FROM graph.entities e
    LEFT JOIN graph.edges ed ON (e.id = ed.source OR e.id = ed.target)
    GROUP BY e.id, e.name, e.type
    HAVING COUNT(DISTINCT ed.id) >= min_connections
  ),
  influence_scores AS (
    SELECT 
      cc.id,
      cc.name,
      cc.type,
      cc.connection_count,
      -- Influence score based on connections and entity importance
      (cc.connection_count::float / NULLIF((SELECT MAX(connection_count) FROM connection_counts), 0)) * 0.7 +
      COALESCE(e.importance, 0.5) * 0.3 as influence_score
    FROM connection_counts cc
    LEFT JOIN graph.entities e ON cc.id = e.id
  )
  SELECT 
    id,
    name,
    type,
    connection_count,
    influence_score
  FROM influence_scores
  ORDER BY influence_score DESC
  LIMIT limit_count;
$$ LANGUAGE sql;

-- Function to find highly connected entities (hubs)
CREATE OR REPLACE FUNCTION graph.find_influential_entities(
  min_connections int DEFAULT 5,
  limit_count int DEFAULT 20
) RETURNS TABLE (
  id uuid,
  name text,
  type text,
  connection_count bigint,
  influence_score float
) AS $$
  WITH connection_counts AS (
    SELECT 
      e.id,
      e.name,
      e.type,
      COUNT(DISTINCT ed.id) as connection_count
    FROM graph.entities e
    LEFT JOIN graph.edges ed ON (e.id = ed.source OR e.id = ed.target)
    GROUP BY e.id, e.name, e.type
    HAVING COUNT(DISTINCT ed.id) >= min_connections
  ),
  influence_scores AS (
    SELECT 
      cc.id,
      cc.name,
      cc.type,
      cc.connection_count,
      -- Influence score based on connections and entity importance
      (cc.connection_count::float / NULLIF((SELECT MAX(connection_count) FROM connection_counts), 0)) * 0.7 +
      COALESCE(e.importance, 0.5) * 0.3 as influence_score
    FROM connection_counts cc
    LEFT JOIN graph.entities e ON cc.id = e.id
  )
  SELECT 
    id,
    name,
    type,
    connection_count,
    influence_score
  FROM influence_scores
  ORDER BY influence_score DESC
  LIMIT limit_count;
$$ LANGUAGE sql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION graph.semantic_search_with_graph_boost TO authenticated;
GRANT EXECUTE ON FUNCTION graph.hybrid_search_enhanced TO authenticated;
GRANT EXECUTE ON FUNCTION graph.calculate_entity_influence TO authenticated;
GRANT EXECUTE ON FUNCTION graph.find_influential_entities TO authenticated;
