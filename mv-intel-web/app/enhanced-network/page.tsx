'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/Card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { 
  Network, 
  Users, 
  Target, 
  TrendingUp, 
  Search, 
  ExternalLink,
  Linkedin,
  Building,
  User,
  Zap,
  Loader2,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface NetworkInsights {
  totalEntities: number;
  totalConnections: number;
  wellConnectedEntities: number;
  influentialEntities: number;
  networkDensity: number;
  topInfluencers: Array<{
    id: string;
    name: string;
    influenceScore: number;
  }>;
  industryDistribution: Record<string, number>;
  connectionTypes: Record<string, number>;
}

interface IntroPath {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  path_data: {
    path: Array<{
      id: string;
      name: string;
      type: string;
      isInternal: boolean;
      isLinkedIn: boolean;
    }>;
    totalStrength: number;
    linkedinConnections: number;
    internalConnections: number;
    pathLength: number;
    qualityScore: number;
  };
  path_strength: number;
  quality_score: number;
  path_length: number;
  linkedin_connections: number;
  internal_connections: number;
  calculated_at: string;
}

interface TargetEntity {
  id: string;
  name: string;
  type: string;
  industry: string;
  isInternal: boolean;
  isPortfolio: boolean;
  isPipeline: boolean;
  isLinkedIn: boolean;
}

interface SystemStatus {
  embeddingCoverage: number;
  totalEntities: number;
  totalEdges: number;
  linkedinConnections: number;
  lastUpdated: string;
}

export default function EnhancedNetworkPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<TargetEntity | null>(null);
  const [introPaths, setIntroPaths] = useState<IntroPath[]>([]);
  const [networkInsights, setNetworkInsights] = useState<NetworkInsights | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingLinkedIn, setImportingLinkedIn] = useState(false);

  // Load system status on mount
  useEffect(() => {
    loadSystemStatus();
  }, []);

  const loadSystemStatus = async () => {
    try {
      const response = await fetch('/api/graph/system-status');
      const data = await response.json();
      if (data.success) {
        setSystemStatus(data.status);
      }
    } catch (err) {
      console.error('Error loading system status:', err);
    }
  };

  const searchForEntity = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // First, search for entities matching the query
      const searchResponse = await fetch(`/api/graph/semantic-search?query=${encodeURIComponent(searchQuery)}&limit=5`);
      const searchData = await searchResponse.json();
      
      if (searchData.results && searchData.results.length > 0) {
        const entity = searchData.results[0];
        setSelectedEntity(entity);
        await fetchIntroPaths(entity.id);
      } else {
        setError('No entities found matching your search');
      }
    } catch (err) {
      setError('Error searching for entities');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchIntroPaths = async (entityId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/graph/enhanced-intro-paths?targetEntityId=${entityId}&includeInsights=true&maxPaths=10&minStrength=0.3`);
      const data = await response.json();
      
      if (data.success) {
        setIntroPaths(data.introductionPaths);
        setNetworkInsights(data.networkInsights);
        setSelectedEntity(data.targetEntity);
      } else {
        setError('Failed to fetch introduction paths');
      }
    } catch (err) {
      setError('Error fetching introduction paths');
      console.error('Intro paths error:', err);
    } finally {
      setLoading(false);
    }
  };

  const importLinkedInData = async () => {
    setImportingLinkedIn(true);
    setError(null);
    
    try {
      const response = await fetch('/api/graph/import-linkedin', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        // Reload system status
        await loadSystemStatus();
        setError(null);
      } else {
        setError(data.error || 'Failed to import LinkedIn data');
      }
    } catch (err) {
      setError('Error importing LinkedIn data');
      console.error('LinkedIn import error:', err);
    } finally {
      setImportingLinkedIn(false);
    }
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'person': return <User className="h-4 w-4" />;
      case 'company': return <Building className="h-4 w-4" />;
      case 'organization': return <Network className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  const formatStrength = (strength: number) => {
    return `${(strength * 100).toFixed(1)}%`;
  };

  const getStrengthColor = (strength: number) => {
    if (strength >= 0.8) return 'bg-green-500';
    if (strength >= 0.6) return 'bg-yellow-500';
    if (strength >= 0.4) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Enhanced Network Intelligence</h1>
          <p className="text-muted-foreground">
            Advanced introduction path analysis and network mapping
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Network className="h-8 w-8 text-primary" />
        </div>
      </div>

      {/* System Status */}
      {systemStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>System Status</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{systemStatus.totalEntities.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Entities</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{systemStatus.totalEdges.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Network Edges</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{systemStatus.embeddingCoverage.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground">Embedding Coverage</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{systemStatus.linkedinConnections.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">LinkedIn Connections</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* LinkedIn Import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Linkedin className="h-5 w-5" />
            <span>LinkedIn Data Import</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Import your LinkedIn connections to enhance network analysis and introduction path discovery.
              </p>
              <p className="text-xs text-muted-foreground">
                Make sure Connections.csv is in the project root directory.
              </p>
            </div>
            <Button 
              onClick={importLinkedInData} 
              disabled={importingLinkedIn}
              className="flex items-center space-x-2"
            >
              {importingLinkedIn ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Linkedin className="h-4 w-4" />
              )}
              <span>{importingLinkedIn ? 'Importing...' : 'Import LinkedIn Data'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5" />
            <span>Find Introduction Paths</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <div className="flex-1">
              <Label htmlFor="search">Search for an entity</Label>
              <Input
                id="search"
                placeholder="Enter entity name, company, or person..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchForEntity()}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={searchForEntity} disabled={loading || !searchQuery.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Searching...
                  </>
                ) : (
                  'Search'
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-600">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Network Insights */}
      {networkInsights && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Network Insights</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{networkInsights.totalEntities}</div>
                <div className="text-sm text-muted-foreground">Total Entities</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{networkInsights.totalConnections}</div>
                <div className="text-sm text-muted-foreground">Connections</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{networkInsights.wellConnectedEntities}</div>
                <div className="text-sm text-muted-foreground">Well Connected</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {(networkInsights.networkDensity * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Network Density</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected Entity & Introduction Paths */}
      {selectedEntity && (
        <Tabs defaultValue="paths" className="space-y-4">
          <TabsList>
            <TabsTrigger value="paths">Introduction Paths</TabsTrigger>
            <TabsTrigger value="entity">Entity Details</TabsTrigger>
            <TabsTrigger value="network">Network Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="paths" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Target className="h-5 w-5" />
                  <span>Introduction Paths to {selectedEntity.name}</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {introPaths.length} paths found • Quality sorted by strength and LinkedIn connections
                </p>
              </CardHeader>
              <CardContent>
                {introPaths.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No introduction paths found for this entity</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {introPaths.map((path, index) => (
                      <Card key={path.id} className="border-l-4 border-l-primary">
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <Badge variant="outline">Path #{index + 1}</Badge>
                              <Badge className={getStrengthColor(path.path_strength)}>
                                {formatStrength(path.path_strength)}
                              </Badge>
                              <Badge variant="secondary">
                                {path.path_length} hops
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Quality: {path.quality_score.toFixed(2)}
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-sm">
                              <span className="font-medium">Path:</span>
                              <div className="flex items-center space-x-1">
                                {path.path_data.path.map((step, stepIndex) => (
                                  <React.Fragment key={step.id}>
                                    <div className="flex items-center space-x-1 px-2 py-1 bg-muted rounded">
                                      {getEntityIcon(step.type)}
                                      <span className="font-medium">{step.name}</span>
                                      {step.isInternal && <Badge size="sm">Internal</Badge>}
                                      {step.isLinkedIn && <Linkedin className="h-3 w-3 text-blue-600" />}
                                    </div>
                                    {stepIndex < path.path_data.path.length - 1 && (
                                      <span className="text-muted-foreground">→</span>
                                    )}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                              <div className="flex items-center space-x-1">
                                <Linkedin className="h-4 w-4" />
                                <span>{path.linkedin_connections} LinkedIn</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Users className="h-4 w-4" />
                                <span>{path.internal_connections} Internal</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  {getEntityIcon(selectedEntity.type)}
                  <span>{selectedEntity.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Type</Label>
                    <p className="font-medium">{selectedEntity.type}</p>
                  </div>
                  <div>
                    <Label>Industry</Label>
                    <p className="font-medium">{selectedEntity.industry || 'N/A'}</p>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <div className="flex space-x-2">
                      {selectedEntity.isInternal && <Badge>Internal</Badge>}
                      {selectedEntity.isPortfolio && <Badge variant="secondary">Portfolio</Badge>}
                      {selectedEntity.isPipeline && <Badge variant="outline">Pipeline</Badge>}
                      {selectedEntity.isLinkedIn && <Badge className="bg-blue-600">LinkedIn</Badge>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="network" className="space-y-4">
            {networkInsights && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Influencers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {networkInsights.topInfluencers.slice(0, 5).map((influencer, index) => (
                        <div key={influencer.id} className="flex items-center justify-between">
                          <span className="font-medium">{influencer.name}</span>
                          <Badge variant="outline">{influencer.influenceScore.toFixed(1)}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Industry Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(networkInsights.industryDistribution)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 5)
                        .map(([industry, count]) => (
                          <div key={industry} className="flex items-center justify-between">
                            <span className="font-medium">{industry}</span>
                            <Badge variant="secondary">{count}</Badge>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
