const fs = require('fs').promises;
const path = require('path');

async function testDirectoryCreation() {
  try {
    console.log('Current directory:', process.cwd());
    
    // Create test directories
    await fs.mkdir('data/test_dir', { recursive: true });
    console.log('Created data/test_dir');
    
    // Write a test file
    await fs.writeFile('data/test_dir/test.txt', 'This is a test file');
    console.log('Wrote test file to data/test_dir/test.txt');
    
    // List data directory contents
    const dataDir = await fs.readdir('data');
    console.log('Contents of data directory:', dataDir);
    
    // List test directory contents
    const testDir = await fs.readdir('data/test_dir');
    console.log('Contents of data/test_dir:', testDir);
    
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Error during test:', error);
  }
}

testDirectoryCreation(); 