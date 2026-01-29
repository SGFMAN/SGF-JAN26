const fs = require('fs');
const path = require('path');

const rootPath = 'Z:\\1.SGF PROJECT MANAGEMENT\\2024\\VIC';
const photoSubfolder = path.join('5. PHOTOS - Progress Construcion , Pre-site', 'Pre-Construction -Site Photos');

function countFilesInDirectory(dirPath) {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    return items.filter(item => item.isFile()).length;
  } catch (error) {
    return 0; // Directory doesn't exist or can't be read
  }
}

function checkProjectFolders() {
  const projectsWithFewFiles = [];
  
  try {
    // Get all items in the root directory
    const items = fs.readdirSync(rootPath, { withFileTypes: true });
    
    // Filter for directories only (project folders)
    const projectFolders = items.filter(item => item.isDirectory());
    
    console.log(`Found ${projectFolders.length} project folders to check...\n`);
    
    // Check each project folder
    for (const folder of projectFolders) {
      const projectPath = path.join(rootPath, folder.name);
      const photoFolderPath = path.join(projectPath, photoSubfolder);
      
      const fileCount = countFilesInDirectory(photoFolderPath);
      
      if (fileCount < 7) {
        projectsWithFewFiles.push({
          project: folder.name,
          fileCount: fileCount,
          path: photoFolderPath
        });
        console.log(`✓ ${folder.name}: ${fileCount} files`);
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total projects checked: ${projectFolders.length}`);
    console.log(`Projects with < 7 files: ${projectsWithFewFiles.length}\n`);
    
    console.log(`\n=== PROJECTS WITH < 7 FILES ===`);
    if (projectsWithFewFiles.length === 0) {
      console.log('None - all projects have 7 or more files!');
    } else {
      projectsWithFewFiles.forEach((item, index) => {
        console.log(`${index + 1}. ${item.project} (${item.fileCount} files)`);
      });
    }
    
    return projectsWithFewFiles;
    
  } catch (error) {
    console.error('Error checking folders:', error);
    throw error;
  }
}

// Run the check
checkProjectFolders();
