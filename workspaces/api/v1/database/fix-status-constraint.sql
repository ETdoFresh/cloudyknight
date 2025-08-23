-- Fix the status constraint to allow all status values used by the admin panel
-- First, drop the existing constraint
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_status_check;

-- Add the new constraint with all allowed values
ALTER TABLE workspaces ADD CONSTRAINT workspaces_status_check 
CHECK (status IN ('active', 'inactive', 'coming-soon', 'hidden'));

-- Update any 'inactive' statuses to 'hidden' for consistency
UPDATE workspaces SET status = 'hidden' WHERE status = 'inactive';