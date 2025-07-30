import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, FileText, Image, Music } from 'lucide-react';

interface FileUploadProps {
  bucket: string;
  allowedTypes?: string[];
  maxSize?: number; // in MB
  onUpload?: (url: string, file: File) => void;
  multiple?: boolean;
  entityType?: 'question' | 'exam' | 'correction';
  entityId?: string;
}

export function FileUpload({
  bucket,
  allowedTypes = ['image/*', 'audio/*', 'application/pdf'],
  maxSize = 10,
  onUpload,
  multiple = false,
  entityType,
  entityId
}: FileUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    name: string;
    url: string;
    type: string;
    size: number;
  }>>([]);

  const uploadFile = async (file: File) => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para fazer upload de arquivos.",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploading(true);
      setProgress(0);

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      // Save file record to database
      const { error: dbError } = await supabase
        .from('file_uploads')
        .insert({
          author_id: user.id,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          storage_path: fileName,
          public_url: publicUrl,
          entity_type: entityType,
          entity_id: entityId
        });

      if (dbError) {
        console.error('Database error:', dbError);
        // Continue even if DB insert fails
      }

      const uploadedFile = {
        name: file.name,
        url: publicUrl,
        type: file.type,
        size: file.size
      };

      setUploadedFiles(prev => [...prev, uploadedFile]);
      setProgress(100);

      toast({
        title: "Sucesso!",
        description: `Arquivo ${file.name} enviado com sucesso.`,
      });

      onUpload?.(publicUrl, file);

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Erro",
        description: `Erro ao enviar arquivo: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      // Check file size
      if (file.size > maxSize * 1024 * 1024) {
        toast({
          title: "Arquivo muito grande",
          description: `O arquivo ${file.name} excede o limite de ${maxSize}MB.`,
          variant: "destructive",
        });
        continue;
      }

      await uploadFile(file);
    }
  }, [maxSize, uploadFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: allowedTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    multiple,
    disabled: uploading
  });

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (type.startsWith('audio/')) return <Music className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
      >
        <input {...getInputProps()} />
        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isDragActive
            ? 'Solte os arquivos aqui...'
            : 'Clique ou arraste arquivos para enviar'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Máximo {maxSize}MB por arquivo
        </p>
      </div>

      {uploading && progress > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Enviando...</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Arquivos enviados:</h4>
          {uploadedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 border rounded"
            >
              <div className="flex items-center space-x-2">
                {getFileIcon(file.type)}
                <span className="text-sm">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeFile(index)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}