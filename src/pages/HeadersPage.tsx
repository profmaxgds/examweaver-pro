import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ExamHeaderEditor } from '@/components/ExamHeaderEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HeadersPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar ao Home
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Meus Cabeçalhos</h1>
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Gerenciador de Cabeçalhos</CardTitle>
            <CardDescription>
              Crie, edite e exclua seus cabeçalhos personalizados. Você poderá selecioná-los ao criar uma nova prova.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExamHeaderEditor />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}