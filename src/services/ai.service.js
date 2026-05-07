import axios from 'axios';

let lastStatus = null;
let pollInterval = null;

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';
let failureCount = 0;
const MAX_FAILURES = 3;

export const initAIServiceMonitor = (app) => {
  const io = app.get('io');

  const checkStatus = async () => {
    try {
      // Increased timeout to 5s to allow for deepface recognition spikes
      const response = await axios.get(`${AI_SERVICE_URL}/system/status`, { timeout: 5000 });
      const status = response.data;
      failureCount = 0; // Reset on success

      // Extract a simplified global status for the UI
      let displayStatus = "AI System Idle";
      let isError = false;

      if (!status.active) {
        displayStatus = "Scanning Paused (Global)";
      } else if (status.global_error) {
        displayStatus = status.global_error;
        isError = true;
      } else {
        const camIndices = Object.keys(status.cameras || {});
        if (camIndices.length > 0) {
          // Priority 1: Check for hardware errors
          const errorCam = camIndices.find(idx => status.cameras[idx].status === "Camera Error");
          if (errorCam) {
            displayStatus = status.cameras[errorCam].error || "Camera Access Failed";
            isError = true;
          } else {
            // Priority 2: Check for active scanning
            const activeScanner = camIndices.find(idx => status.cameras[idx].is_scanning);
            if (activeScanner) {
              const cam = status.cameras[activeScanner];
              if (cam.status === "Recognition Failed") {
                displayStatus = `Scanning Error: ${cam.error}`;
                isError = true;
              } else {
                displayStatus = "AI Scanning Active";
              }
            } else {
              displayStatus = "Camera Feed Online (Scanning Paused)";
            }
          }
        } else if (status.active_sessions > 0) {
          displayStatus = "Initializing Cameras...";
        }
      }

      const currentStatus = {
        online: true,
        displayStatus,
        isError,
        details: status
      };

      // Broadcast if changed
      if (JSON.stringify(currentStatus) !== JSON.stringify(lastStatus)) {
        lastStatus = currentStatus;
        if (io) io.emit('ai_status_update', currentStatus);
        console.log(`[AI-Monitor] Status updated: ${displayStatus}`);
      }

    } catch (err) {
      failureCount++;
      
      // Only mark as offline if we hit the threshold
      if (failureCount >= MAX_FAILURES) {
        const currentStatus = {
          online: false,
          displayStatus: "AI Service Offline",
          isError: true,
          details: { error: err.message, attempts: failureCount }
        };

        if (JSON.stringify(currentStatus) !== JSON.stringify(lastStatus)) {
          lastStatus = currentStatus;
          if (io) io.emit('ai_status_update', currentStatus);
          console.warn(`[AI-Monitor] AI Service is confirmed OFFLINE: ${err.message}`);
        }
      } else {
          // Intermediate state to prevent flickering
          console.log(`[AI-Monitor] Missed a heartbeat (${failureCount}/${MAX_FAILURES})`);
          if (lastStatus && lastStatus.online && lastStatus.displayStatus !== "AI Service Lagging...") {
              lastStatus = { ...lastStatus, displayStatus: "AI Service Lagging..." };
              if (io) io.emit('ai_status_update', lastStatus);
          }
      }
    }
  };

  // Start polling
  pollInterval = setInterval(checkStatus, 5000);
  checkStatus(); // Initial check

  console.log('AI Health Monitoring Service Initialized.');
};

export const getLatestAIStatus = () => lastStatus;
