import { LucideIcon } from 'lucide-react';

export type NodeType = 'frontend' | 'backend' | 'database' | 'ai' | 'external';

export interface ArchNode {
  id: string;
  label: string;
  type: NodeType;
  iconName: string; // Storing string name for serializability
  description: string;
  details: string[];
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
}

export interface ArchConnection {
  from: string;
  to: string;
  label?: string;
  description?: string;
}

export interface ArchitectureView {
  id: string;
  label: string;
  description: string;
  nodes: ArchNode[];
  connections: ArchConnection[];
}

export interface ArchitectureData {
  lastUpdated: string;
  version: string;
  views: {
    overview: ArchitectureView;
    pipeline: ArchitectureView;
    ingestion: ArchitectureView;
    legal: ArchitectureView;
  };
}
