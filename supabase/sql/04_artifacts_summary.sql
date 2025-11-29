
-- Add summary_text to artifacts for quick display
do $$ begin
  alter table artifacts add column if not exists summary_text text;
exception when duplicate_column then null; end $$;
