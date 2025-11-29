-- Enhanced Knowledge Graph Intelligence - Graph Algorithms
-- Implement PageRank and other graph algorithms in PostgreSQL

-- PageRank Algorithm for Entity Influence
CREATE OR REPLACE FUNCTION graph.calculate_pagerank(
  damping_factor float DEFAULT 0.85,
  max_iterations int DEFAULT 20,
  tolerance float DEFAULT 0.0001
) RETURNS TABLE (
  entity_id uuid,
  pagerank float,
  rank_normalized float
) AS $$
DECLARE
  node_count int;
  iteration int := 0;
  max_diff float := 1.0;
BEGIN
  -- Initialize temporary table for PageRank calculation
  CREATE TEMP TABLE IF NOT EXISTS pagerank_temp (
    id uuid PRIMARY KEY,
    current_rank float DEFAULT 0.0,
    next_rank float DEFAULT 0.0
  );
  
  DELETE FROM pagerank_temp;
  
  -- Get node count and initialize ranks
  SELECT COUNT(*) INTO node_count FROM graph.entities;
  
  IF node_count = 0 THEN
    RETURN;
  END IF;
  
  INSERT INTO pagerank_temp (id, current_rank)
  SELECT id, 1.0 / node_count FROM graph.entities;
  
  -- Iterative PageRank calculation
  WHILE iteration < max_iterations AND max_diff > tolerance LOOP
    -- Calculate new ranks
    UPDATE pagerank_temp pt
    SET next_rank = (1 - damping_factor) / node_count + 
      damping_factor * COALESCE((
        SELECT SUM(pt2.current_rank / NULLIF(out_degree.degree, 0))
        FROM graph.edges e
        JOIN pagerank_temp pt2 ON e.source = pt2.id
        JOIN (
          SELECT source, COUNT(*) as degree 
          FROM graph.edges 
          GROUP BY source
        ) out_degree ON e.source = out_degree.source
        WHERE e.target = pt.id
      ), 0);
    
    -- Calculate difference for convergence check
    SELECT MAX(ABS(next_rank - current_rank)) INTO max_diff FROM pagerank_temp;
    
    -- Update current ranks
    UPDATE pagerank_temp SET current_rank = next_rank;
    
    iteration := iteration + 1;
  END LOOP;
  
  -- Normalize and return results
  RETURN QUERY
  SELECT 
    pt.id,
    pt.current_rank,
    pt.current_rank / NULLIF(MAX(pt.current_rank) OVER (), 0) as rank_normalized
  FROM pagerank_temp pt
  ORDER BY pt.current_rank DESC;
  
  DROP TABLE pagerank_temp;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate degree centrality for all entities
CREATE OR REPLACE FUNCTION graph.calculate_degree_centrality()
RETURNS TABLE (
  entity_id uuid,
  degree_centrality float,
  in_degree int,
  out_degree int
) AS $$
  WITH degree_counts AS (
    SELECT 
      e.id,
      COUNT(DISTINCT CASE WHEN ed.source = e.id THEN ed.target END) as out_degree,
      COUNT(DISTINCT CASE WHEN ed.target = e.id THEN ed.source END) as in_degree
    FROM graph.entities e
    LEFT JOIN graph.edges ed ON (e.id = ed.source OR e.id = ed.target)
    GROUP BY e.id
  ),
  max_degree AS (
    SELECT MAX(out_degree + in_degree) as max_total_degree FROM degree_counts
  )
  SELECT 
    dc.id,
    CASE 
      WHEN md.max_total_degree = 0 THEN 0
      ELSE (dc.out_degree + dc.in_degree)::float / md.max_total_degree
    END as degree_centrality,
    dc.in_degree,
    dc.out_degree
  FROM degree_counts dc
  CROSS JOIN max_degree md
  ORDER BY degree_centrality DESC;
$$ LANGUAGE sql;

-- Function to find shortest paths between entities
CREATE OR REPLACE FUNCTION graph.find_shortest_path(
  source_id uuid,
  target_id uuid,
  max_depth int DEFAULT 5
) RETURNS TABLE (
  path_length int,
  path_nodes uuid[],
  path_edges uuid[],
  total_strength float
) AS $$
DECLARE
  current_paths uuid[][];
  next_paths uuid[][];
  current_depth int := 1;
  found_paths uuid[][];
  path_record RECORD;
BEGIN
  -- Initialize with source node
  current_paths := ARRAY[ARRAY[source_id]];
  
  -- BFS to find shortest paths
  WHILE current_depth <= max_depth AND array_length(found_paths, 1) IS NULL LOOP
    next_paths := ARRAY[]::uuid[][];
    
    -- Expand each current path
    FOR path_record IN SELECT unnest(current_paths) as path LOOP
      DECLARE
        last_node uuid;
        connected_nodes uuid[];
        new_path uuid[];
      BEGIN
        last_node := path_record.path[array_length(path_record.path, 1)];
        
        -- Get connected nodes
        SELECT ARRAY_AGG(DISTINCT CASE 
          WHEN e.source = last_node THEN e.target
          WHEN e.target = last_node THEN e.source
        END) INTO connected_nodes
        FROM graph.edges e
        WHERE (e.source = last_node OR e.target = last_node)
          AND NOT (CASE 
            WHEN e.source = last_node THEN e.target
            WHEN e.target = last_node THEN e.source
          END = ANY(path_record.path)); -- Avoid cycles
        
        -- Create new paths
        IF connected_nodes IS NOT NULL THEN
          FOR i IN 1..array_length(connected_nodes, 1) LOOP
            new_path := path_record.path || connected_nodes[i];
            
            -- Check if we reached target
            IF connected_nodes[i] = target_id THEN
              found_paths := COALESCE(found_paths, ARRAY[]::uuid[][]) || ARRAY[new_path];
            ELSE
              next_paths := next_paths || ARRAY[new_path];
            END IF;
          END LOOP;
        END IF;
      END;
    END LOOP;
    
    current_paths := next_paths;
    current_depth := current_depth + 1;
  END LOOP;
  
  -- Return found paths with metadata
  IF found_paths IS NOT NULL THEN
    FOR i IN 1..array_length(found_paths, 1) LOOP
      DECLARE
        path_nodes uuid[] := found_paths[i];
        path_edges uuid[];
        total_strength float := 0;
        edge_id uuid;
      BEGIN
        -- Calculate path edges and total strength
        FOR j IN 1..(array_length(path_nodes, 1) - 1) LOOP
          SELECT e.id, e.strength_score INTO edge_id, total_strength
          FROM graph.edges e
          WHERE (e.source = path_nodes[j] AND e.target = path_nodes[j + 1])
             OR (e.target = path_nodes[j] AND e.source = path_nodes[j + 1])
          LIMIT 1;
          
          path_edges := COALESCE(path_edges, ARRAY[]::uuid[]) || ARRAY[COALESCE(edge_id, gen_random_uuid())];
        END LOOP;
        
        RETURN QUERY SELECT 
          array_length(path_nodes, 1) - 1,
          path_nodes,
          path_edges,
          total_strength;
      END;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to find all paths between entities (up to max_depth)
CREATE OR REPLACE FUNCTION graph.find_all_paths(
  source_id uuid,
  target_id uuid,
  max_depth int DEFAULT 3,
  max_paths int DEFAULT 10
) RETURNS TABLE (
  path_length int,
  path_nodes uuid[],
  path_edges uuid[],
  total_strength float,
  path_score float
) AS $$
DECLARE
  all_paths uuid[][];
  current_paths uuid[][];
  next_paths uuid[][];
  current_depth int := 1;
  path_record RECORD;
  path_count int := 0;
BEGIN
  -- Initialize with source node
  current_paths := ARRAY[ARRAY[source_id]];
  all_paths := ARRAY[]::uuid[][];
  
  -- BFS to find all paths
  WHILE current_depth <= max_depth AND path_count < max_paths LOOP
    next_paths := ARRAY[]::uuid[][];
    
    -- Expand each current path
    FOR path_record IN SELECT unnest(current_paths) as path LOOP
      DECLARE
        last_node uuid;
        connected_nodes uuid[];
        new_path uuid[];
      BEGIN
        last_node := path_record.path[array_length(path_record.path, 1)];
        
        -- Get connected nodes
        SELECT ARRAY_AGG(DISTINCT CASE 
          WHEN e.source = last_node THEN e.target
          WHEN e.target = last_node THEN e.source
        END) INTO connected_nodes
        FROM graph.edges e
        WHERE (e.source = last_node OR e.target = last_node)
          AND NOT (CASE 
            WHEN e.source = last_node THEN e.target
            WHEN e.target = last_node THEN e.source
          END = ANY(path_record.path)); -- Avoid cycles
        
        -- Create new paths
        IF connected_nodes IS NOT NULL THEN
          FOR i IN 1..array_length(connected_nodes, 1) LOOP
            new_path := path_record.path || connected_nodes[i];
            
            -- Check if we reached target
            IF connected_nodes[i] = target_id THEN
              all_paths := all_paths || ARRAY[new_path];
              path_count := path_count + 1;
            ELSE
              next_paths := next_paths || ARRAY[new_path];
            END IF;
          END LOOP;
        END IF;
      END;
    END LOOP;
    
    current_paths := next_paths;
    current_depth := current_depth + 1;
  END LOOP;
  
  -- Return found paths with metadata
  IF all_paths IS NOT NULL THEN
    FOR i IN 1..array_length(all_paths, 1) LOOP
      DECLARE
        path_nodes uuid[] := all_paths[i];
        path_edges uuid[];
        total_strength float := 0;
        avg_strength float;
        path_score float;
        edge_id uuid;
        edge_strength float;
      BEGIN
        -- Calculate path edges and total strength
        FOR j IN 1..(array_length(path_nodes, 1) - 1) LOOP
          SELECT e.id, COALESCE(e.strength_score, 0.5) INTO edge_id, edge_strength
          FROM graph.edges e
          WHERE (e.source = path_nodes[j] AND e.target = path_nodes[j + 1])
             OR (e.target = path_nodes[j] AND e.source = path_nodes[j + 1])
          LIMIT 1;
          
          path_edges := COALESCE(path_edges, ARRAY[]::uuid[]) || ARRAY[COALESCE(edge_id, gen_random_uuid())];
          total_strength := total_strength + edge_strength;
        END LOOP;
        
        -- Calculate path score (higher is better)
        avg_strength := total_strength / GREATEST(array_length(path_nodes, 1) - 1, 1);
        path_score := avg_strength * (1.0 / array_length(path_nodes, 1)); -- Shorter paths get higher scores
        
        RETURN QUERY SELECT 
          array_length(path_nodes, 1) - 1,
          path_nodes,
          path_edges,
          total_strength,
          path_score;
      END;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION graph.calculate_pagerank TO authenticated;
GRANT EXECUTE ON FUNCTION graph.calculate_degree_centrality TO authenticated;
GRANT EXECUTE ON FUNCTION graph.find_shortest_path TO authenticated;
GRANT EXECUTE ON FUNCTION graph.find_all_paths TO authenticated;
