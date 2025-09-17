#!/usr/bin/env node

/**
 * Test script for update-master.js
 *
 * Creates sample analysis results and tests the update process
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create test analysis results with RAW data (including qod-provisioning)
const testResults = [
  {
    repository: "QualityOnDemand",
    release_tag: "r1.1",
    release_date: "2024-07-15T10:00:00Z",
    github_url: "https://github.com/camaraproject/QualityOnDemand/releases/tag/r1.1",
    apis: [
      {
        api_name: "quality-on-demand",
        file_name: "quality-on-demand",
        version: "0.11.0",
        title: "Quality on Demand API",
        commonalities: "0.4"
      },
      {
        api_name: "qod-provisioning",  // RAW name from server URL
        file_name: "qod-provisioning",
        version: "0.1.0",
        title: "QoD Provisioning API",
        commonalities: "0.4"
      },
      {
        api_name: "qos-profiles",
        file_name: "qos-profiles",
        version: "0.11.0",
        title: "QoS Profiles API",
        commonalities: "0.4"
      }
    ]
  },
  {
    repository: "DeviceRoamingStatus",
    release_tag: "r1.2",
    release_date: "2024-09-12T14:30:00Z",
    github_url: "https://github.com/camaraproject/DeviceRoamingStatus/releases/tag/r1.2",
    apis: [
      {
        api_name: "device-roaming-status",
        file_name: "device-roaming-status",
        version: "0.6.1",
        title: "Device Roaming Status API",
        commonalities: "0.4"
      }
    ]
  },
  {
    repository: "WebRTC",
    release_tag: "r2.1",
    release_date: "2025-01-10T09:15:00Z",
    github_url: "https://github.com/camaraproject/WebRTC/releases/tag/r2.1",
    apis: [
      {
        api_name: "webrtc-session",
        file_name: "webrtc-session",
        version: "0.3.0",
        title: "WebRTC Session API",
        commonalities: "0.4"
      },
      {
        api_name: "webrtc-signaling",
        file_name: "webrtc-signaling",
        version: "0.2.0",
        title: "WebRTC Signaling API",
        commonalities: "0.4"
      },
      {
        api_name: "webrtc-media",
        file_name: "webrtc-media",
        version: "0.2.0",
        title: "WebRTC Media API",
        commonalities: "0.4"
      }
    ]
  }
];

// Write test data
const testFile = path.join(__dirname, '..', 'temp', 'test-analysis-results.json');
const tempDir = path.dirname(testFile);

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

fs.writeFileSync(testFile, JSON.stringify(testResults, null, 2));
console.log('Created test analysis results file');

// Run update-master script
console.log('\nRunning update-master.js in full mode...\n');
try {
  const output = execSync(`node ${path.join(__dirname, 'update-master.js')} --mode full --input ${testFile}`, {
    encoding: 'utf8'
  });
  console.log(output);
} catch (error) {
  console.error('Error running update-master:', error.message);
  process.exit(1);
}

console.log('\nTest completed. Check data/releases-master.yaml for results.');
console.log('Note: qod-provisioning should appear as RAW data (not corrected to qos-provisioning)');