import { spawn } from 'child_process';
import path from 'path';
import axios from 'axios';

let cameraProcess = null;
const CAMERA_BACKEND_PORT = 8002;
const CAMERA_BACKEND_URL = `http://localhost:${CAMERA_BACKEND_PORT}`;

export const initCameraBackend = () => {
  console.log('[Camera-Backend] Initializing...');

  const startProcess = () => {
    // Path to the python script
    const scriptPath = path.resolve('..', 'Merge_AI', 'camera_backend.py');
    
    console.log(`[Camera-Backend] Spawning process: python ${scriptPath}`);
    
    cameraProcess = spawn('python', [scriptPath, CAMERA_BACKEND_PORT.toString()], {
      stdio: 'inherit',
      shell: true
    });

    cameraProcess.on('close', (code) => {
      console.error(`[Camera-Backend] Process exited with code ${code}. Restarting in 5s...`);
      cameraProcess = null;
      setTimeout(startProcess, 5000);
    });

    cameraProcess.on('error', (err) => {
      console.error('[Camera-Backend] Failed to start process:', err);
    });
  };

  startProcess();
};

export const getCameraBackendStatus = async () => {
  try {
    const resp = await axios.get(`${CAMERA_BACKEND_URL}/health`, { timeout: 1000 });
    return { online: true, ...resp.data };
  } catch (err) {
    return { online: false, error: err.message };
  }
};
