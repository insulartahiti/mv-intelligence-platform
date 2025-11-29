import { NextResponse } from 'next/server';
import { driver, NEO4J_DATABASE } from '../../../../lib/neo4j';

export async function GET() {
    const session = driver.session({ database: NEO4J_DATABASE });

    try {
        const debug: any = {
            timestamp: new Date().toISOString(),
            database: NEO4J_DATABASE,
            checks: {}
        };

        // Check 1: Basic connectivity
        try {
            await session.run('RETURN 1 as test');
            debug.checks.connectivity = { status: 'OK', message: 'Successfully connected to Neo4j' };
        } catch (err: any) {
            debug.checks.connectivity = { status: 'FAILED', error: err.message };
            return NextResponse.json({ success: false, debug });
        }

        // Check 2: Total entity count
        try {
            const countResult = await session.run('MATCH (n:Entity) RETURN count(n) as total');
            const totalEntities = countResult.records[0]?.get('total').toNumber() || 0;
            debug.checks.totalEntities = { status: 'OK', count: totalEntities };
        } catch (err: any) {
            debug.checks.totalEntities = { status: 'FAILED', error: err.message };
        }

        // Check 3: Sample entities with importance
        try {
            const sampleResult = await session.run(`
        MATCH (n:Entity) 
        RETURN n.name as name, n.importance as importance, n.is_internal as is_internal, labels(n) as labels
        LIMIT 10
      `);
            debug.checks.sampleEntities = {
                status: 'OK',
                count: sampleResult.records.length,
                samples: sampleResult.records.map(r => ({
                    name: r.get('name'),
                    importance: r.get('importance'),
                    is_internal: r.get('is_internal'),
                    labels: r.get('labels')
                }))
            };
        } catch (err: any) {
            debug.checks.sampleEntities = { status: 'FAILED', error: err.message };
        }

        // Check 4: Importance distribution
        try {
            const distResult = await session.run(`
        MATCH (n:Entity)
        RETURN 
          count(CASE WHEN n.importance IS NULL THEN 1 END) as null_importance,
          count(CASE WHEN n.importance >= 0.05 THEN 1 END) as above_threshold,
          count(CASE WHEN n.importance < 0.05 THEN 1 END) as below_threshold,
          avg(n.importance) as avg_importance,
          min(n.importance) as min_importance,
          max(n.importance) as max_importance
      `);
            const record = distResult.records[0];
            debug.checks.importanceDistribution = {
                status: 'OK',
                null_importance: record?.get('null_importance').toNumber() || 0,
                above_threshold: record?.get('above_threshold').toNumber() || 0,
                below_threshold: record?.get('below_threshold').toNumber() || 0,
                avg_importance: record?.get('avg_importance'),
                min_importance: record?.get('min_importance'),
                max_importance: record?.get('max_importance')
            };
        } catch (err: any) {
            debug.checks.importanceDistribution = { status: 'FAILED', error: err.message };
        }

        // Check 5: Relationship count
        try {
            const relResult = await session.run('MATCH ()-[r:RELATES]->() RETURN count(r) as total');
            const totalRels = relResult.records[0]?.get('total').toNumber() || 0;
            debug.checks.totalRelationships = { status: 'OK', count: totalRels };
        } catch (err: any) {
            debug.checks.totalRelationships = { status: 'FAILED', error: err.message };
        }

        // Check 6: Internal entities
        try {
            const internalResult = await session.run(`
        MATCH (n:Entity)
        WHERE n.is_internal = true
        RETURN count(n) as total, collect(n.name)[0..5] as sample_names
      `);
            const record = internalResult.records[0];
            debug.checks.internalEntities = {
                status: 'OK',
                count: record?.get('total').toNumber() || 0,
                samples: record?.get('sample_names') || []
            };
        } catch (err: any) {
            debug.checks.internalEntities = { status: 'FAILED', error: err.message };
        }

        return NextResponse.json({
            success: true,
            debug
        });

    } catch (error: any) {
        console.error('Debug endpoint error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    } finally {
        await session.close();
    }
}
