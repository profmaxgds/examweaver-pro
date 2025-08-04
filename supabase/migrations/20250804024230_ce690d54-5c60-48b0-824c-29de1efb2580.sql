-- Criar função para atualizar html_content
CREATE OR REPLACE FUNCTION public.update_html_content(
    student_exam_id UUID,
    html_data TEXT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.student_exams 
    SET html_content = html_data
    WHERE id = student_exam_id;
    
    IF FOUND THEN
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$;