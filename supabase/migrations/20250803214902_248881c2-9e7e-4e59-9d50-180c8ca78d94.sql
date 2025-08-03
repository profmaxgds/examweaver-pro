-- Agora adicionar foreign keys com CASCADE DELETE após limpar registros órfãos

-- 1. Foreign key para student_exams -> exams
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'student_exams_exam_id_fkey' 
        AND table_name = 'student_exams'
    ) THEN
        ALTER TABLE student_exams 
        ADD CONSTRAINT student_exams_exam_id_fkey 
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Foreign key para corrections -> exams  
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'corrections_exam_id_fkey' 
        AND table_name = 'corrections'
    ) THEN
        ALTER TABLE corrections 
        ADD CONSTRAINT corrections_exam_id_fkey 
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Foreign key para exam_corrections -> exams
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'exam_corrections_exam_id_fkey' 
        AND table_name = 'exam_corrections'
    ) THEN
        ALTER TABLE exam_corrections 
        ADD CONSTRAINT exam_corrections_exam_id_fkey 
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Foreign key para student_exams -> students
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'student_exams_student_id_fkey' 
        AND table_name = 'student_exams'
    ) THEN
        ALTER TABLE student_exams 
        ADD CONSTRAINT student_exams_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
END $$;