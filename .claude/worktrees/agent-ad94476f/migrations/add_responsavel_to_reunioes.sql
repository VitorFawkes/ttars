-- Add responsavel_id to reunioes table
alter table reunioes add column responsavel_id uuid references auth.users(id);

-- Update existing meetings to have created_by as responsavel_id if null
update reunioes set responsavel_id = created_by where responsavel_id is null;

-- Add index for performance
create index idx_reunioes_responsavel_id on reunioes(responsavel_id);
