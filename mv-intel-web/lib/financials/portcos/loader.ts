import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { PortcoGuide } from './types';

const PORTCOS_DIR = path.join(process.cwd(), 'lib/financials/portcos');

export function loadPortcoGuide(slug: string): PortcoGuide {
  const guidePath = path.join(PORTCOS_DIR, slug, 'guide.yaml');
  
  if (!fs.existsSync(guidePath)) {
    throw new Error(`Guide not found for portco: ${slug} at ${guidePath}`);
  }

  try {
    const fileContent = fs.readFileSync(guidePath, 'utf-8');
    const guide = yaml.load(fileContent) as PortcoGuide;
    return guide;
  } catch (error) {
    console.error(`Failed to load guide for ${slug}:`, error);
    throw new Error(`Invalid YAML guide for ${slug}`);
  }
}

export function listConfiguredPortcos(): string[] {
  if (!fs.existsSync(PORTCOS_DIR)) return [];
  
  return fs.readdirSync(PORTCOS_DIR).filter(file => {
    return fs.statSync(path.join(PORTCOS_DIR, file)).isDirectory();
  });
}


