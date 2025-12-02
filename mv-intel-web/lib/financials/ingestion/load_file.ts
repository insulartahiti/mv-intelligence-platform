import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export interface FileMetadata {
  filename: string;
  path?: string; // Local path
  buffer: Buffer;
  mimeType?: string;
}

export async function loadFile(filePath: string): Promise<FileMetadata> {
  // Check if it is a Supabase Storage path (custom scheme or just known prefix)
  // For this project, we'll assume paths starting with 'financial-docs/' are storage paths
  if (filePath.startsWith('financial-docs/')) {
     return loadFromSupabase(filePath);
  }

  // Fallback to local FS (for dev/testing)
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

async function loadFromSupabase(storagePath: string): Promise<FileMetadata> {
    // Initialize Supabase Admin client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Must be service role to read private bucket
    const supabase = createClient(supabaseUrl, supabaseKey);

    const bucket = 'financial-docs';
    // Path comes in as "financial-docs/folder/file.pdf" -> we need "folder/file.pdf"
    const relativePath = storagePath.replace(`${bucket}/`, '');

    const { data, error } = await supabase.storage
        .from(bucket)
        .download(relativePath);

    if (error) {
        throw new Error(`Supabase download failed: ${error.message}`);
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const filename = path.basename(relativePath);
    
    // Basic extension check
    const ext = path.extname(filename).toLowerCase();
    let mimeType = 'application/octet-stream';
    if (ext === '.pdf') mimeType = 'application/pdf';
    else if (ext === '.xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    return {
        filename,
        buffer,
        mimeType
    };
}
