import React, { useEffect, useRef } from "react";
import { PageProps } from "../../App";
import "./HelloWorldItem.scss";

export function HelloWorldItemEditor(props: PageProps) {
  const { workloadClient } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === "FABRIC_SIGN_IN_REQUEST") {
        console.log("📨 Received FABRIC_SIGN_IN_REQUEST from Accelerator iframe");
        try {
          // Acquire token silently from Fabric
          const authResult = await workloadClient.auth.acquireFrontendAccessToken({
            scopes: ["https://api.fabric.microsoft.com/.default"]
          });
          
          console.log("🔑 Fabric token acquired successfully:", authResult);
          
          if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              {
                type: "FABRIC_SIGN_IN_RESPONSE",
                token: authResult.token
              },
              "*"
            );
          }
        } catch (error: any) {
          console.error("❌ Failed to acquire Fabric token:", error);
          if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              {
                type: "FABRIC_SIGN_IN_ERROR",
                error: error.message || "Failed to acquire Fabric token"
              },
              "*"
            );
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [workloadClient]);

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}>
      <iframe
        ref={iframeRef}
        src="http://localhost:3000/"
        title="Fabric Solution Accelerator"
        allow="camera; microphone; geolocation; popups; popups-to-escape-sandbox"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          flex: 1
        }}
      />
    </div>
  );
}
