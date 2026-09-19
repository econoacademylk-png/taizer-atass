import { useEffect, useRef } from 'react';
import { runLEZScan } from '../stores/useLEZStore';

const SCAN_INTERVAL_MS = 25000; // Scan every 25 seconds for fresh signals

export function useLEZScanner() {
  const isRunningRef = useRef(false);

  useEffect(() => {
    // Prevent duplicate runners
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    // Run first scan shortly after mount
    const initialTimer = setTimeout(() => {
      runLEZScan();
    }, 2000);

    // Continuous interval
    const interval = setInterval(() => {
      runLEZScan();
    }, SCAN_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      isRunningRef.current = false;
    };
  }, []);
}
