import neo4j from 'neo4j-driver';

// Neo4j connection configuration
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

let driver: any = null;

function getDriver() {
  if (driver) return driver;

  if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
    // Only throw in development or if actually needed, don't crash build
    if (process.env.NODE_ENV === 'production' && typeof window === 'undefined' && process.env.NEXT_PHASE !== 'phase-production-build') {
        console.warn('Missing Neo4j environment variables. Neo4j features will be disabled.');
        return null;
    }
    // During build or if missing vars, we might want to return a mock or null to avoid crash
    return null;
  }

  driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    {
      maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
    }
  );
  return driver;
}

// Ensure driver is initialized if possible, but don't crash top-level if not
try {
    getDriver();
} catch (e) {
    console.warn('Failed to initialize Neo4j driver:', e);
}

// Test connection function
export async function testNeo4jConnection(): Promise<boolean> {
  const drv = getDriver();
  if (!drv) return false;
  
  const session = drv.session({ database: NEO4J_DATABASE });
  
  try {
    const result = await session.run('RETURN 1 as test');
    console.log('✅ Neo4j connection successful');
    return true;
  } catch (error) {
    console.error('❌ Neo4j connection failed:', error);
    return false;
  } finally {
    await session.close();
  }
}

// Get database info
export async function getNeo4jInfo() {
  const drv = getDriver();
  if (!drv) return null;

  const session = drv.session({ database: NEO4J_DATABASE });
  
  try {
    // Get node count
    const nodeResult = await session.run('MATCH (n) RETURN count(n) as nodeCount');
    const nodeCount = nodeResult.records[0].get('nodeCount').toNumber();
    
    // Get relationship count
    const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) as relCount');
    const relCount = relResult.records[0].get('relCount').toNumber();
    
    // Get database size
    const sizeResult = await session.run('CALL dbms.queryJmx("org.neo4j:instance=kernel#0,name=Store file sizes") YIELD attributes RETURN attributes');
    
    return {
      nodeCount,
      relCount,
      database: NEO4J_DATABASE,
      uri: (NEO4J_URI || '').replace(/\/\/.*@/, '//***@') // Hide credentials
    };
  } catch (error) {
    console.error('Error getting Neo4j info:', error);
    return null;
  } finally {
    await session.close();
  }
}

// Close driver (call this when shutting down the app)
export function closeNeo4jDriver() {
  if (driver) {
    return driver.close();
  }
  return Promise.resolve();
}

export { driver, getDriver, NEO4J_DATABASE };
