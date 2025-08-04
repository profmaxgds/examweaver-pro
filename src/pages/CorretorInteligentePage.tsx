import { CorretorInteligente } from '@/components/CorretorInteligente';

export default function CorretorInteligentePage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Corretor Inteligente</h1>
        <p className="text-muted-foreground">
          Use a câmera para ler QR codes e corrigir provas automaticamente
        </p>
      </div>
      
      <CorretorInteligente />
    </div>
  );
}