import React, { useEffect, useState } from 'react';
import { WorkloadClientAPI } from '@ms-fabric/workload-client';
import { FabricLoader } from './FabricLoader';
import { App } from '../../app';
import { Toaster } from 'sonner';

// Keep track of the initialized client
export let workloadClient: WorkloadClientAPI | null = null;

export const FabricWrapper: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initializeFabric() {
      try {
        console.log('Initializing Fabric Workload Client...');
        
        // Ensure that we only initialize if running inside an iframe (Fabric portal)
        if (window.parent !== window) {
          workloadClient = WorkloadClientAPI.getInstance();
          await workloadClient.initialize();
          console.log('Fabric Workload Client successfully initialized.');
          
          // Optionally, fetch a token here and store it for your backend to use
          // const token = await workloadClient.auth.acquireAccessToken();
          // localStorage.setItem('access_token', token);
        } else {
          console.log('Not running in an iframe, bypassing Fabric initialization.');
        }

        setIsInitializing(false);
      } catch (err: any) {
        console.error('Failed to initialize Fabric Workload Client:', err);
        setError(err?.message || 'Failed to connect to Fabric portal.');
        setIsInitializing(false);
      }
    }

    initializeFabric();
  }, []);

  if (isInitializing) {
    return <FabricLoader />;
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Fabric Initialization Error</h2>
        <p>{error}</p>
        <p>Ensure this app is running inside the Microsoft Fabric iframe.</p>
      </div>
    );
  }

  // Once initialized, render the main application
  return (
    <>
      <App />
      <Toaster position="top-center" richColors closeButton />
    </>
  );
};
