#!/usr/bin/env node

/**
 * Extension Version Management Script
 * 
 * This script helps manage extension versions and update the configuration
 * when new versions are released.
 * 
 * Usage:
 *   node scripts/manage-extension-versions.js --version 1.1.0 --changes "New feature" "Bug fix"
 *   node scripts/manage-extension-versions.js --list
 *   node scripts/manage-extension-versions.js --current
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../lib/extensionConfig.ts');

function readConfig() {
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    return content;
  } catch (error) {
    console.error('Error reading config file:', error.message);
    process.exit(1);
  }
}

function writeConfig(content) {
  try {
    fs.writeFileSync(CONFIG_PATH, content, 'utf8');
    console.log('✅ Configuration updated successfully');
  } catch (error) {
    console.error('Error writing config file:', error.message);
    process.exit(1);
  }
}

function addNewVersion(version, changes, date = new Date().toISOString().split('T')[0]) {
  const config = readConfig();
  
  // Create new version entry
  const newVersion = `    {
      version: '${version}',
      date: '${date}',
      changes: [
        ${changes.map(change => `'${change}'`).join(',\n        ')}
      ],
      downloadUrl: '/chrome-extension/mv-intel-extension-v${version}.crx',
      minChromeVersion: '88',
      breakingChanges: false
    }`;
  
  // Find the versions array and add new version
  const versionsRegex = /versions: \[([\s\S]*?)\]/;
  const match = config.match(versionsRegex);
  
  if (!match) {
    console.error('Could not find versions array in config');
    process.exit(1);
  }
  
  const versionsContent = match[1];
  const newVersionsContent = versionsContent + ',\n' + newVersion;
  
  // Update the config
  const newConfig = config.replace(versionsRegex, `versions: [${newVersionsContent}]`);
  
  // Update latest version
  const latestVersionRegex = /latestVersion: '([^']+)'/;
  const newConfigWithLatest = newConfig.replace(latestVersionRegex, `latestVersion: '${version}'`);
  
  writeConfig(newConfigWithLatest);
  
  console.log(`✅ Added version ${version} with ${changes.length} changes`);
}

function listVersions() {
  const config = readConfig();
  const versionsRegex = /version: '([^']+)'/g;
  const versions = [];
  let match;
  
  while ((match = versionsRegex.exec(config)) !== null) {
    versions.push(match[1]);
  }
  
  console.log('📋 Available versions:');
  versions.forEach(version => {
    console.log(`  - ${version}`);
  });
}

function showCurrentVersion() {
  const config = readConfig();
  const currentMatch = config.match(/currentVersion: '([^']+)'/);
  const latestMatch = config.match(/latestVersion: '([^']+)'/);
  
  if (currentMatch && latestMatch) {
    console.log(`📊 Current version: ${currentMatch[1]}`);
    console.log(`🚀 Latest version: ${latestMatch[1]}`);
    
    if (currentMatch[1] !== latestMatch[1]) {
      console.log('⚠️  Update available!');
    } else {
      console.log('✅ Up to date');
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case '--version':
    case '-v':
      const version = args[1];
      const changes = args.slice(2);
      
      if (!version || changes.length === 0) {
        console.error('Usage: --version <version> <change1> <change2> ...');
        process.exit(1);
      }
      
      addNewVersion(version, changes);
      break;
      
    case '--list':
    case '-l':
      listVersions();
      break;
      
    case '--current':
    case '-c':
      showCurrentVersion();
      break;
      
    default:
      console.log(`
🔧 Extension Version Management Script

Usage:
  node scripts/manage-extension-versions.js --version <version> <change1> <change2> ...
  node scripts/manage-extension-versions.js --list
  node scripts/manage-extension-versions.js --current

Examples:
  node scripts/manage-extension-versions.js --version 1.1.0 "Added dark mode" "Fixed slide capture bug"
  node scripts/manage-extension-versions.js --list
  node scripts/manage-extension-versions.js --current
      `);
      break;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  addNewVersion,
  listVersions,
  showCurrentVersion
};

