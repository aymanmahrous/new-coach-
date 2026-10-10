-- Allow staff manual WhatsApp replies and ai_draft concierge rows.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_author_type_check;

ALTER TABLE public.messages ADD CONSTRAINT messages_author_type_check
  CHECK (author_type = ANY (ARRAY['customer'::text, 'ai'::text, 'human'::text, 'system'::text, 'staff'::text, 'ai_draft'::text]));
