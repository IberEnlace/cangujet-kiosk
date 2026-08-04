-- PostgreSQL requires a newly-added enum value to be committed before it is
-- referenced by later schema objects, so this is intentionally its own migration.
alter type public.device_status add value if not exists 'revoked';
