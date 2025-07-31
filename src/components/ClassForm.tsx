// src/components/ClassForm.tsx

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
import { Textarea } from "./ui/textarea";

const classFormSchema = z.object({
  name: z.string().min(2, { message: "O nome da turma é obrigatório." }),
  institution_header_id: z.string({ required_error: "Selecione uma instituição." }),
  description: z.string().optional(),
  year: z.coerce.number().optional(),
  semester: z.coerce.number().optional(),
});

type ClassFormValues = z.infer<typeof classFormSchema>;

interface ClassFormProps {
  onSave: (data: ClassFormValues) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

export function ClassForm({ onSave, onCancel, loading }: ClassFormProps) {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState<{ id: string, name: string }[]>([]);

  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: { year: new Date().getFullYear() },
  });
  
  useEffect(() => {
    const fetchInstitutions = async () => {
      if (!user) return;
      const { data } = await supabase.from('exam_headers').select('id, name').eq('author_id', user.id);
      setInstitutions(data || []);
    };
    fetchInstitutions();
  }, [user]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSave)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome da Turma</FormLabel>
              <FormControl><Input placeholder="Ex: Sistemas de Informação - 3º Período" {...field} /></FormControl>
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
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ano</FormLabel>
                <FormControl><Input type="number" placeholder="Ano da turma" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="semester"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Semestre</FormLabel>
                <FormControl><Input type="number" placeholder="Semestre da turma" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição (Opcional)</FormLabel>
                <FormControl><Textarea placeholder="Qualquer observação sobre a turma" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar Turma'}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}