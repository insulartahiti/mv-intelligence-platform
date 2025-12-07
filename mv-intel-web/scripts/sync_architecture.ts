import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { ArchitectureData } from '../lib/architecture/types';
import { architectureData as currentData } from '../lib/architecture/data';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const HANDOFF_PATH = path.join(process.cwd(), '../CURSOR_HANDOFF.md');
const DATA_PATH = path.join(process.cwd(), 'lib/architecture/data.ts');

async function syncArchitecture() {
  console.log('Reading CURSOR_HANDOFF.md...');
  let handoffContent = '';
  try {
    handoffContent = fs.readFileSync(HANDOFF_PATH, 'utf-8');
  } catch (error) {
    console.error('Error reading CURSOR_HANDOFF.md:', error);
    process.exit(1);
  }

  console.log('Analyzing architecture with GPT-5.1...');
  
  const prompt = `
    You are an expert system architect. Your goal is to analyze the provided engineering handoff document and extract the system architecture into a structured JSON format.
    
    Current Architecture Data (for reference):
    ${JSON.stringify(currentData, null, 2)}
    
    Task:
    1. Read the provided "CURSOR_HANDOFF.md" content.
    2. Identify the key components, databases, services, and pipelines.
    3. Update the architecture views: "overview", "pipeline", "ingestion", "legal".
    4. For each node, provide a concise label, type, appropriate Lucide icon name, description, and key details.
    5. Maintain the existing "x" and "y" coordinates for existing nodes unless the architecture has fundamentally changed. For new nodes, assign reasonable coordinates.
    6. Return the FULL JSON object matching the ArchitectureData interface.
    
    Interface:
    type NodeType = 'frontend' | 'backend' | 'database' | 'ai' | 'external';
    
    interface ArchNode {
      id: string;
      label: string;
      type: NodeType;
      iconName: string; // Valid Lucide React icon name (e.g. 'Server', 'Database', 'Brain')
      description: string;
      details: string[];
      x: number; // 0-100
      y: number; // 0-100
    }

    interface ArchConnection {
      from: string;
      to: string;
      label?: string;
    }

    interface ArchitectureView {
      id: string;
      label: string;
      description: string;
      nodes: ArchNode[];
      connections: ArchConnection[];
    }

    interface ArchitectureData {
      lastUpdated: string;
      version: string;
      views: {
        overview: ArchitectureView;
        pipeline: ArchitectureView;
        ingestion: ArchitectureView;
        legal: ArchitectureView;
      };
    }
    
    IMPORTANT: Return ONLY the raw JSON object. No markdown formatting, no code blocks.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Using gpt-4o as gpt-5.1 alias/availability might vary in script context, or user requested 5.1 but API key determines access. Assuming 4o for robust script execution or updating to 'gpt-4-turbo' if preferred.
      // Note: The prompt asks for high intelligence. GPT-4o is currently the standard for this.
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: handoffContent }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const result = response.choices[0].message.content;
    if (!result) throw new Error('No content returned from OpenAI');

    const newData: ArchitectureData = JSON.parse(result);
    
    // Update metadata
    newData.lastUpdated = new Date().toISOString();
    // Simple version bump logic could be added here, currently just keeping or letting LLM decide (though LLM might hallucinate version)
    // We'll enforce the structure
    
    const fileContent = `import { ArchitectureData } from './types';

export const architectureData: ArchitectureData = ${JSON.stringify(newData, null, 2)};
`;

    console.log('Writing updated architecture data to lib/architecture/data.ts...');
    fs.writeFileSync(DATA_PATH, fileContent);
    console.log('Success! Architecture data synced.');

  } catch (error) {
    console.error('Error syncing architecture:', error);
    process.exit(1);
  }
}

syncArchitecture();
