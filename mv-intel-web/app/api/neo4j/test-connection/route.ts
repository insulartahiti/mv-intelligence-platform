import { NextRequest, NextResponse } from 'next/server';
import { testNeo4jConnection, getNeo4jInfo } from '../../../../lib/neo4j';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Testing Neo4j connection...');
    
    // Test connection
    const isConnected = await testNeo4jConnection();
    
    if (!isConnected) {
      return NextResponse.json({
        success: false,
        message: 'Failed to connect to Neo4j',
        error: 'Connection test failed'
      }, { status: 500 });
    }

    // Get database info
    const info = await getNeo4jInfo();
    
    return NextResponse.json({
      success: true,
      message: 'Neo4j connection successful',
      data: info
    });

  } catch (error) {
    console.error('Neo4j connection test failed:', error);
    return NextResponse.json({
      success: false,
      message: 'Neo4j connection test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
