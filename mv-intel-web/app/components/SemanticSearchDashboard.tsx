'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Search, Filter, Calendar, Globe, Briefcase, Tag, Zap } from 'lucide-react';

interface SearchResult {
    id: string;
    name: string;
    type: string;
    similarity: number;
    domain?: string;
    industry?: string;
    description?: string;
    ai_summary?: string;
    taxonomy?: string;
    location_country?: string;
    location_city?: string;
    updated_at?: string;
    importance?: number;
}

interface SearchFilters {
    countries?: string[];
    industries?: string[];
    types?: string[];
    taxonomy?: string[];
    dateRange?: {
        start?: string;
        end?: string;
    };
}

export default function SemanticSearchDashboard() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [activeFilters, setActiveFilters] = useState<SearchFilters>({});

    // Filter inputs state
    const [countryInput, setCountryInput] = useState('');
    const [industryInput, setIndustryInput] = useState('');
    const [typeInput, setTypeInput] = useState('');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');

    const handleSearch = async () => {
        if (!query.trim()) return;

        setLoading(true);
        setError(null);

        try {
            // Construct filters
            const filters: SearchFilters = {};
            if (countryInput.trim()) filters.countries = countryInput.split(',').map(s => s.trim());
            if (industryInput.trim()) filters.industries = industryInput.split(',').map(s => s.trim());
            if (typeInput.trim()) filters.types = [typeInput.trim()];
            if (dateStart || dateEnd) {
                filters.dateRange = {
                    start: dateStart || undefined,
                    end: dateEnd || undefined
                };
            }

            const response = await fetch('/api/semantic-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    filters,
                    limit: 20
                })
            });

            const data = await response.json();

            if (data.success) {
                setResults(data.results);
                // Update active filters from response (which includes auto-detected taxonomy)
                setActiveFilters(data.filters || {});
            } else {
                setError(data.message || 'Search failed');
            }
        } catch (err) {
            console.error('Search error:', err);
            setError('An error occurred while searching');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div className="space-y-6 p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Semantic Search
                </h1>
                <p className="text-muted-foreground">
                    Search companies and contacts using natural language and advanced filters.
                </p>
            </div>

            {/* Search Bar & Filters */}
            <Card className="glass-panel">
                <CardContent className="pt-6">
                    <div className="flex flex-col space-y-4">
                        <div className="flex gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                                <Input
                                    placeholder="e.g., 'Payment gateways in Germany' or 'Wealthtech companies founded recently'"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    className="pl-10 text-lg py-6"
                                />
                            </div>
                            <Button
                                onClick={handleSearch}
                                disabled={loading}
                                className="h-auto px-8 text-lg"
                            >
                                {loading ? 'Searching...' : 'Search'}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setShowFilters(!showFilters)}
                                className="h-auto px-4"
                            >
                                <Filter className="h-5 w-5 mr-2" />
                                Filters
                            </Button>
                        </div>

                        {/* Collapsible Filters */}
                        {showFilters && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-2">
                                <div className="space-y-2">
                                    <Label>Country</Label>
                                    <Input
                                        placeholder="e.g. Germany, UK"
                                        value={countryInput}
                                        onChange={(e) => setCountryInput(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Industry</Label>
                                    <Input
                                        placeholder="e.g. Fintech, SaaS"
                                        value={industryInput}
                                        onChange={(e) => setIndustryInput(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Type</Label>
                                    <Input
                                        placeholder="e.g. Organization, Person"
                                        value={typeInput}
                                        onChange={(e) => setTypeInput(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Updated After</Label>
                                    <Input
                                        type="date"
                                        value={dateStart}
                                        onChange={(e) => setDateStart(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Active Filters Display */}
                        {Object.keys(activeFilters).length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                                {activeFilters.countries?.map(c => (
                                    <Badge key={c} variant="secondary" className="flex items-center gap-1">
                                        <Globe className="h-3 w-3" /> {c}
                                    </Badge>
                                ))}
                                {activeFilters.industries?.map(i => (
                                    <Badge key={i} variant="secondary" className="flex items-center gap-1">
                                        <Briefcase className="h-3 w-3" /> {i}
                                    </Badge>
                                ))}
                                {activeFilters.taxonomy?.map(t => (
                                    <Badge key={t} className="bg-purple-500/20 text-purple-200 flex items-center gap-1 border-purple-500/50">
                                        <Tag className="h-3 w-3" /> {t}
                                    </Badge>
                                ))}
                                {activeFilters.dateRange?.start && (
                                    <Badge variant="outline" className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" /> Since {activeFilters.dateRange.start}
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Error Message */}
            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-200">
                    {error}
                </div>
            )}

            {/* Results Grid */}
            <div className="grid grid-cols-1 gap-4">
                {results.map((result) => (
                    <Card key={result.id} className="hover:bg-white/5 transition-colors border-white/10">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start">
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-xl font-semibold text-blue-300">{result.name}</h3>
                                        <Badge variant="outline" className="text-xs uppercase tracking-wider">
                                            {result.type}
                                        </Badge>
                                        {result.location_country && (
                                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                                                <Globe className="h-3 w-3" /> {result.location_city ? `${result.location_city}, ` : ''}{result.location_country}
                                            </span>
                                        )}
                                    </div>

                                    {/* AI Summary or Description */}
                                    <p className="text-gray-300 leading-relaxed">
                                        {result.ai_summary || result.description || 'No description available.'}
                                    </p>

                                    {/* Metadata Tags */}
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {result.industry && result.industry.split(';').map((ind, i) => (
                                            <Badge key={i} variant="secondary" className="bg-blue-500/10 text-blue-200 border-blue-500/20">
                                                {ind.trim()}
                                            </Badge>
                                        ))}
                                        {result.taxonomy && (
                                            <Badge variant="secondary" className="bg-purple-500/10 text-purple-200 border-purple-500/20">
                                                {result.taxonomy}
                                            </Badge>
                                        )}
                                        {result.domain && (
                                            <a
                                                href={`https://${result.domain}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm text-blue-400 hover:underline flex items-center gap-1"
                                            >
                                                {result.domain}
                                            </a>
                                        )}
                                    </div>
                                </div>

                                {/* Score Badge */}
                                <div className="flex flex-col items-end gap-2 ml-4">
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground" title="Similarity Score">
                                        <Zap className="h-4 w-4 text-yellow-400" />
                                        {(result.similarity * 100).toFixed(1)}%
                                    </div>
                                    {result.updated_at && (
                                        <div className="text-xs text-muted-foreground">
                                            Updated: {new Date(result.updated_at).toLocaleDateString()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {results.length === 0 && !loading && query && !error && (
                    <div className="text-center py-12 text-muted-foreground">
                        No results found. Try adjusting your query or filters.
                    </div>
                )}
            </div>
        </div>
    );
}
