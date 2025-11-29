import { NextRequest, NextResponse } from 'next/server';
// import Neo4jMigration from '../../../scripts/migrate-to-neo4j';

export async function POST(request: NextRequest) {
  try {
    // Temporarily disabled - use npm run migrate:neo4j instead
    return NextResponse.json({
      success: false,
      message: 'Migration endpoint temporarily disabled. Please use: npm run migrate:neo4j'
    }, { status: 501 });

    // console.log('🚀 Starting Neo4j migration via API...');
    // const migration = new Neo4jMigration();
    // await migration.migrate();
    // return NextResponse.json({
    //   success: true,
    //   message: 'Migration completed successfully'
    // });

  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json({
      success: false,
      message: 'Migration failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
