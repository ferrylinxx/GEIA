-- Add project-level instructions to steer the assistant within a project.
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS instructions TEXT DEFAULT '';

