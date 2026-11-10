import React, { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface FileDropZoneProps {
  accept: string;
  label: string;
  sublabel?: string;
  readAs?: 'dataUrl' | 'text';
  disabled?: boolean;
  compact?: boolean;
  onFileLoaded: (file: { name: string; content: string }) => void | Promise<void>;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  accept,
  label,
  sublabel,
  readAs = 'dataUrl',
  disabled = false,
  compact = false,
  onFileLoaded,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File | undefined | null) => {
    if (!file || disabled) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        void onFileLoaded({ name: file.name, content: reader.result });
      }
    };
    if (readAs === 'text') reader.readAsText(file);
    else reader.readAsDataURL(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`border border-dashed rounded-lg transition cursor-pointer select-none flex items-center justify-center gap-2 ${
        compact ? 'px-2.5 py-2 text-[11px]' : 'px-3 py-3 text-xs'
      } ${
        dragging
          ? 'border-sky-400 bg-sky-500/15 text-sky-200'
          : 'border-slate-700 bg-slate-900/60 hover:border-sky-500/50 hover:bg-slate-900 text-slate-300'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <UploadCloud className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-sky-400 shrink-0`} />
      <div className="min-w-0 text-left">
        <div className="font-medium truncate">{label}</div>
        {sublabel && <div className="text-[10px] text-slate-500 truncate">{sublabel}</div>}
      </div>
    </div>
  );
};
