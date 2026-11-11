import { useEffect, useState } from 'react';
import { fileOperations, type FileOperation } from './fileOperations.js';

/** Subscribe to the shared file-operation queue. */
export function useFileOperations(): {
  ops: FileOperation[];
  activeCount: number;
  dismiss: (id: string) => void;
  retry: (id: string) => void;
  clearFinished: () => void;
} {
  const [ops, setOps] = useState<FileOperation[]>(() => fileOperations.snapshot());

  useEffect(() => fileOperations.subscribe(setOps), []);

  return {
    ops,
    activeCount: ops.filter((o) => o.status === 'queued' || o.status === 'running').length,
    dismiss: (id) => fileOperations.dismiss(id),
    retry: (id) => fileOperations.retry(id),
    clearFinished: () => fileOperations.clearFinished(),
  };
}
