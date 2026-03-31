/* src/hooks/useVaultLogs.js */
import { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const useVaultLogs = () => {
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/logs`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        // Normalize for UI
        const normalized = data.logs.map(l => ({
          id: l.id,
          action: l.status,
          time: l.timestamp,
          isSuccess: l.flag === '1'
        })).reverse().slice(0, 10);

        setLogs(normalized);
        setIsConnected(true);
      } catch (err) {
        setIsConnected(false);
      }
    };

    const interval = setInterval(fetchLogs, 2000);
    fetchLogs(); // Initial fetch
    return () => clearInterval(interval);
  }, []);

  return { logs, isConnected };
};

export default useVaultLogs;
