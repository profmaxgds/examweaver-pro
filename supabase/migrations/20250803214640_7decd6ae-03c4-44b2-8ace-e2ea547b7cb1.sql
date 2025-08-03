-- Adicionar foreign keys com CASCADE DELETE para manter integridade referencial

-- 1. Foreign key para student_exams -> exams
DO $$ 
BEGIN
    -- Verificar se a foreign key já existe
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
    -- Verificar se a foreign key já existe
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
    -- Verificar se a foreign key já existe
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

-- 4. Também podemos adicionar foreign key para student_exams -> students (se não existir)
DO $$ 
BEGIN
    -- Verificar se a foreign key já existe
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

-- 5. Foreign key para exam_corrections -> students (se não existir)
DO $$ 
BEGIN
    -- Verificar se a foreign key já existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'exam_corrections_student_id_fkey' 
        AND table_name = 'exam_corrections'
    ) THEN
        -- Como student_id pode ser nullable em exam_corrections, verificamos antes
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'exam_corrections' 
                  AND column_name = 'student_id' 
                  AND is_nullable = 'YES') THEN
            -- Se for nullable, não adicionamos a constraint, mas podemos adicionar um trigger
            NULL;
        ELSE
            ALTER TABLE exam_corrections 
            ADD CONSTRAINT exam_corrections_student_id_fkey 
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;