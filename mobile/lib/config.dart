// Single API base URL -- no dev/prod split exists yet (the backend's own
// dev.yml deploys straight to the same "prod" stack prod.yml does), and the
// web app resolves its /api/* calls against this same origin via CloudFront
// path routing. Revisit once a real dev/prod split exists on the backend.
const apiBaseUrl = 'https://pmp.celestialstudio.net';
