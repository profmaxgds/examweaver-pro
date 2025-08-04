-- Add HTML content column to student_exams table
ALTER TABLE public.student_exams 
ADD COLUMN html_content TEXT;