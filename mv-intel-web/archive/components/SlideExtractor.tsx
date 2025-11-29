'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, Image, Download, Trash2, Eye, Search } from 'lucide-react';
import { makeBrowserClient } from '@/lib/supabaseClient';

interface Slide {
  id: string;
  slide_index: number;
  image_url: string;
  width_px: number;
  height_px: number;
  ocr_text: string;
  created_at: string;
}

interface Artifact {
  id: string;
  title: string;
  source: string;
  summary: any;
  pdf_url: string;
  affinity_push_status: string;
}

export default function SlideExtractor() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentArtifact, setCurrentArtifact] = useState<Artifact | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [companies, setCompanies] = useState<Array<{id: string, name: string}>>([]);

  const supabase = makeBrowserClient();

  // Fetch companies for selection
  const fetchCompanies = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  }, [supabase]);

  // Handle file upload
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedCompany) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Create artifact record
      const artifactData = {
        org_id: '550e8400-e29b-41d4-a716-446655440001', // Master Ventures org
        owner_id: '550e8400-e29b-41d4-a716-446655440002', // Test user
        source: 'deck_capture',
        source_url: `file://${file.name}`,
        title: file.name.replace('.pdf', ''),
        summary: { summary: `PDF deck: ${file.name}` },
        pdf_url: '', // Will be updated after upload
        affinity_push_status: 'PENDING',
        affinity_external_ids: {},
        dedupe_key: `deck_${Date.now()}`,
      };

      const { data: artifact, error: artifactError } = await supabase
        .from('artifacts')
        .insert(artifactData)
        .select()
        .single();

      if (artifactError) throw artifactError;

      setCurrentArtifact(artifact);
      setUploadProgress(50);

      // Simulate file processing (in real implementation, this would upload to storage)
      await new Promise(resolve => setTimeout(resolve, 2000));
      setUploadProgress(100);

      // Simulate slide extraction
      await extractSlides(artifact.id, file);

    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [selectedCompany, supabase]);

  // Extract slides from PDF
  const extractSlides = useCallback(async (artifactId: string, file: File) => {
    setIsProcessing(true);
    
    try {
      // Simulate slide extraction process
      const mockSlides = [
        {
          id: `slide_${Date.now()}_1`,
          slide_index: 1,
          image_url: '/api/slides/placeholder/1',
          width_px: 1920,
          height_px: 1080,
          ocr_text: 'Welcome to our Series A Pitch Deck',
          created_at: new Date().toISOString(),
        },
        {
          id: `slide_${Date.now()}_2`,
          slide_index: 2,
          image_url: '/api/slides/placeholder/2',
          width_px: 1920,
          height_px: 1080,
          ocr_text: 'Market Opportunity: $10B TAM',
          created_at: new Date().toISOString(),
        },
        {
          id: `slide_${Date.now()}_3`,
          slide_index: 3,
          image_url: '/api/slides/placeholder/3',
          width_px: 1920,
          height_px: 1080,
          ocr_text: 'Business Model & Revenue Streams',
          created_at: new Date().toISOString(),
        },
      ];

      // Insert slides into database
      for (const slide of mockSlides) {
        await supabase
          .from('slides')
          .insert({
            artifact_id: artifactId,
            ...slide,
          });
      }

      setSlides(mockSlides);

      // Create activity record
      await supabase
        .from('activities')
        .insert({
          org_id: '550e8400-e29b-41d4-a716-446655440001',
          artifact_id: artifactId,
          verb: 'deck_processed',
          meta: {
            slides_extracted: mockSlides.length,
            company: companies.find(c => c.id === selectedCompany)?.name,
          },
        });

    } catch (error) {
      console.error('Slide extraction error:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [supabase, companies, selectedCompany]);

  // Search through slides
  const filteredSlides = slides.filter(slide =>
    slide.ocr_text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Load companies on component mount
  useState(() => {
    fetchCompanies();
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">Slide Extractor</h1>
        <p className="text-gray-600">Upload PDF decks and extract slides with OCR and AI analysis</p>
      </header>

      {/* Upload Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Upload Deck</h2>
        
        <div className="space-y-4">
          {/* Company Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Company
            </label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a company...</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PDF Deck
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={!selectedCompany || isUploading}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center"
              >
                <Upload className="h-12 w-12 text-gray-400 mb-4" />
                <span className="text-lg font-medium text-gray-900">
                  {isUploading ? 'Processing...' : 'Click to upload PDF'}
                </span>
                <span className="text-sm text-gray-500 mt-2">
                  PDF files only, max 50MB
                </span>
              </label>
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {/* Processing Status */}
          {isProcessing && (
            <div className="flex items-center justify-center text-blue-600">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2" />
              Extracting slides and running OCR...
            </div>
          )}
        </div>
      </div>

      {/* Current Artifact Info */}
      {currentArtifact && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Current Deck</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Title</p>
              <p className="font-medium">{currentArtifact.title}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="font-medium">{currentArtifact.affinity_push_status}</p>
            </div>
          </div>
        </div>
      )}

      {/* Slides Display */}
      {slides.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Extracted Slides ({slides.length})</h2>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search slides..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSlides.map((slide) => (
              <div key={slide.id} className="border border-gray-200 rounded-lg p-4">
                <div className="aspect-video bg-gray-100 rounded mb-3 flex items-center justify-center">
                  <Image className="h-8 w-8 text-gray-400" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-900">
                      Slide {slide.slide_index}
                    </span>
                    <div className="flex space-x-1">
                      <button className="p-1 hover:bg-gray-100 rounded">
                        <Eye className="h-4 w-4 text-gray-600" />
                      </button>
                      <button className="p-1 hover:bg-gray-100 rounded">
                        <Download className="h-4 w-4 text-gray-600" />
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {slide.ocr_text}
                  </p>
                  
                  <div className="text-xs text-gray-500">
                    {slide.width_px} × {slide.height_px}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <FileText className="h-5 w-5 text-blue-600 mr-2" />
            <span className="text-sm font-medium">View All Decks</span>
          </button>
          
          <button className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Search className="h-5 w-5 text-green-600 mr-2" />
            <span className="text-sm font-medium">Search Content</span>
          </button>
          
          <button className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="h-5 w-5 text-purple-600 mr-2" />
            <span className="text-sm font-medium">Export Data</span>
          </button>
          
          <button className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Trash2 className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-sm font-medium">Clear All</span>
          </button>
        </div>
      </div>
    </div>
  );
}
