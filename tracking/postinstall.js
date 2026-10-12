const https = require('https');

// Load package.json of the Project
let projectPackageJson;
try {
  projectPackageJson = require(process.env.INIT_CWD + '/package.json');
} catch (error) {
  console.error(
    'FEDEV Analytics Tracking: Error retrieving package.json of the project'
  );
  console.error('FEDEV Analytics Tracking: Exiting process');
  process.exit();
}

// Collect dependencies and other project information
const { name, version, dependencies, devDependencies } = projectPackageJson;
const packageName = '@company-name-fedev/boilerplate';

const data = {
  projectName: name,
  projectVersion: version,
  angularVersion: dependencies['@angular/core'] || '',
  dependencies: dependencies,
  devDependencies: devDependencies,
  usesTemplate: true,
  packageName: packageName,
  packageVersion: '',
};

const jsonData = JSON.stringify(data);

// Define the request options
const options = {
  host: 'analytics-api-fedevanalytics-prod-2y2i.scp.eu-central-1.aws.cloud.company-name',
  path: '/api/v1/projects',
  method: 'POST',
  rejectUnauthorized: false,
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(jsonData),
  },
};

// Send the request
const req = https.request(options, (res) => {
  res.on('data', (d) => process.stdout.write(d));
});

// Set a timeout for the request
const requestTimeout = 8000;
setTimeout(() => req.destroy(), requestTimeout);

// Handle errors and response from the request
const trackingDocumentationURL =
  'https://developer-home.company-namegroup.net/docs/fedev-documentation/5_faq/_1_analytics-tracking/';

req.on('error', (error) => {
  let errorString =
    typeof error === 'object' ? JSON.stringify(error) : String(error);

  errorString
    .normalize('NFKC') // Normalize Unicode to standard form
    .replace(/[\r\n\t\f\v\u0000-\u001F\u007F]+/g, ' ') // Strip line breaks and control chars
    .replace(/[^\x20-\x7E]+/g, '') // Remove non-printable ASCII
    .replace(/[%<>()[\]{}"'`;]/g, '') // Strip log/HTML injection characters
    .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
    .trim(); // Remove surrounding whitespace

  console.warn(
    `FEDEV Analytics - tracking error. See more about the FEDEV Analytics tracking on ${trackingDocumentationURL}`
  );
});

req.on('response', (res) => {
  if (res.statusCode === 201) {
    console.info(
      'Successfully submitted application install to the FEDEV Analytics tracking'
    );
  } else {
    console.warn(
      `FEDEV Analytics - tracking error. See more about the FEDEV Analytics tracking on ${trackingDocumentationURL}`
    );
  }
});

// Write data and end the request
req.write(jsonData);
req.end();
