-- Cria bucket privado para documentos da knowledge base e policies de Storage
-- escopadas por organização (estrutura de path: <org_id>/<agent_id>/<file>).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-documents',
  'knowledge-documents',
  false,
  52428800, -- 50MB
  ARRAY[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Membros da org podem ler arquivos de sua org (primeiro segmento do path = org_id)
CREATE POLICY "knowledge_docs_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'knowledge-documents'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );

-- Service role (worker, API admin client) já bypassa RLS; esta policy cobre
-- uploads diretos do dashboard via SDK quando aplicável.
CREATE POLICY "knowledge_docs_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'knowledge-documents'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );

CREATE POLICY "knowledge_docs_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'knowledge-documents'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );
