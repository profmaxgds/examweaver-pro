-- Primeiro, vamos limpar registros órfãos antes de adicionar as foreign keys

-- 1. Limpar exam_corrections órfãos (exam_id que não existe em exams)
DELETE FROM exam_corrections 
WHERE exam_id NOT IN (SELECT id FROM exams);

-- 2. Limpar corrections órfãos (exam_id que não existe em exams)
DELETE FROM corrections 
WHERE exam_id NOT IN (SELECT id FROM exams);

-- 3. Limpar student_exams órfãos (exam_id que não existe em exams)
DELETE FROM student_exams 
WHERE exam_id NOT IN (SELECT id FROM exams);

-- 4. Limpar student_exams órfãos (student_id que não existe em students)
DELETE FROM student_exams 
WHERE student_id NOT IN (SELECT id FROM students);

-- 5. Limpar exam_corrections órfãos (student_id que não existe em students e não é NULL)
DELETE FROM exam_corrections 
WHERE student_id IS NOT NULL 
AND student_id NOT IN (SELECT id FROM students);