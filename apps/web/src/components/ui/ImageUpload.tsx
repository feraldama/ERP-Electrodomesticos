"use client";

import { useRef, useState } from "react";
import { assetUrl, uploadFile } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { ImagePlus, Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";

interface ImageUploadProps {
  /** Ruta relativa guardada (ej /uploads/articles/x.jpg) o null */
  value: string | null;
  /** Se invoca con la nueva ruta relativa, o null al quitar */
  onChange: (url: string | null) => void;
  /** Endpoint de carga (multipart) */
  endpoint?: string;
  disabled?: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function ImageUpload({ value, onChange, endpoint = "/articles/upload-imagen", disabled }: ImageUploadProps) {
  const { notify } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const preview = assetUrl(value);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      notify("error", "Formato no permitido. Usa JPG, PNG, WEBP o GIF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      notify("error", "La imagen supera el tamano maximo (5 MB).");
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadFile(endpoint, file);
      onChange(url);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al subir la imagen");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function openPicker() {
    if (!disabled && !uploading) inputRef.current?.click();
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {preview ? (
        // Vista con miniatura + acciones
        <div className="flex items-center gap-4 rounded-lg border border-border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Vista previa del articulo"
            className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover"
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={openPicker}
              disabled={disabled || uploading}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {uploading ? "Subiendo..." : "Cambiar"}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled || uploading}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Quitar
            </button>
          </div>
        </div>
      ) : (
        // Dropzone vacio
        <button
          type="button"
          onClick={openPicker}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          disabled={disabled || uploading}
          className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50"
          }`}
        >
          {uploading ? (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          ) : dragOver ? (
            <UploadCloud className="h-7 w-7 text-primary" />
          ) : (
            <ImagePlus className="h-7 w-7 text-slate-400" />
          )}
          <span className="text-sm font-medium text-secondary">
            {uploading ? "Subiendo imagen..." : "Subir imagen"}
          </span>
          <span className="text-xs text-slate-500">Arrastra o hace clic. JPG, PNG, WEBP o GIF (max 5 MB).</span>
        </button>
      )}
    </div>
  );
}
