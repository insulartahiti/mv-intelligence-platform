'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/Card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/Button';
import { 
  Database, 
  Brain, 
  Network, 
  Users, 
  TrendingUp,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock
} from 'lucide-react';

interface SystemStatus {
  totalEntities: number;
  entitiesWithEmbeddings: number;
  embeddingCoverage: number;
  totalEdges: number;
  linkedinConnections: number;
  lastUpdated: string;
}

export default function SystemStatusDashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/graph/system-status');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.status);
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error('Error fetching system status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getCoverageColor = (coverage: number) => {
    if (coverage >= 80) return 'bg-green-500';
    if (coverage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getCoverageStatus = (coverage: number) => {
    if (coverage >= 80) return 'Excellent';
    if (coverage >= 50) return 'Good';
    if (coverage >= 20) return 'Improving';
    return 'Needs Attention';
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading system status...</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center p-8">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <span className="ml-2 text-red-500">Failed to load system status</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">System Status</h2>
          <p className="text-gray-600">Real-time intelligence platform metrics</p>
        </div>
        <div className="flex items-center space-x-4">
          {lastRefresh && (
            <div className="flex items-center text-sm text-gray-500">
              <Clock className="h-4 w-4 mr-1" />
              Last updated: {lastRefresh.toLocaleTimeString()}
            </div>
          )}
          <Button onClick={fetchStatus} disabled={loading} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Entities */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entities</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.totalEntities.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              People, companies, organizations
            </p>
          </CardContent>
        </Card>

        {/* Embedding Coverage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Coverage</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.embeddingCoverage.toFixed(1)}%</div>
            <div className="flex items-center space-x-2 mt-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${getCoverageColor(status.embeddingCoverage)}`}
                  style={{ width: `${Math.min(status.embeddingCoverage, 100)}%` }}
                />
              </div>
              <Badge variant={status.embeddingCoverage >= 50 ? 'default' : 'destructive'}>
                {getCoverageStatus(status.embeddingCoverage)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {status.entitiesWithEmbeddings.toLocaleString()} entities enhanced
            </p>
          </CardContent>
        </Card>

        {/* Network Connections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Network Edges</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.totalEdges.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Relationship connections
            </p>
          </CardContent>
        </Card>

        {/* LinkedIn Connections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">LinkedIn Network</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.linkedinConnections.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              First-degree connections
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Indicators */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Embedding Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Brain className="h-5 w-5 mr-2" />
              AI Enhancement Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Entities with AI embeddings</span>
                <span>{status.entitiesWithEmbeddings.toLocaleString()} / {status.totalEntities.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all duration-500 ${getCoverageColor(status.embeddingCoverage)}`}
                  style={{ width: `${Math.min(status.embeddingCoverage, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="h-5 w-5 mr-2" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Database Connection</span>
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Healthy
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">API Endpoints</span>
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Background Processes</span>
                <Badge variant={status.embeddingCoverage < 50 ? "destructive" : "default"}>
                  {status.embeddingCoverage < 50 ? (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Processing
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Complete
                    </>
                  )}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
