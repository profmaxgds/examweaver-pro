-- Criar políticas para o bucket correction-scans
-- Permitir que usuários façam upload de suas próprias correções
CREATE POLICY "Users can upload correction scans" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'correction-scans' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Permitir que usuários vejam suas próprias correções
CREATE POLICY "Users can view their correction scans" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'correction-scans' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Permitir que usuários atualizem suas próprias correções
CREATE POLICY "Users can update their correction scans" ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'correction-scans' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Permitir que usuários deletem suas próprias correções
CREATE POLICY "Users can delete their correction scans" ON storage.objects
FOR DELETE
USING (
  bucket_id = 'correction-scans' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);