// src/components/StudentForm.tsx

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const studentFormSchema = z.object({
  name: z.string().min(3, { message: "O nome é obrigatório." }),
  student_id: z.string().optional(),
  email: z.string().email({ message: "Insira um e-mail válido." }).optional().or(z.literal('')),
  course: z.string().optional(),
  institution_header_id: z.string({ required_error: "Selecione uma instituição." }),
  class_id: z.string({ required_error: "Selecione uma turma." }),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

interface StudentFormProps {
  initialData?: Partial<StudentFormValues> & { id?: string };
  onSave: (data: StudentFormValues, id?: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

export function StudentForm({ initialData, onSave, onCancel, loading }: StudentFormProps) {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState<{ id: string, name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string, name: string }[]>([]);

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: initialData || {},
  });
  
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      // Busca Instituições (exam_headers)
      const { data: institutionsData } = await supabase.from('exam_headers').select('id, name').eq('author_id', user.id);
      setInstitutions(institutionsData || []);

      // Busca Turmas (classes)
      const { data: classesData, error: classesError } = await supabase.from('classes').select('id, name').eq('author_id', user.id);
      if (!classesError && classesData) {
        setClasses(classesData);
      }
    };
    fetchData();
  }, [user]);

  const onSubmit = async (data: StudentFormValues) => {
    await onSave(data, initialData?.id);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Nome Completo</FormLabel>
                <FormControl><Input placeholder="Nome do aluno" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="student_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Matrícula</FormLabel>
                <FormControl><Input placeholder="Matrícula do aluno" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" placeholder="email@dominio.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="institution_header_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instituição</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione a instituição" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {institutions.map(inst => <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="class_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Turma</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione a turma" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="course"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Curso</FormLabel>
                <FormControl><Input placeholder="Curso do aluno" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar Aluno'}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}