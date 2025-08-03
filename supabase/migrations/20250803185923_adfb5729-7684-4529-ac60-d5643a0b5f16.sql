-- Atualizar bucket generated-exams para ser público
UPDATE storage.buckets 
SET public = true 
WHERE id = 'generated-exams';

-- Apagar políticas existentes primeiro
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to generated-exams" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files in generated-exams" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files in generated-exams" ON storage.objects;

-- Política para permitir SELECT (visualizar) para todos
CREATE POLICY "Public access to generated-exams" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'generated-exams');

-- Política para permitir INSERT (upload) para usuários autenticados
CREATE POLICY "Auth users can upload generated-exams" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'generated-exams' AND auth.uid() IS NOT NULL);

-- Política para permitir UPDATE para usuários autenticados
CREATE POLICY "Auth users can update generated-exams" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'generated-exams' AND auth.uid() IS NOT NULL);

-- Política para permitir DELETE para usuários autenticados
CREATE POLICY "Auth users can delete generated-exams"
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'generated-exams' AND auth.uid() IS NOT NULL);