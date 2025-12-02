import fs from 'fs';
import path from 'path';

export interface FileMetadata {
  filename: string;
  path: string;
  buffer: Buffer;
  mimeType?: string;
}

export async function loadFile(filePath: string): Promise<FileMetadata> {
  // TODO: Add support for S3/Blob storage download based on protocol
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const buffer = await fs.promises.readFile(filePath);
  const filename = path.basename(filePath);
  
  // Basic extension check for mime
  const ext = path.extname(filename).toLowerCase();
  let mimeType = 'application/octet-stream';
  if (ext === '.pdf') mimeType = 'application/pdf';
  else if (ext === '.xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  else if (ext === '.csv') mimeType = 'text/csv';

  return {
    filename,
    path: filePath,
    buffer,
    mimeType
  };
}


