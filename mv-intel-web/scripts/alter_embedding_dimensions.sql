-- Adjust embedding dimensions to match OpenAI text-embedding-3-large (3072)
ALTER TABLE graph.entities ALTER COLUMN embedding TYPE vector(3072) USING embedding::vector;
ALTER TABLE graph.entities ALTER COLUMN taxonomy_embedding TYPE vector(3072) USING taxonomy_embedding::vector;
