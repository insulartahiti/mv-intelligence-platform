import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AffinityFile {
  id: number
  name: string
  url: string
  size_bytes: number
  created_at: string
  organization_id: number
  person_id?: number
}

interface ProcessedFile {
  id: string
  entity_id: string
  affinity_file_id: number
  name: string
  url: string
  size_bytes: number
  mime_type: string
  file_extension: string
  ai_summary: string
  ai_key_points: string[]
  ai_tags: string[]
  embedding: number[]
  processed: boolean
  content_type: string
  word_count: number
  created_at: string
}

class AffinityFileProcessor {
  private supabase: any
  private affinityApiKey: string
  private openaiApiKey: string

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    this.affinityApiKey = Deno.env.get('AFFINITY_API_KEY') ?? ''
    this.openaiApiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  }

  async makeAffinityRequest(endpoint: string): Promise<any> {
    const url = `https://api.affinity.co${endpoint}`
    console.log(`Making request to: ${url}`)

    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${btoa(':' + this.affinityApiKey)}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('API Error:', errorText)
      throw new Error(`Affinity API error: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  }

  async fetchEntityFiles(entityId: number, entityType: 'organization' | 'person'): Promise<AffinityFile[]> {
    try {
      const param = entityType === 'organization' ? 'organization_id' : 'person_id'
      const response = await this.makeAffinityRequest(`/entity-files?${param}=${entityId}`)
      
      if (response.entity_files) {
        return response.entity_files.map((file: any) => ({
          id: file.id,
          name: file.name,
          url: file.url,
          size_bytes: file.size_bytes || 0,
          created_at: file.created_at,
          organization_id: file.organization_id,
          person_id: file.person_id
        }))
      }
      
      return []
    } catch (error) {
      console.error(`Error fetching files for ${entityType} ${entityId}:`, error)
      return []
    }
  }

  async downloadFile(fileUrl: string): Promise<Uint8Array> {
    try {
      const response = await fetch(fileUrl, {
        headers: {
          'Authorization': `Basic ${btoa(':' + this.affinityApiKey)}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`)
      }

      return new Uint8Array(await response.arrayBuffer())
  } catch (error) {
      console.error('Error downloading file:', error)
      throw error
    }
  }

  async extractTextFromFile(fileData: Uint8Array, fileName: string): Promise<string> {
    try {
      // Get file extension
      const extension = fileName.split('.').pop()?.toLowerCase() || ''
      
      // Handle different file types
      switch (extension) {
        case 'pdf':
          return await this.extractTextFromPDF(fileData)
        case 'docx':
          return await this.extractTextFromDocx(fileData)
        case 'txt':
          return new TextDecoder().decode(fileData)
        case 'md':
          return new TextDecoder().decode(fileData)
        default:
          console.log(`Unsupported file type: ${extension}`)
          return ''
      }
    } catch (error) {
      console.error('Error extracting text:', error)
      return ''
    }
  }

  async extractTextFromPDF(fileData: Uint8Array): Promise<string> {
    // For PDF extraction, we'll use a simple approach
    // In production, you might want to use a proper PDF parsing library
    try {
      // Convert to base64 for OpenAI vision API
      const base64 = btoa(String.fromCharCode(...fileData))
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
      headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
      },
      body: JSON.stringify({
          model: 'gpt-4o',
        messages: [
          {
              role: 'user',
            content: [
              {
                  type: 'text',
                  text: 'Extract all text from this PDF document. Return only the text content, no formatting or explanations.'
              },
              {
                  type: 'image_url',
                image_url: {
                    url: `data:application/pdf;base64,${base64}`
                  }
              }
            ]
          }
        ],
          max_tokens: 4000
        })
      })

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
    }

      const result = await response.json()
      return result.choices[0]?.message?.content || ''
  } catch (error) {
      console.error('Error extracting PDF text:', error)
      return ''
    }
  }

  async extractTextFromDocx(fileData: Uint8Array): Promise<string> {
    // For DOCX files, we'll use a simple text extraction
    // In production, you might want to use a proper DOCX parsing library
    try {
      // Convert to base64 for OpenAI vision API
      const base64 = btoa(String.fromCharCode(...fileData))
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
      headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
      },
      body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text from this DOCX document. Return only the text content, no formatting or explanations.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000
        })
      })

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
    }

      const result = await response.json()
      return result.choices[0]?.message?.content || ''
  } catch (error) {
      console.error('Error extracting DOCX text:', error)
      return ''
    }
  }

  async generateAISummary(text: string, fileName: string): Promise<{
    summary: string
    keyPoints: string[]
    tags: string[]
  }> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
      headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
      },
      body: JSON.stringify({
          model: 'gpt-4o',
        messages: [
          {
              role: 'user',
              content: `Analyze this document "${fileName}" and provide:
1. A comprehensive summary (2-3 paragraphs)
2. Key points (bullet list, max 10 items)
3. Relevant tags (comma-separated, max 10 tags)

Document content:
${text.substring(0, 8000)}` // Limit to avoid token limits
            }
          ],
          max_tokens: 2000
        })
      })

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const result = await response.json()
      const content = result.choices[0]?.message?.content || ''
      
      // Parse the response to extract summary, key points, and tags
      const lines = content.split('\n')
      let summary = ''
      let keyPoints: string[] = []
      let tags: string[] = []

      let currentSection = 'summary'
      for (const line of lines) {
        if (line.toLowerCase().includes('key points') || line.toLowerCase().includes('bullet')) {
          currentSection = 'keyPoints'
          continue
        }
        if (line.toLowerCase().includes('tags') || line.toLowerCase().includes('relevant tags')) {
          currentSection = 'tags'
          continue
        }

        if (currentSection === 'summary' && line.trim()) {
          summary += line + ' '
        } else if (currentSection === 'keyPoints' && line.trim().startsWith('-')) {
          keyPoints.push(line.trim().substring(1).trim())
        } else if (currentSection === 'tags' && line.trim()) {
          tags = line.split(',').map(tag => tag.trim()).filter(tag => tag)
        }
      }

      return {
        summary: summary.trim(),
        keyPoints: keyPoints.slice(0, 10),
        tags: tags.slice(0, 10)
    }
  } catch (error) {
      console.error('Error generating AI summary:', error)
      return {
        summary: 'Unable to generate summary',
        keyPoints: [],
        tags: []
      }
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-large',
          input: text.substring(0, 8000) // Limit to avoid token limits
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const result = await response.json()
      return result.data[0]?.embedding || []
    } catch (error) {
      console.error('Error generating embedding:', error)
      return []
    }
  }

  async processFile(file: AffinityFile, entityId: string): Promise<ProcessedFile> {
    try {
      console.log(`Processing file: ${file.name}`)
      
      // Download file
      const fileData = await this.downloadFile(file.url)
    
    // Extract text
      const text = await this.extractTextFromFile(fileData, file.name)
      
      if (!text) {
        throw new Error('Unable to extract text from file')
      }

      // Generate AI summary
      const aiAnalysis = await this.generateAISummary(text, file.name)
      
      // Generate embedding
      const embedding = await this.generateEmbedding(aiAnalysis.summary)
      
      // Determine file type and metadata
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      const mimeType = this.getMimeType(extension)
      const contentType = this.getContentType(extension)
      const wordCount = text.split(/\s+/).length

      const processedFile: ProcessedFile = {
        id: file.id.toString(),
        entity_id: entityId,
        affinity_file_id: file.id,
        name: file.name,
        url: file.url,
        size_bytes: file.size_bytes,
        mime_type: mimeType,
        file_extension: extension,
        ai_summary: aiAnalysis.summary,
        ai_key_points: aiAnalysis.keyPoints,
        ai_tags: aiAnalysis.tags,
        embedding: embedding,
        processed: true,
        content_type: contentType,
        word_count: wordCount,
        created_at: file.created_at
      }

      // Store in database
      await this.storeProcessedFile(processedFile)
      
      console.log(`Successfully processed file: ${file.name}`)
      return processedFile
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error)
      throw error
    }
  }

  private getMimeType(extension: string): string {
    const mimeTypes: { [key: string]: string } = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'doc': 'application/msword',
      'txt': 'text/plain',
      'md': 'text/markdown',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    }
    return mimeTypes[extension] || 'application/octet-stream'
  }

  private getContentType(extension: string): string {
    const contentTypes: { [key: string]: string } = {
      'pdf': 'document',
      'docx': 'document',
      'doc': 'document',
      'txt': 'document',
      'md': 'document',
      'xlsx': 'spreadsheet',
      'pptx': 'presentation'
    }
    return contentTypes[extension] || 'document'
  }

  async storeProcessedFile(processedFile: ProcessedFile): Promise<void> {
    const { error } = await this.supabase
      .schema('graph')
      .from('affinity_files')
      .upsert(processedFile, { onConflict: 'id' })

    if (error) {
      console.error('Error storing processed file:', error)
      throw error
    }
  }

  async processAllFilesForEntity(entityId: number, entityType: 'organization' | 'person'): Promise<void> {
    try {
      console.log(`Processing files for ${entityType} ${entityId}`)
      
      // Fetch files from Affinity
      const files = await this.fetchEntityFiles(entityId, entityType)
      
      if (files.length === 0) {
        console.log(`No files found for ${entityType} ${entityId}`)
        return
      }

      console.log(`Found ${files.length} files to process`)

      // Get entity UUID from our database
      const { data: entity } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('id')
        .eq('affinity_org_id', entityId)
        .single()

      if (!entity) {
        console.log(`Entity not found in database for ${entityType} ${entityId}`)
        return
      }

      // Process each file
      for (const file of files) {
        try {
          await this.processFile(file, entity.id)
        } catch (error) {
          console.error(`Failed to process file ${file.name}:`, error)
          // Continue with other files
        }
      }

      console.log(`Completed processing files for ${entityType} ${entityId}`)
    } catch (error) {
      console.error(`Error processing files for ${entityType} ${entityId}:`, error)
      throw error
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const processor = new AffinityFileProcessor()
    
    if (req.method === 'POST') {
      const { entityId, entityType } = await req.json()
      
      if (!entityId || !entityType) {
        throw new Error('entityId and entityType are required')
      }

      await processor.processAllFilesForEntity(entityId, entityType)

      return new Response(
        JSON.stringify({
          success: true,
          message: `Successfully processed files for ${entityType} ${entityId}`
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Only POST method is supported'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 405,
        }
      )
    }
  } catch (error) {
    console.error('File processor error:', error)
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
      }
    )
  }
})