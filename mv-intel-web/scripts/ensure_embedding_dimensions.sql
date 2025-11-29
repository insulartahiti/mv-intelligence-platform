-- Ensure embedding columns are 2000 dimensions as required by Supabase
ALTER TABLE graph.entities ALTER COLUMN embedding TYPE vector(2000) USING embedding::vector;
ALTER TABLE graph.entities ALTER COLUMN taxonomy_embedding TYPE vector(2000) USING taxonomy_embedding::vector;
