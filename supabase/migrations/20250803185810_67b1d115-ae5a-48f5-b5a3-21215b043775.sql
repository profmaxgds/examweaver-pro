-- Verificar e atualizar políticas do bucket generated-exams para garantir acesso público

-- Verificar se o bucket é público
UPDATE storage.buckets 
SET public = true 
WHERE id = 'generated-exams';

-- Política para permitir SELECT (visualizar) para todos
CREATE POLICY IF NOT EXISTS "Public Access" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'generated-exams');

-- Política para permitir INSERT (upload) para usuários autenticados
CREATE POLICY IF NOT EXISTS "Authenticated users can upload to generated-exams" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'generated-exams' AND auth.uid() IS NOT NULL);

-- Política para permitir UPDATE para o próprio usuário
CREATE POLICY IF NOT EXISTS "Users can update their own files in generated-exams" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'generated-exams' AND auth.uid() IS NOT NULL);

-- Política para permitir DELETE para o próprio usuário  
CREATE POLICY IF NOT EXISTS "Users can delete their own files in generated-exams"
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'generated-exams' AND auth.uid() IS NOT NULL);